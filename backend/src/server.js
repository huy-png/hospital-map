const http = require('http');
const fs = require('fs');
const path = require('path');
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'geojson');
const AVAILABLE_FILES = new Set(['road', 'building', 'point', 'boundary']);
const https = require('https');

// Firebase Realtime Database config (use REST API)
const FIREBASE = {
  apiKey: "AIzaSyAyccxaZ21dcb7jgHzvPrjZrLro-ro_Yh0",
  authDomain: "test1-7399f.firebaseapp.com",
  databaseURL: "https://test1-7399f-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "test1-7399f",
};

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

function fetchFirebaseNode(nodeId) {
  return new Promise((resolve, reject) => {
    if (!FIREBASE.databaseURL) return reject(new Error('Firebase databaseURL not configured'));
    const url = new URL(`${FIREBASE.databaseURL.replace(/\/$/, '')}/${encodeURIComponent(nodeId)}.json`);
    const opts = {
      hostname: url.hostname,
      path: url.pathname + (url.search || ''),
      method: 'GET',
    };

    const req = https.request(opts, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body || 'null');
          resolve(parsed);
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.end();
  });
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

  const roadGeoJson = readJsonFile('road');
  if (!roadGeoJson) {
    sendJson(res, { error: 'Không tìm thấy dữ liệu đường' }, 500);
    return;
  }

  const graph = buildGraph(roadGeoJson);
  if (!graph.has(from) || !graph.has(to)) {
    sendJson(res, { error: `Không tìm thấy điểm bắt đầu hoặc điểm kết thúc trong dữ liệu đường: ${from}, ${to}` }, 404);
    return;
  }

  const route = dijkstra(graph, from, to);
  if (!route || route.length === 0) {
    sendJson(res, { error: `Không tìm thấy tuyến đường giữa ${from} và ${to}` }, 404);
    return;
  }

  const featureCollection = createRouteFeatureCollection(route);
  sendJson(res, {
    status: 'ok',
    from,
    to,
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

  const geoMatch = pathname.match(/^\/geojson\/(\w+)$/);
  if (geoMatch) {
    handleGeoJsonRequest(req, res, geoMatch[1]);
    return;
  }

  if (pathname === '/' || pathname === '/health') {
    sendJson(res, { status: 'running', availableGeojson: Array.from(AVAILABLE_FILES), routeExample: '/route?from=gate-ltr&to=IT-room' });
    return;
  }

  if (pathname === '/firebase/gps') {
    // Return GPS data only for node 441D64F39AF0 as requested
    fetchFirebaseNode('441D64F39AF0')
      .then((data) => sendJson(res, { status: 'ok', node: '441D64F39AF0', data }))
      .catch((err) => sendJson(res, { error: 'Không thể lấy dữ liệu từ Firebase', details: err.message }, 500));
    return;
  }

  sendJson(res, { error: 'Endpoint không tồn tại' }, 404);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Hospital map backend listening on port ${PORT} (accessible on local network)`);
});
