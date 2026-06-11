const getApiBase = () => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  const hostname = typeof window !== 'undefined' && window.location ? window.location.hostname : 'localhost';
  return `http://${hostname}:3000`;
};

const API_BASE = getApiBase();

async function request(path) {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `API error ${response.status}`);
  }
  return response.json();
}

async function post(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

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
  const params = new URLSearchParams({ from, to, map: 'map-01' });
  return request(`/route?${params.toString()}`);
}

export function fetchElectricVehicleGps(device) {
  const params = new URLSearchParams();
  if (device) params.set('device', device);
  const query = params.toString();
  return request(`/firebase/gps${query ? `?${query}` : ''}`);
}

export function sendElectricVehicleRequest(payload) {
  return post('/firebase/vehicle-request', payload);
}
