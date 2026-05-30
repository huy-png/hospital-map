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
