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
  map10Line: {
    color: '#64748B',
    weight: 2.5,
    opacity: 0.8,
    dashArray: '4 4'
  },
  map10Polygon: {
    color: '#14B8A6',
    weight: 1.2,
    fillColor: '#CCFBF1',
    fillOpacity: 0.38
  },
  route: {
    color: '#0EA5A8',
    weight: 5,
    opacity: 0.95
  }
};

function getFeatureName(feature, fallback = 'Map 1.0') {
  const props = feature?.properties || {};
  return props.name || props.id || props.label || fallback;
}

function getMap10Style(feature) {
  if (feature?.geometry?.type === 'Polygon' || feature?.geometry?.type === 'MultiPolygon') {
    return layerStyles.map10Polygon;
  }

  return layerStyles.map10Line;
}

function bindMap10Feature(feature, layer) {
  const name = getFeatureName(feature);
  const type = feature?.geometry?.type || 'GeoJSON';

  layer.bindTooltip(`<strong>${name}</strong><br>Map 1.0`, {
    permanent: false,
    direction: 'top',
    offset: [0, -10]
  });

  layer.bindPopup(`
    <div style="font-family: Inter, sans-serif; max-width: 220px;">
      <h4 style="margin: 0 0 8px; color: #0F766E;">${name}</h4>
      <p style="margin: 0; font-size: 0.9em; color: #64748B;">Lớp: Map 1.0 · ${type}</p>
    </div>
  `);
}

function AutoFitBounds({ route, selectedPlace, boundary, map10, center }) {
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

    if (!bounds.length) {
      const fallbackBounds = L.latLngBounds([]);

      boundary?.features?.forEach((feature) => {
        collectGeoJsonCoords(fallbackBounds, feature.geometry?.coordinates);
      });

      map10?.features?.forEach((feature) => {
        collectGeoJsonCoords(fallbackBounds, feature.geometry?.coordinates);
      });

      if (fallbackBounds.isValid()) {
        map.fitBounds(fallbackBounds, { padding: [24, 24], maxZoom: 18, animate: false });
        return;
      }
    }

    if (bounds.length) {
      // disable animated camera movement to avoid "rolling" effect
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 18, animate: false });
      return;
    }

    // set view without animation
    map.setView(center, 16, { animate: false });
  }, [route, selectedPlace, boundary, map10, center, map]);

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

  if (geoData.map10?.features) {
    geoData.map10.features.forEach(addFeatureCoords);
  }

  if (route?.features) {
    route.features.forEach(addFeatureCoords);
  }

  return bounds.isValid() ? bounds : null;
}

function HospitalHomeControl({ bounds, center }) {
  const map = useMap();

  useEffect(() => {
    const control = L.control({ position: 'topleft' });

    control.onAdd = () => {
      const container = L.DomUtil.create('div', 'leaflet-bar hospital-home-control');
      const button = L.DomUtil.create('button', 'hospital-home-button', container);
      button.type = 'button';
      button.title = 'Về bản đồ bệnh viện';
      button.setAttribute('aria-label', 'Về bản đồ bệnh viện');
      button.textContent = 'BV';

      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.on(button, 'click', (event) => {
        L.DomEvent.stop(event);
        if (bounds?.isValid()) {
          map.fitBounds(bounds, { padding: [28, 28], maxZoom: 18, animate: true });
          return;
        }

        map.setView(center, 16, { animate: true });
      });

      return container;
    };

    control.addTo(map);
    return () => control.remove();
  }, [bounds, center, map]);

  return null;
}

export default function MapView({
  center,
  layers,
  geoData,
  route,
  selectedPlace,
  userLocation,
  electricVehicleLocation
}) {
  const bounds = useMemo(() => computeBounds(geoData, route, center), [geoData, route, center]);
  const hospitalBounds = useMemo(() => computeBounds(geoData, null, center), [geoData, center]);

  return (
    <div className="map-view">
      <MapContainer
        center={center}
        zoom={16}
        minZoom={0}
        maxZoom={22}
        scrollWheelZoom={true}
        className="map-container"
        bounds={bounds || undefined}
        boundsOptions={{ padding: [20, 20] }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={22}
          maxNativeZoom={19}
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

        {layers.map10 && geoData.map10 && (
          <GeoJSON
            data={geoData.map10}
            style={getMap10Style}
            pointToLayer={(feature, latlng) =>
              L.circleMarker(latlng, {
                radius: 5,
                color: '#0F766E',
                fillColor: '#CCFBF1',
                fillOpacity: 1,
                weight: 2
              })
            }
            onEachFeature={bindMap10Feature}
          />
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

        {electricVehicleLocation && (
          <>
            <CircleMarker
              center={[electricVehicleLocation.lat, electricVehicleLocation.lng]}
              radius={15}
              pathOptions={{
                color: '#F59E0B',
                fillColor: '#F59E0B',
                fillOpacity: 0.14,
                weight: 1.2,
                className: 'vehicle-pulse-ring'
              }}
            />
            <CircleMarker
              center={[electricVehicleLocation.lat, electricVehicleLocation.lng]}
              radius={8}
              pathOptions={{
                color: '#FFFFFF',
                fillColor: '#F59E0B',
                fillOpacity: 1,
                weight: 2.5
              }}
            >
              <Popup>
                <div style={{ fontFamily: 'Inter, sans-serif', padding: '2px' }}>
                  <strong style={{ color: '#B45309' }}>Xe điện</strong>
                  <br />
                  <span style={{ fontSize: '0.82em', color: '#64748B' }}>
                    {electricVehicleLocation.lat.toFixed(6)}, {electricVehicleLocation.lng.toFixed(6)}
                  </span>
                  <br />
                  <span style={{ fontSize: '0.78em', color: '#64748B' }}>
                    Thiết bị: {electricVehicleLocation.device}
                    {electricVehicleLocation.satellites !== undefined ? ` · ${electricVehicleLocation.satellites} vệ tinh` : ''}
                  </span>
                </div>
              </Popup>
            </CircleMarker>
          </>
        )}

        <AutoFitBounds
          route={route}
          selectedPlace={selectedPlace}
          boundary={geoData.boundary}
          map10={geoData.map10}
          center={center}
        />
        <HospitalHomeControl bounds={hospitalBounds} center={center} />
      </MapContainer>
    </div>
  );
}

