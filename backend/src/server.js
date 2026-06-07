const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) return;

    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, '');
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

loadEnvFile();

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'geojson');
const AVAILABLE_FILES = new Set(['road', 'building', 'point', 'boundary', 'map-1.0']);

// Firebase Realtime Database config (use REST API)
const FIREBASE = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyAyccxaZ21dcb7jgHzvPrjZrLro-ro_Yh0",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "test1-7399f.firebaseapp.com",
  databaseURL: process.env.FIREBASE_DATABASE_URL || "https://test1-7399f-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: process.env.FIREBASE_PROJECT_ID || "test1-7399f",
  email: process.env.FIREBASE_EMAIL,
  password: process.env.FIREBASE_PASSWORD,
  gpsRoot: process.env.FIREBASE_GPS_ROOT || 'iot',
  gpsDevice: process.env.FIREBASE_GPS_DEVICE || '441D64F39AF0',
};

let firebaseAuthCache = null;

function readJsonFile(name) {
  const filePath = path.join(DATA_DIR, `${name}.geojson`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(text);
  } catch (err) {
    return null;
  }
}

function haversineDistance(a, b) {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const radLat1 = toRad(lat1);
  const radLat2 = toRad(lat2);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const aVal = sinDLat * sinDLat + sinDLon * sinDLon * Math.cos(radLat1) * Math.cos(radLat2);
  const c = 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
  return R * c;
}

function isValidLngLat(coord) {
  return Array.isArray(coord)
    && coord.length >= 2
    && Number.isFinite(Number(coord[0]))
    && Number.isFinite(Number(coord[1]));
}

function normalizeCoord(coord) {
  return [Number(coord[0]), Number(coord[1])];
}

function getCoordKey(coord) {
  const [lon, lat] = normalizeCoord(coord);
  return `coord:${lon.toFixed(6)},${lat.toFixed(6)}`;
}

function buildGraph(roadGeoJson) {
  const graph = new Map();

  function calculateTotalDistance(coords) {
    let totalDist = 0;
    for (let i = 0; i < coords.length - 1; i++) {
      totalDist += haversineDistance(coords[i], coords[i + 1]);
    }
    return totalDist;
  }

  function addEdge(from, to, coords) {
    const dist = calculateTotalDistance(coords);
    if (!graph.has(from)) graph.set(from, []);
    graph.get(from).push({ node: to, weight: dist, coords });
  }

  for (const feature of roadGeoJson.features || []) {
    if (!feature.properties || !feature.geometry || feature.geometry.type !== 'LineString') continue;
    const from = feature.properties.from;
    const to = feature.properties.to;
    const coords = feature.geometry.coordinates;
    if (!from || !to || !Array.isArray(coords)) continue;
    addEdge(from, to, coords);
    addEdge(to, from, [...coords].reverse());
  }

  return graph;
}

function buildCoordinateGraph(geoJson) {
  const graph = new Map();
  const aliases = new Map();
  const coordsByNode = new Map();

  function addNode(coord) {
    const normalized = normalizeCoord(coord);
    const key = getCoordKey(normalized);
    if (!graph.has(key)) graph.set(key, []);
    coordsByNode.set(key, normalized);
    return key;
  }

  function addEdge(fromCoord, toCoord) {
    const from = addNode(fromCoord);
    const to = addNode(toCoord);
    if (from === to) return;

    const coords = [coordsByNode.get(from), coordsByNode.get(to)];
    const weight = haversineDistance(coords[0], coords[1]);
    if (weight <= 0) return;

    graph.get(from).push({ node: to, weight, coords });
    graph.get(to).push({ node: from, weight, coords: [...coords].reverse() });
  }

  for (const feature of geoJson.features || []) {
    const geometry = feature.geometry;
    if (!geometry) continue;

    if (geometry.type === 'LineString' && Array.isArray(geometry.coordinates)) {
      const coords = geometry.coordinates.filter(isValidLngLat).map(normalizeCoord);
      for (let i = 0; i < coords.length - 1; i++) {
        addEdge(coords[i], coords[i + 1]);
      }
    }

    if (geometry.type === 'Point' && isValidLngLat(geometry.coordinates)) {
      const key = addNode(geometry.coordinates);
      const id = feature.properties?.id;
      if (typeof id === 'string' && id.trim() && !aliases.has(id.trim())) {
        aliases.set(id.trim(), key);
      }
    }
  }

  return { graph, aliases, coordsByNode };
}

function resolveGraphNode(input, graphData) {
  if (graphData.graph.has(input)) return input;
  return graphData.aliases.get(input) || null;
}

function dijkstra(graph, start, target) {
  const queue = [{ node: start, dist: 0 }];
  const distances = new Map([[start, 0]]);
  const previous = new Map();
  const visited = new Set();

  while (queue.length > 0) {
    queue.sort((a, b) => a.dist - b.dist);
    const current = queue.shift();
    if (visited.has(current.node)) continue;
    visited.add(current.node);
    if (current.node === target) break;

    const edges = graph.get(current.node) || [];
    for (const edge of edges) {
      const alt = current.dist + edge.weight;
      if (alt < (distances.get(edge.node) ?? Infinity)) {
        distances.set(edge.node, alt);
        previous.set(edge.node, { from: current.node, edge });
        queue.push({ node: edge.node, dist: alt });
      }
    }
  }

  if (!previous.has(target) && start !== target) return null;

  const path = [];
  let cursor = target;
  while (cursor !== start) {
    const step = previous.get(cursor);
    if (!step) break;
    path.unshift(step.edge);
    cursor = step.from;
  }
  return path;
}

