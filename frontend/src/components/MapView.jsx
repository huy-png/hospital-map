import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, GeoJSON, CircleMarker, Popup, TileLayer, useMap } from 'react-leaflet';

const layerStyles = {
  road: {
    color: '#9AA6B2',
    weight: 3,
    opacity: 0.85
  },
  building: {
    color: '#CBD5E1',
    weight: 1,
    fillColor: '#FBFEFF',
    fillOpacity: 0.55
  },
  boundary: {
    color: '#C7D2DA',
    weight: 2,
    dashArray: '6 6'
  },
  route: {
    color: '#0EA5A8',
    weight: 5,
    opacity: 0.95
  }
};

function AutoFitBounds({ route, selectedPlace, boundary, center }) {
  const map = useMap();

  useEffect(() => {
    const bounds = [];

    if (route?.features?.length) {
      for (const feature of route.features) {
        const coords = feature.geometry.coordinates || [];
        coords.forEach(([lon, lat]) => bounds.push([lat, lon]));
      }
    }

    if (selectedPlace?.coords) {
      bounds.push(selectedPlace.coords);
    }

    if (!bounds.length && boundary?.features?.length) {
      boundary.features.forEach((feature) => {
        const coords = feature.geometry.coordinates?.[0] || [];
        coords.forEach(([lon, lat]) => bounds.push([lat, lon]));
      });
    }

    if (bounds.length) {
      // disable animated camera movement to avoid "rolling" effect
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 18, animate: false });
      return;
    }

    // set view without animation
    map.setView(center, 16, { animate: false });
  }, [route, selectedPlace, boundary, center, map]);

  return null;
}

function collectGeoJsonCoords(bounds, coordinates) {
  if (!Array.isArray(coordinates)) return;
  if (typeof coordinates[0] === 'number') {
    bounds.extend([coordinates[1], coordinates[0]]);
    return;
  }

  coordinates.forEach((item) => collectGeoJsonCoords(bounds, item));
}

function computeBounds(geoData, route, center) {
  const bounds = L.latLngBounds([center]);

  const addFeatureCoords = (feature) => {
    if (!feature?.geometry?.coordinates) return;
    collectGeoJsonCoords(bounds, feature.geometry.coordinates);
  };

  if (geoData.boundary?.features) {
    geoData.boundary.features.forEach(addFeatureCoords);
  }

  if (geoData.road?.features) {
    geoData.road.features.forEach(addFeatureCoords);
  }

  if (geoData.point?.features) {
    geoData.point.features.forEach((feature) => {
      const coords = feature.geometry?.coordinates;
      if (Array.isArray(coords) && coords.length === 2) {
        bounds.extend([coords[1], coords[0]]);
      }
    });
  }

  if (route?.features) {
    route.features.forEach(addFeatureCoords);
  }

  return bounds.isValid() ? bounds : null;
}

export default function MapView({
  center,
  layers,
  geoData,
  route,
  selectedPlace,
  userLocation
}) {
  const bounds = useMemo(() => computeBounds(geoData, route, center), [geoData, route, center]);
  const maxBounds = bounds ? bounds.pad(0.15) : null;

  return (
    <div className="map-view">
      <MapContainer
        center={center}
        zoom={16}
        scrollWheelZoom={true}
        className="map-container"
        bounds={bounds || undefined}
        boundsOptions={{ padding: [20, 20] }}
        maxBounds={maxBounds || undefined}
        maxBoundsViscosity={0.85}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {layers.boundary && geoData.boundary && (
          <GeoJSON data={geoData.boundary} style={layerStyles.boundary} />
        )}

        {layers.building && geoData.building && (
          <GeoJSON data={geoData.building} style={layerStyles.building} />
        )}

        {layers.road && geoData.road && (
          <GeoJSON data={geoData.road} style={layerStyles.road} />
        )}

        {layers.point && geoData.point && (
          <GeoJSON
            data={geoData.point}
            pointToLayer={(feature, latlng) =>
              L.circleMarker(latlng, {
                radius: 6,
                color: '#0EA5A8',
                fillColor: '#FFFFFF',
                fillOpacity: 1,
                weight: 2
              })
            }
            onEachFeature={(feature, layer) => {
              const props = feature.properties;
              const name = props.name || props.id || 'Điểm không tên';
              const type = props.type || 'Điểm';
              const description = props.description || 'Không có mô tả';

              layer.bindTooltip(`<strong>${name}</strong><br>${type}`, {
                permanent: false,
                direction: 'top',
                offset: [0, -10]
              });

              layer.bindPopup(`
                <div style="font-family: Inter, sans-serif; max-width: 200px;">
                  <h4 style="margin: 0 0 8px; color: #0EA5A8;">${name}</h4>
                  <p style="margin: 0 0 4px; font-size: 0.9em; color: #64748B;">Loại: ${type}</p>
                  <p style="margin: 0; font-size: 0.9em;">${description}</p>
                </div>
              `);
            }}
          />
        )}

        {route?.features && (
          <GeoJSON data={route} style={layerStyles.route} />
        )}

        {selectedPlace?.coords && (
          <CircleMarker
            center={selectedPlace.coords}
            radius={8}
            pathOptions={{ color: '#EF4444', fillColor: '#F59E0B', fillOpacity: 0.8, weight: 2 }}
          >
            <Popup>{selectedPlace.label}</Popup>
          </CircleMarker>
        )}

        {userLocation && (
          <>
            <CircleMarker
              center={[userLocation.lat, userLocation.lng]}
              radius={14}
              pathOptions={{
                color: '#2563EB',
                fillColor: '#2563EB',
                fillOpacity: 0.15,
                weight: 1,
                className: 'gps-pulse-ring'
              }}
            />
            <CircleMarker
              center={[userLocation.lat, userLocation.lng]}
              radius={7}
              pathOptions={{
                color: '#FFFFFF',
                fillColor: '#2563EB',
                fillOpacity: 1,
                weight: 2.5
              }}
            >
              <Popup>
                <div style={{ fontFamily: 'Inter, sans-serif', padding: '2px' }}>
                  <strong style={{ color: '#2563EB' }}>Vị trí của bạn</strong>
                  <br />
                  <span style={{ fontSize: '0.82em', color: '#64748B' }}>
                    {userLocation.lat.toFixed(6)}, {userLocation.lng.toFixed(6)}
                  </span>
                </div>
              </Popup>
            </CircleMarker>
          </>
        )}

        <AutoFitBounds route={route} selectedPlace={selectedPlace} boundary={geoData.boundary} center={center} />
      </MapContainer>
    </div>
  );
}

