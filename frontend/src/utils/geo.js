export function findGeoJsonId(feature) {
  const props = feature?.properties || {};
  if (typeof props.id === 'string' && props.id.trim()) {
    return props.id.trim();
  }

  for (const value of Object.values(props)) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

export function formatLabel(value) {
  if (!value || typeof value !== 'string') return '';
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

export function getCoordRouteId(coord) {
  const [lng, lat] = normalizeCoord(coord);
  return `coord:${lng.toFixed(6)},${lat.toFixed(6)}`;
}

export function buildMapPlaceIndex(mapGeoJson) {
  const places = [];
  const labelCounts = new Map();

  for (const feature of mapGeoJson?.features || []) {
    if (feature?.geometry?.type !== 'Point' || !isValidLngLat(feature.geometry.coordinates)) continue;

    const id = findGeoJsonId(feature);
    if (!id) continue;

    const coords = normalizeCoord(feature.geometry.coordinates);
    const baseLabel = formatLabel(id);
    const count = (labelCounts.get(baseLabel) || 0) + 1;
    labelCounts.set(baseLabel, count);

    places.push({
      id: getCoordRouteId(coords),
      label: count > 1 ? `${baseLabel} (${count})` : baseLabel,
      coords: [coords[1], coords[0]],
      source: 'map-01'
    });
  }

  return places.sort((a, b) => a.label.localeCompare(b.label, 'vi'));
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

export function getMapNodeIndex(mapGeoJson) {
  const nodes = new Map();

  for (const feature of mapGeoJson?.features || []) {
    if (feature?.geometry?.type !== 'LineString') continue;

    for (const coord of feature.geometry.coordinates || []) {
      if (!isValidLngLat(coord)) continue;
      const normalized = normalizeCoord(coord);
      const id = getCoordRouteId(normalized);
      nodes.set(id, { id, label: 'đường gần nhất', coords: [normalized[1], normalized[0]] });
    }
  }

  return nodes;
}

export function findNearestMapRoadNode(userLocation, mapGeoJson) {
  if (!userLocation) return null;
  const userCoords = [userLocation.lat, userLocation.lng];
  const nodes = getMapNodeIndex(mapGeoJson);
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

function pointInPolygon(point, polygon) {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersects) inside = !inside;
  }

  return inside;
}

function distanceToSegmentMeters(point, a, b) {
  const [lng, lat] = point;
  const latToMeter = 111139;
  const lngToMeter = 111139 * Math.cos((lat * Math.PI) / 180);

  const px = lng * lngToMeter;
  const py = lat * latToMeter;
  const ax = a[0] * lngToMeter;
  const ay = a[1] * latToMeter;
  const bx = b[0] * lngToMeter;
  const by = b[1] * latToMeter;
  const abx = bx - ax;
  const aby = by - ay;
  const ab2 = abx * abx + aby * aby;
  const t = ab2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / ab2));
  const cx = ax + t * abx;
  const cy = ay + t * aby;
  const dx = px - cx;
  const dy = py - cy;

  return Math.sqrt(dx * dx + dy * dy);
}

function isPointInPolygonWithBuffer(point, polygon, bufferMeters) {
  if (!Array.isArray(polygon) || polygon.length < 4) return false;
  if (pointInPolygon(point, polygon)) return true;
  if (!bufferMeters) return false;

  let minDistance = Infinity;
  for (let i = 0; i < polygon.length - 1; i++) {
    minDistance = Math.min(minDistance, distanceToSegmentMeters(point, polygon[i], polygon[i + 1]));
  }

  return minDistance <= bufferMeters;
}

export function isLocationInsideBoundary(location, boundaryGeoJson, bufferMeters = 20) {
  if (!location) return false;
  if (!boundaryGeoJson?.features?.length) return true;

  const point = [Number(location.lng), Number(location.lat)];
  if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) return false;

  return boundaryGeoJson.features.some((feature) => {
    const geometry = feature?.geometry;
    if (!geometry) return false;

    if (geometry.type === 'Polygon') {
      return (geometry.coordinates || []).some((ring) =>
        isPointInPolygonWithBuffer(point, ring, bufferMeters)
      );
    }

    if (geometry.type === 'MultiPolygon') {
      return (geometry.coordinates || []).some((polygon) =>
        polygon.some((ring) => isPointInPolygonWithBuffer(point, ring, bufferMeters))
      );
    }

    return false;
  });
}