function createRouteFeatureCollection(routeEdges) {
  return {
    type: 'FeatureCollection',
    features: routeEdges.map((edge) => ({
      type: 'Feature',
      properties: {
        from: edge.coords[0],
        to: edge.coords[edge.coords.length - 1],
      },
      geometry: {
        type: 'LineString',
        coordinates: edge.coords,
      },
    })),
  };
}

function sendJson(res, data, status = 200) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function requestJson(url, options = {}, payload = null) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const opts = {
      hostname: target.hostname,
      path: target.pathname + (target.search || ''),
      method: options.method || 'GET',
      headers: options.headers || {},
    };
    const body = payload ? JSON.stringify(payload) : null;
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = https.request(opts, (res) => {
      let responseBody = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (responseBody += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseBody || 'null');
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const message = parsed?.error?.message || parsed?.error || `HTTP ${res.statusCode}`;
            reject(new Error(message));
            return;
          }
          resolve(parsed);
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (body) req.write(body);
    req.end();
  });
}

async function getFirebaseIdToken() {
  if (!FIREBASE.apiKey) throw new Error('Firebase apiKey not configured');
  if (!FIREBASE.email || !FIREBASE.password) {
    throw new Error('Firebase email/password not configured. Set FIREBASE_EMAIL and FIREBASE_PASSWORD in backend/.env');
  }

  const now = Date.now();
  if (firebaseAuthCache && firebaseAuthCache.expiresAt - 60000 > now) {
    return firebaseAuthCache.idToken;
  }

  const authUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(FIREBASE.apiKey)}`;
  const auth = await requestJson(authUrl, { method: 'POST' }, {
    email: FIREBASE.email,
    password: FIREBASE.password,
    returnSecureToken: true,
  });

  const expiresInMs = Number(auth.expiresIn || 3600) * 1000;
  firebaseAuthCache = {
    idToken: auth.idToken,
    expiresAt: now + expiresInMs,
  };
  return auth.idToken;
}

async function fetchFirebaseGpsDevice(deviceId) {
  if (!FIREBASE.databaseURL) throw new Error('Firebase databaseURL not configured');
  const idToken = await getFirebaseIdToken();
  const pathParts = [FIREBASE.gpsRoot, deviceId].filter(Boolean).map((part) => encodeURIComponent(part));
  const url = new URL(`${FIREBASE.databaseURL.replace(/\/$/, '')}/${pathParts.join('/')}.json`);
  url.searchParams.set('auth', idToken);
  return requestJson(url.toString());
}

function handleGeoJsonRequest(req, res, name) {
  if (!AVAILABLE_FILES.has(name)) {
    sendJson(res, { error: 'File not found' }, 404);
    return;
  }

  const json = readJsonFile(name);
  if (!json) {
    sendJson(res, { error: 'Không thể đọc tệp geojson' }, 500);
    return;
  }

  sendJson(res, json);
}

function handleRouteRequest(req, res, query) {
  const from = query.from;
  const to = query.to;
  if (!from || !to) {
    sendJson(res, { error: 'Thiếu tham số from hoặc to. Ví dụ: /route?from=gate-ltr&to=IT-room' }, 400);
    return;
  }

  const mapName = query.map === 'road' ? 'road' : 'map-1.0';
  const roadGeoJson = readJsonFile(mapName);
  if (!roadGeoJson) {
    sendJson(res, { error: 'Không tìm thấy dữ liệu đường' }, 500);
    return;
  }

  const graphData = mapName === 'road'
    ? { graph: buildGraph(roadGeoJson), aliases: new Map(), coordsByNode: new Map() }
    : buildCoordinateGraph(roadGeoJson);
  const resolvedFrom = resolveGraphNode(from, graphData);
  const resolvedTo = resolveGraphNode(to, graphData);

  if (!resolvedFrom || !resolvedTo) {
    sendJson(res, { error: `Không tìm thấy điểm bắt đầu hoặc điểm kết thúc trong dữ liệu đường: ${from}, ${to}` }, 404);
    return;
  }

  const route = dijkstra(graphData.graph, resolvedFrom, resolvedTo);
  if (!route || (route.length === 0 && resolvedFrom !== resolvedTo)) {
    sendJson(res, { error: `Không tìm thấy tuyến đường giữa ${from} và ${to}` }, 404);
    return;
  }

  const featureCollection = createRouteFeatureCollection(route);
  sendJson(res, {
    status: 'ok',
    from,
    to,
    map: mapName,
    length_km: route.reduce((sum, edge) => sum + edge.weight, 0),
    route: featureCollection,
  });
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, 'http://localhost');
  const pathname = parsedUrl.pathname;

  if (pathname === '/route') {
    handleRouteRequest(req, res, Object.fromEntries(parsedUrl.searchParams.entries()));
    return;
  }

  const geoMatch = pathname.match(/^\/geojson\/([\w.-]+)$/);
  if (geoMatch) {
    handleGeoJsonRequest(req, res, geoMatch[1]);
    return;
  }

  if (pathname === '/' || pathname === '/health') {
    sendJson(res, { status: 'running', availableGeojson: Array.from(AVAILABLE_FILES), routeExample: '/route?map=map-1.0&from=coord:106.703157,10.780525&to=coord:106.703358,10.782190' });
    return;
  }

  if (pathname === '/firebase/gps') {
    const device = parsedUrl.searchParams.get('device') || FIREBASE.gpsDevice;
    fetchFirebaseGpsDevice(device)
      .then((data) => sendJson(res, { status: 'ok', root: FIREBASE.gpsRoot, device, data }))
      .catch((err) => sendJson(res, { error: 'Không thể lấy dữ liệu từ Firebase', details: err.message }, 500));
    return;
  }

  sendJson(res, { error: 'Endpoint không tồn tại' }, 404);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Hospital map backend listening on port ${PORT} (accessible on local network)`);
});
