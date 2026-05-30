const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

async function request(path) {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `API error ${response.status}`);
  }
  return response.json();
}

export function fetchGeoJson(name) {
  return request(`/geojson/${name}`);
}

export function getRoute(from, to) {
  const params = new URLSearchParams({ from, to });
  return request(`/route?${params.toString()}`);
}
