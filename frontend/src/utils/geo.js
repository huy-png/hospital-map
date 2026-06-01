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

