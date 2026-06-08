import { useEffect, useMemo, useRef } from 'react';
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

function formatMapLabel(value) {
  if (!value || typeof value !== 'string') return '';
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getFeatureName(feature, fallback = 'Bản đồ chi tiết') {
  const props = feature?.properties || {};
  return formatMapLabel(props.name || props.id || props.label || fallback);
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

  layer.bindTooltip(`<strong>${name}</strong><br>Bản đồ chi tiết`, {
    permanent: false,
    direction: 'top',
    offset: [0, -10]
  });

  layer.bindPopup(`
    <div style="font-family: Inter, sans-serif; max-width: 220px;">
      <h4 style="margin: 0 0 8px; color: #0F766E;">${name}</h4>
      <p style="margin: 0; font-size: 0.9em; color: #64748B;">Lớp: Bản đồ chi tiết · ${type}</p>
    </div>
  `);
}

function AutoFitBounds({ route, selectedPlace, boundary, map10, center, userLocation, electricVehicleLocations, focusElectricVehicles, vehicleFocusRequest }) {
  const map = useMap();
  const didFitInitialBounds = useRef(false);
  const lastRouteKey = useRef(null);
  const lastSelectedPlaceKey = useRef(null);
  const lastVehicleFocusRequest = useRef(null);

  const routeKey = useMemo(() => {
    if (!route?.features?.length) return null;
    return route.features
      .map((feature) => `${feature.geometry?.type || ''}:${JSON.stringify(feature.geometry?.coordinates || [])}`)
      .join('|');
  }, [route]);

  const selectedPlaceKey = selectedPlace?.coords
    ? `${selectedPlace.id || selectedPlace.name || selectedPlace.label || 'selected'}:${selectedPlace.coords.join(',')}`
    : null;

  useEffect(() => {
    if (!routeKey) {
      lastRouteKey.current = null;
    }

    if (!selectedPlaceKey) {
      lastSelectedPlaceKey.current = null;
    }

    if (routeKey && routeKey !== lastRouteKey.current) {
      const bounds = [];
      for (const feature of route.features) {
        const coords = feature.geometry.coordinates || [];
        coords.forEach(([lon, lat]) => bounds.push([lat, lon]));
      }

      if (bounds.length) {
        map.fitBounds(bounds, { padding: [24, 24], maxZoom: 18, animate: false });
        lastRouteKey.current = routeKey;
        return;
      }
    }

    if (selectedPlaceKey && selectedPlaceKey !== lastSelectedPlaceKey.current) {
      map.fitBounds([selectedPlace.coords], { padding: [24, 24], maxZoom: 18, animate: false });
      lastSelectedPlaceKey.current = selectedPlaceKey;
      return;
    }

    if (!focusElectricVehicles) {
      lastVehicleFocusRequest.current = null;
    }

    if (
      focusElectricVehicles
      && electricVehicleLocations?.length
      && vehicleFocusRequest !== lastVehicleFocusRequest.current
    ) {
      const bounds = [];
      if (userLocation) {
        bounds.push([userLocation.lat, userLocation.lng]);
      }

      electricVehicleLocations.forEach((vehicle) => {
        bounds.push([vehicle.lat, vehicle.lng]);
      });

      if (bounds.length) {
        map.fitBounds(bounds, { padding: [24, 24], maxZoom: 18, animate: false });
        lastVehicleFocusRequest.current = vehicleFocusRequest;
        return;
      }
    }

    if (!didFitInitialBounds.current) {
      const fallbackBounds = L.latLngBounds([]);

      boundary?.features?.forEach((feature) => {
        collectGeoJsonCoords(fallbackBounds, feature.geometry?.coordinates);
      });

      map10?.features?.forEach((feature) => {
        collectGeoJsonCoords(fallbackBounds, feature.geometry?.coordinates);
      });

      if (fallbackBounds.isValid()) {
        map.fitBounds(fallbackBounds, { padding: [24, 24], maxZoom: 18, animate: false });
        didFitInitialBounds.current = true;
        return;
      }

      map.setView(center, 16, { animate: false });
      didFitInitialBounds.current = true;
    }
  }, [route, routeKey, selectedPlace, selectedPlaceKey, boundary, map10, center, userLocation, electricVehicleLocations, focusElectricVehicles, vehicleFocusRequest, map]);

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
      button.textContent = 'Về';

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

function MapResizeHandler({ layoutMode }) {
  const map = useMap();

  useEffect(() => {
    const resizeMap = () => map.invalidateSize({ animate: false });
    resizeMap();
    const frameId = window.requestAnimationFrame(resizeMap);
    const timeoutId = window.setTimeout(resizeMap, 250);
    const container = map.getContainer();
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(resizeMap)
      : null;

    if (resizeObserver) {
      resizeObserver.observe(container);
    }

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
      resizeObserver?.disconnect();
    };
  }, [layoutMode, map]);

  return null;
}

export default function MapView({
  center,
  layers,
  geoData,
  route,
  selectedPlace,
  userLocation,
  electricVehicleLocations = [],
  focusElectricVehicles = false,
  vehicleFocusRequest = 0,
  layoutMode = 'default'
}) {
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

        {electricVehicleLocations.flatMap((vehicle) => {
          const vehicleKey = vehicle.id || vehicle.device;
          return [
            <CircleMarker
              key={`${vehicleKey}-ring`}
              center={[vehicle.lat, vehicle.lng]}
              radius={15}
              pathOptions={{
                color: '#F59E0B',
                fillColor: '#F59E0B',
                fillOpacity: 0.14,
                weight: 1.2,
                className: 'vehicle-pulse-ring'
              }}
            />,
            <CircleMarker
              key={`${vehicleKey}-marker`}
              center={[vehicle.lat, vehicle.lng]}
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
                    {vehicle.lat.toFixed(6)}, {vehicle.lng.toFixed(6)}
                  </span>
                  <br />
                  <span style={{ fontSize: '0.78em', color: '#64748B' }}>
                    Thiết bị: {vehicle.device}
                    {vehicle.satellites !== undefined ? ` · ${vehicle.satellites} vệ tinh` : ''}
                    {Number.isFinite(vehicle.distanceKm) ? ` · ${Math.round(vehicle.distanceKm * 1000)}m` : ''}
                  </span>
                </div>
              </Popup>
            </CircleMarker>
          ];
        })}

        <AutoFitBounds
          route={route}
          selectedPlace={selectedPlace}
          boundary={geoData.boundary}
          map10={geoData.map10}
          center={center}
          userLocation={userLocation}
          electricVehicleLocations={electricVehicleLocations}
          focusElectricVehicles={focusElectricVehicles}
          vehicleFocusRequest={vehicleFocusRequest}
        />
        <HospitalHomeControl bounds={hospitalBounds} center={center} />
        <MapResizeHandler layoutMode={layoutMode} />
      </MapContainer>
    </div>
  );
}

