function findGeoJsonId(feature) {
  const props = feature?.properties || {};
  if (typeof props.id === 'string' && props.id.trim()) {
    return props.id.trim();
  }

  for (const [key, value] of Object.entries(props)) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function formatLabel(value) {
  if (!value || typeof value !== 'string') return '';
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function buildPlaceIndex({ roadGeoJson, pointGeoJson }) {
  const points = new Map();
  const placeList = [];

  for (const feature of pointGeoJson?.features || []) {
    const id = findGeoJsonId(feature);
    const coords = feature?.geometry?.coordinates;
    if (!id) continue;

    points.set(id, {
      id,
      label: formatLabel(id),
      coords: Array.isArray(coords) && coords.length === 2 ? [coords[1], coords[0]] : null,
      source: 'point'
    });
  }

  const roadEndpoints = new Set();
  for (const feature of roadGeoJson?.features || []) {
    const from = feature?.properties?.from;
    const to = feature?.properties?.to;
    if (typeof from === 'string' && from.trim()) roadEndpoints.add(from.trim());
    if (typeof to === 'string' && to.trim()) roadEndpoints.add(to.trim());
  }

  for (const id of roadEndpoints) {
    if (!points.has(id)) {
      points.set(id, {
        id,
        label: formatLabel(id),
        coords: null,
        source: 'road'
      });
    }
  }

  for (const place of points.values()) {
    placeList.push(place);
  }

  return placeList.sort((a, b) => a.label.localeCompare(b.label, 'vi'));
}

export function queryPlaces(places, query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return places;
  return places.filter((place) =>
    place.label.toLowerCase().includes(normalized) || place.id.toLowerCase().includes(normalized)
  );
}

export function haversineDistanceKm(a, b) {
  const [lat1, lng1] = a;
  const [lat2, lng2] = b;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const radLat1 = toRad(lat1);
  const radLat2 = toRad(lat2);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const aVal = sinDLat * sinDLat + sinDLng * sinDLng * Math.cos(radLat1) * Math.cos(radLat2);
  const c = 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
  return earthRadiusKm * c;
}

export function getRoadNodeIndex(roadGeoJson) {
  const nodes = new Map();

  for (const feature of roadGeoJson?.features || []) {
    const from = feature?.properties?.from;
    const to = feature?.properties?.to;
    const coords = feature?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;

    const first = coords[0];
    const last = coords[coords.length - 1];
    if (typeof from === 'string' && from.trim() && Array.isArray(first)) {
      nodes.set(from.trim(), { id: from.trim(), coords: [first[1], first[0]] });
    }
    if (typeof to === 'string' && to.trim() && Array.isArray(last)) {
      nodes.set(to.trim(), { id: to.trim(), coords: [last[1], last[0]] });
    }
  }

  return nodes;
}

export function findNearestRoadNode(userLocation, roadGeoJson) {
  if (!userLocation) return null;
  const userCoords = [userLocation.lat, userLocation.lng];
  const nodes = getRoadNodeIndex(roadGeoJson);
  let nearest = null;

  for (const node of nodes.values()) {
    const distanceKm = haversineDistanceKm(userCoords, node.coords);
    if (!nearest || distanceKm < nearest.distanceKm) {
      nearest = { ...node, distanceKm, distanceMeters: distanceKm * 1000 };
    }
  }

  return nearest;
}

export function prependGpsConnector(routeGeoJson, userLocation, nearestNode) {
  if (!userLocation || !nearestNode?.coords) return routeGeoJson;

  const connector = {
    type: 'Feature',
    properties: {
      from: 'gps-location',
      to: nearestNode.id,
      source: 'gps-connector'
    },
    geometry: {
      type: 'LineString',
      coordinates: [
        [userLocation.lng, userLocation.lat],
        [nearestNode.coords[1], nearestNode.coords[0]]
      ]
    }
  };

  return {
    type: 'FeatureCollection',
    features: [connector, ...(routeGeoJson?.features || [])]
  };
}

export function checkUserLocationInHospital(lat, lng, boundaryGeoJson, bufferMeters = 20) {
  if (!boundaryGeoJson || !boundaryGeoJson.features || boundaryGeoJson.features.length === 0) {
    return { inside: true, distance: 0 };
  }

  const feature = boundaryGeoJson.features[0];
  if (!feature || !feature.geometry || feature.geometry.type !== 'Polygon') {
    return { inside: true, distance: 0 };
  }

  const polygon = feature.geometry.coordinates[0]; // array of [lng, lat]
  
  // 1. Check point in polygon (in lat/lng space)
  const isInside = pointInPolygon([lng, lat], polygon);
  if (isInside) {
    return { inside: true, distance: 0 };
  }

  // 2. Check distance to each segment
  const LAT_TO_METER = 111139;
  const LNG_TO_METER = 111139 * Math.cos((lat * Math.PI) / 180);

  const px = lng * LNG_TO_METER;
  const py = lat * LAT_TO_METER;

  let minDistance = Infinity;

  for (let i = 0; i < polygon.length - 1; i++) {
    const ax = polygon[i][0] * LNG_TO_METER;
    const ay = polygon[i][1] * LAT_TO_METER;
    const bx = polygon[i+1][0] * LNG_TO_METER;
    const by = polygon[i+1][1] * LAT_TO_METER;

    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;

    const ab2 = abx * abx + aby * aby;
    let t = ab2 === 0 ? 0 : (apx * abx + apy * aby) / ab2;
    t = Math.max(0, Math.min(1, t)); // clamp to segment

    const cx = ax + t * abx;
    const cy = ay + t * aby;

    const dx = px - cx;
    const dy = py - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < minDistance) {
      minDistance = dist;
    }
  }

  return {
    inside: minDistance <= bufferMeters,
    distance: minDistance
  };
}

function pointInPolygon(point, polygon) {
  const x = point[0], y = point[1];
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

