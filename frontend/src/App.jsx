import { useEffect, useMemo, useState, useRef } from 'react';
import MapView from './components/MapView.jsx';
import Sidebar from './components/Sidebar.jsx';
import { fetchElectricVehicleGps, fetchGeoJson, getRoute, sendElectricVehicleRequest } from './services/api.js';
import {
  buildMapPlaceIndex,
  queryPlaces,
  findNearestMapRoadNode,
  haversineDistanceKm,
  isLocationInsideBoundary,
  prependGpsConnector
} from './utils/geo.js';

const INITIAL_CENTER = [10.7813, 106.7030];
const GPS_ROUTE_START_ID = 'gps-location';
const ELECTRIC_VEHICLE_DEVICE_IDS = ['441D64F39AF0'];
const NEARBY_VEHICLE_LIMIT = 3;
const TEST_GATE_LOCATION = { lat: 10.780525, lng: 106.703157 };

function App() {
  const [activePage, setActivePage] = useState('home');
  const [mapData, setMapData] = useState(null);
  const [boundaryData, setBoundaryData] = useState(null);
  const [places, setPlaces] = useState([]);
  const [placeQuery, setPlaceQuery] = useState('');
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [routeFrom, setRouteFrom] = useState('');
  const [routeTo, setRouteTo] = useState('');
  const [route, setRoute] = useState(null);
  const [nearestStartNode, setNearestStartNode] = useState(null);
  const [status, setStatus] = useState('Sẵn sàng');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showLegendModal, setShowLegendModal] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [mobileRoutePanelOpen, setMobileRoutePanelOpen] = useState(false);

  // GPS state variables
  const [userLocation, setUserLocation] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('prompt'); // prompt, tracking, denied, error
  const [useTestGateLocation, setUseTestGateLocation] = useState(false);
  const [electricVehicles, setElectricVehicles] = useState([]);
  const [nearbyElectricVehicles, setNearbyElectricVehicles] = useState([]);
  const [vehicleCallStatus, setVehicleCallStatus] = useState('idle');
  const [vehicleFocusRequest, setVehicleFocusRequest] = useState(0);
  const [electricVehicleStatus, setElectricVehicleStatus] = useState('loading');

  // Camera QR scanner state variables
  const [qrStream, setQrStream] = useState(null);
  const [qrCameraError, setQrCameraError] = useState(null);
  const videoRef = useRef(null);
  const rawUserLocation = useTestGateLocation ? TEST_GATE_LOCATION : userLocation;
  const isUserInsideHospital = isLocationInsideBoundary(rawUserLocation, boundaryData);
  const effectiveUserLocation = isUserInsideHospital ? rawUserLocation : null;

  // Geolocation tracking effect
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsStatus('error');
      return;
    }

    setGpsStatus('tracking');
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude });
      },
      (err) => {
        console.error('Error getting geolocation:', err);
        if (err.code === err.PERMISSION_DENIED) {
          setGpsStatus('denied');
        } else {
          setGpsStatus('error');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  // Camera stream control effect
  useEffect(() => {
    let activeStream = null;

    async function startCamera() {
      if (showQrModal) {
        setQrCameraError(null);
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' } // prefer back camera
          });
          activeStream = stream;
          setQrStream(stream);
        } catch (err) {
          console.error('Error accessing camera:', err);
          setQrCameraError('Không thể truy cập camera. Vui lòng cấp quyền camera cho ứng dụng.');
        }
      }
    }

    startCamera();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
      setQrStream(null);
    };
  }, [showQrModal]);

  // Bind video element's srcObject when stream is active
  useEffect(() => {
    if (videoRef.current && qrStream) {
      videoRef.current.srcObject = qrStream;
    }
  }, [qrStream, showQrModal]);

  useEffect(() => {
    async function loadData() {
      try {
        const [nextMapData, nextBoundaryData] = await Promise.all([
          fetchGeoJson('map-01'),
          fetchGeoJson('boundary')
        ]);

        setMapData(nextMapData);
        setBoundaryData(nextBoundaryData);
        const nextPlaces = buildMapPlaceIndex(nextMapData);
        setPlaces(nextPlaces);
        setStatus('Sẵn sàng');
        setError(null);
        if (nextPlaces.length > 0) {
          setRouteFrom(GPS_ROUTE_START_ID);
          setRouteTo(nextPlaces.length > 1 ? nextPlaces[1].id : nextPlaces[0].id);
        }
      } catch (err) {
        setError(err.message || 'Không thể tải dữ liệu vị trí');
        setStatus('Lỗi tải dữ liệu');
      }
    }

    loadData();
  }, []);

  useEffect(() => {
    if (!rawUserLocation || !boundaryData || isUserInsideHospital) return;

    setRoute(null);
    setSelectedPlace(null);
    setNearestStartNode(null);
    setNearbyElectricVehicles([]);
    setVehicleCallStatus('idle');
    setRouteFrom(GPS_ROUTE_START_ID);
  }, [rawUserLocation, boundaryData, isUserInsideHospital]);

  useEffect(() => {
    let isMounted = true;

    async function loadElectricVehicleGps() {
      try {
        const vehicles = await Promise.all(
          ELECTRIC_VEHICLE_DEVICE_IDS.map(async (deviceId) => {
            const result = await fetchElectricVehicleGps(deviceId);
            const gps = result?.data?.gps || result?.data;
            const lat = Number(gps?.latitude ?? gps?.lat);
            const lng = Number(gps?.longitude ?? gps?.lng ?? gps?.lon);

            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
              throw new Error(`Dữ liệu GPS xe điện không hợp lệ: ${deviceId}`);
            }

            return {
              id: deviceId,
            lat,
            lng,
              device: result.device || deviceId,
            satellites: gps?.satellites,
            speed: gps?.speed,
            timestamp: gps?.timestamp,
            wifiSignal: gps?.wifiSignal
            };
          })
        );

        if (isMounted) {
          const vehiclesInsideHospital = vehicles.filter((vehicle) =>
            isLocationInsideBoundary(vehicle, boundaryData)
          );

          setElectricVehicles(vehiclesInsideHospital);
          setNearbyElectricVehicles((current) => {
            if (vehicleCallStatus !== 'active' || !effectiveUserLocation) return current;
            return vehiclesInsideHospital
              .map((vehicle) => ({
                ...vehicle,
                distanceKm: haversineDistanceKm([effectiveUserLocation.lat, effectiveUserLocation.lng], [vehicle.lat, vehicle.lng])
              }))
              .sort((a, b) => a.distanceKm - b.distanceKm)
              .slice(0, NEARBY_VEHICLE_LIMIT);
          });
          setElectricVehicleStatus(vehiclesInsideHospital.length > 0 ? 'online' : 'outside');
        }
      } catch (err) {
        console.error('Error loading electric vehicle GPS:', err);
        if (isMounted) {
          setElectricVehicleStatus('error');
        }
      }
    }

    loadElectricVehicleGps();
    const intervalId = window.setInterval(loadElectricVehicleGps, 5000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [boundaryData, effectiveUserLocation, vehicleCallStatus]);

  const filteredPlaces = useMemo(() => queryPlaces(places, placeQuery), [places, placeQuery]);

  const routePlaces = places;

  const routeFromLabel = nearestStartNode
    ? `Vị trí GPS của bạn (${nearestStartNode.label || 'đường gần nhất'})`
    : 'Vị trí GPS của bạn';
  const routeToLabel = routePlaces.find((item) => item.id === routeTo)?.label || routeTo;
  const visibleElectricVehicles = (nearbyElectricVehicles.length > 0 ? nearbyElectricVehicles : electricVehicles)
    .filter((vehicle) => isLocationInsideBoundary(vehicle, boundaryData));
  const nearestVehicle = visibleElectricVehicles[0] || null;
  const nearestVehicleDistanceText = nearestVehicle && Number.isFinite(nearestVehicle.distanceKm)
    ? `${Math.round(nearestVehicle.distanceKm * 1000)}m`
    : null;

  const findNearestPickupPlace = (location) => {
    if (!location || !places.length) return null;

    return places.reduce((nearest, place) => {
      if (!place.coords) return nearest;
      const distanceKm = haversineDistanceKm([location.lat, location.lng], place.coords);
      if (!nearest || distanceKm < nearest.distanceKm) {
        return {
          ...place,
          distanceKm,
          distanceMeters: Math.round(distanceKm * 1000)
        };
      }
      return nearest;
    }, null);
  };

  const handleSelectPlace = (place) => {
    setSelectedPlace(place);
    setRouteTo(place.id);
    setPlaceQuery('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSearchRoute = async () => {
    if (!rawUserLocation) {
      setError('Chưa có vị trí GPS của bạn. Vui lòng cấp quyền vị trí và thử lại.');
      return;
    }
    if (!isUserInsideHospital) {
      setError('Vị trí GPS của bạn đang ngoài khuôn viên bệnh viện.');
      return;
    }
    if (!routeTo) {
      setError('Vui lòng chọn điểm đến.');
      return;
    }
    const nearestNode = findNearestMapRoadNode(effectiveUserLocation, mapData);
    if (!nearestNode) {
      setError('Không tìm thấy điểm đường gần vị trí GPS hiện tại.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      let nextRoute;
      if (nearestNode.id === routeTo) {
        nextRoute = prependGpsConnector({ type: 'FeatureCollection', features: [] }, effectiveUserLocation, nearestNode);
      } else {
        const result = await getRoute(nearestNode.id, routeTo);
        nextRoute = prependGpsConnector(result.route || null, effectiveUserLocation, nearestNode);
      }
      setNearestStartNode(nearestNode);
      setRouteFrom(nearestNode.id);
      setRoute(nextRoute);
      setStatus('Đã tìm đường từ GPS');
      setPlaceQuery('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err.message || 'Không thể tìm đường');
      setRoute(null);
      setNearestStartNode(null);
      setStatus('Lỗi định tuyến');
    } finally {
      setLoading(false);
    }
  };

  const handleCallElectricVehicle = async () => {
    if (!rawUserLocation) {
      setError('Chưa có vị trí của bạn để gọi xe điện. Vui lòng bật vị trí mô phỏng hoặc cấp quyền GPS.');
      setVehicleCallStatus('error');
      return;
    }
    if (!isUserInsideHospital) {
      setError('Vị trí GPS của bạn đang ngoài khuôn viên bệnh viện nên chưa thể gọi xe điện.');
      setVehicleCallStatus('error');
      return;
    }

    if (!electricVehicles.length) {
      setError('Chưa có xe điện nào trong khuôn viên bệnh viện để hiển thị.');
      setVehicleCallStatus('error');
      return;
    }

    const sortedVehicles = electricVehicles
      .map((vehicle) => ({
        ...vehicle,
        distanceKm: haversineDistanceKm([effectiveUserLocation.lat, effectiveUserLocation.lng], [vehicle.lat, vehicle.lng])
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, NEARBY_VEHICLE_LIMIT);

    setVehicleCallStatus('sending');
    setError(null);

    try {
      const pickupPlace = findNearestPickupPlace(effectiveUserLocation);

      await sendElectricVehicleRequest({
        pickup: {
          lat: effectiveUserLocation.lat,
          lng: effectiveUserLocation.lng,
          label: pickupPlace?.label || 'Vị trí người dùng',
          nearestPlaceId: pickupPlace?.id || null,
          distanceToNearestPlaceMeters: pickupPlace?.distanceMeters ?? null
        },
        vehicle: {
          device: sortedVehicles[0].device || sortedVehicles[0].id,
          distanceMeters: Math.round(sortedVehicles[0].distanceKm * 1000)
        }
      });

      setNearbyElectricVehicles(sortedVehicles);
      setVehicleFocusRequest((current) => current + 1);
      setVehicleCallStatus('active');
      setStatus('Đã gửi yêu cầu gọi xe điện');
    } catch (err) {
      setVehicleCallStatus('error');
      setError(err.message || 'Không thể gửi yêu cầu gọi xe điện.');
      setStatus('Lỗi gọi xe điện');
    }
  };

  const handleEndRoute = () => {
    setRoute(null);
    setSelectedPlace(null);
    setNearestStartNode(null);
    setRouteFrom(GPS_ROUTE_START_ID);
    setStatus('Sẵn sàng');
  };

  const handleReset = () => {
    setRoute(null);
    setSelectedPlace(null);
    setNearestStartNode(null);
    setNearbyElectricVehicles([]);
    setVehicleCallStatus('idle');
    setRouteFrom(GPS_ROUTE_START_ID);
    setError(null);
    setStatus('Sẵn sàng');
  };

  return (
    <div className={`app-shell ${activePage === 'map' ? 'map-focus' : ''}`}>
      <header className="top-header">
        <div className="brand-card header-brand">
          <div className="brand-visual">+</div>
          <div>
            <p className="brand-title">BỆNH VIỆN NHI ĐỒNG 2</p>
            <p className="brand-subtitle">Bản đồ nội bộ bệnh viện</p>
          </div>
        </div>

        <div className="header-actions">
          <button
            className={`menu-item desktop-header-action ${activePage === 'home' ? 'active' : ''}`}
            onClick={() => setActivePage('home')}
          >
            Trang chủ
          </button>
          <button
            className={`menu-item desktop-header-action ${activePage === 'map' ? 'active' : ''}`}
            onClick={() => setActivePage('map')}
          >
            Bản đồ
          </button>
          <button className="menu-item desktop-header-action">Hướng dẫn</button>
          <button className="button primary header-qr-btn desktop-header-action" onClick={() => setShowQrModal(true)}>Quét QR</button>

          <div className="mobile-header-menu">
            <button
              type="button"
              className="button secondary header-menu-toggle"
              onClick={() => setHeaderMenuOpen((current) => !current)}
              aria-expanded={headerMenuOpen}
              aria-haspopup="menu"
            >
              Menu
            </button>

            {headerMenuOpen && (
              <div className="header-dropdown" role="menu">
                <button
                  type="button"
                  className={`header-dropdown-item ${activePage === 'home' ? 'active' : ''}`}
                  onClick={() => {
                    setActivePage('home');
                    setHeaderMenuOpen(false);
                  }}
                >
                  Trang chủ
                </button>
                <button
                  type="button"
                  className={`header-dropdown-item ${activePage === 'map' ? 'active' : ''}`}
                  onClick={() => {
                    setActivePage('map');
                    setHeaderMenuOpen(false);
                  }}
                >
                  Bản đồ
                </button>
                <button type="button" className="header-dropdown-item" onClick={() => setHeaderMenuOpen(false)}>
                  Hướng dẫn
                </button>
                <button
                  type="button"
                  className="header-dropdown-item primary"
                  onClick={() => {
                    setShowQrModal(true);
                    setHeaderMenuOpen(false);
                  }}
                >
                  Quét QR
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className="page-grid">
          <Sidebar
            status={status}
            error={error}
            places={places}
            placeQuery={placeQuery}
            setPlaceQuery={setPlaceQuery}
            filteredPlaces={filteredPlaces}
            onSelectPlace={handleSelectPlace}
          />

          <section className="map-panel">
            <div className="map-wrapper">
              <div className={`map-top-card ${mobileRoutePanelOpen ? 'is-expanded' : 'is-collapsed'}`}>
                <button
                  type="button"
                  className="map-top-toggle"
                  onClick={() => setMobileRoutePanelOpen((current) => !current)}
                  aria-expanded={mobileRoutePanelOpen}
                >
                  <span>
                    <strong>Chỉ đường</strong>
                    <small>{route ? 'Đang có lộ trình' : routeToLabel || 'Chọn điểm đến'}</small>
                  </span>
                  <b>{mobileRoutePanelOpen ? 'Thu gọn' : 'Mở'}</b>
                </button>

                <div className="map-top-content">
                  <div className="map-top-field">
                    <label>Vị trí của bạn</label>
                    <input
                      className="field-input"
                      value={
                        rawUserLocation
                          ? `${rawUserLocation.lat.toFixed(5)}, ${rawUserLocation.lng.toFixed(5)}${useTestGateLocation ? ' (mô phỏng)' : isUserInsideHospital ? '' : ' (ngoài khuôn viên)'}`
                          : 'Đang chờ GPS'
                      }
                      readOnly
                    />
                  </div>
                  <div className="map-top-field">
                    <label>Đến</label>
                    <select className="field-input" value={routeTo} onChange={(event) => setRouteTo(event.target.value)}>
                      <option value="" disabled>Chọn điểm đến</option>
                      {routePlaces.map((item) => (
                        <option key={`to-${item.id}`} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="route-actions">
                    <button className="button primary" onClick={handleSearchRoute} disabled={loading || !effectiveUserLocation || !routeTo}>
                      {loading ? 'Đang tìm...' : route ? 'Cập nhật chỉ đường' : 'Bắt đầu chỉ đường'}
                    </button>
                    {route && (
                      <button className="button secondary" onClick={handleEndRoute}>
                        Kết thúc dẫn đường
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <MapView
                center={INITIAL_CENTER}
                mapData={mapData}
                boundaryData={boundaryData}
                route={route}
                selectedPlace={selectedPlace}
                userLocation={effectiveUserLocation}
                electricVehicleLocations={visibleElectricVehicles}
                focusElectricVehicles={nearbyElectricVehicles.length > 0}
                vehicleFocusRequest={vehicleFocusRequest}
                layoutMode={activePage}
              />

              {(route || selectedPlace) && (
                <div className="map-overlay-card route-summary-card">
                  <div className="overlay-meta">
                    <div>
                      <span>Điểm đi</span>
                      <strong>{routeFromLabel || 'Chưa chọn'}</strong>
                    </div>
                    <div>
                      <span>Đến</span>
                      <strong>{routeToLabel || 'Chưa chọn'}</strong>
                    </div>
                    <div>
                      <span>Trạng thái</span>
                      <strong>{route ? 'Đang dẫn đường' : 'Chưa có lộ trình'}</strong>
                    </div>
                  </div>
                  {route && (
                    <div className="overlay-actions">
                      <button className="button secondary route-end-button" onClick={handleEndRoute}>
                        Kết thúc dẫn đường
                      </button>
                    </div>
                  )}
                </div>
              )}

              {nearestVehicle && (
                <div className={`map-overlay-card vehicle-summary-card ${route || selectedPlace ? 'with-route-summary' : ''}`}>
                  <div className="overlay-meta vehicle-overlay-meta">
                    <div>
                      <span>Xe điện gần nhất</span>
                      <strong>{nearestVehicleDistanceText || 'Đang tính khoảng cách'}</strong>
                    </div>
                    <div>
                      <span>Thiết bị</span>
                      <strong>{nearestVehicle.device}</strong>
                    </div>
                    <div>
                      <span>Trạng thái</span>
                      <strong>Đang hiển thị trên bản đồ</strong>
                    </div>
                  </div>
                  <div className="overlay-actions">
                    <button className="button secondary route-end-button" onClick={() => {
                      setNearbyElectricVehicles([]);
                      setVehicleCallStatus('idle');
                    }}>
                      Ẩn xe điện
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <aside className="right-panel">
            <div className="map-tool-panel">
              <button type="button" className="map-tool-button" onClick={() => setShowLegendModal(true)}>
                <span>
                  <strong>Chú thích</strong>
                  <small>Màu sắc và ký hiệu</small>
                </span>
                <b>?</b>
              </button>

              <button
                type="button"
                className="map-tool-button vehicle-tool-button"
                onClick={handleCallElectricVehicle}
                disabled={!effectiveUserLocation || electricVehicleStatus !== 'online' || vehicleCallStatus === 'sending'}
              >
                <span>
                  <strong>{vehicleCallStatus === 'sending' ? 'Đang gọi xe' : 'Xe điện'}</strong>
                  <small>
                    {vehicleCallStatus === 'sending'
                      ? 'Đang gửi yêu cầu'
                      : nearestVehicleDistanceText
                      ? `Xe gần nhất ${nearestVehicleDistanceText}`
                      : electricVehicleStatus === 'online'
                        ? `${electricVehicles.length} xe online`
                        : electricVehicleStatus === 'loading'
                          ? 'Đang kết nối'
                          : electricVehicleStatus === 'outside'
                            ? 'Ngoài khuôn viên'
                            : 'Mất kết nối'}
                  </small>
                </span>
                <b>X</b>
              </button>

              <button type="button" className="map-tool-button" onClick={() => setShowStatusModal(true)}>
              <span>
                  <strong>Cài đặt</strong>
                <small>{status}</small>
              </span>
                <b>C</b>
            </button>
            </div>
          </aside>
        </div>

        {error && (
          <div className="notification-stack" role="status" aria-live="polite">
            <div className="error-banner">
              <strong>Thông báo</strong>
              <span>{error}</span>
            </div>
          </div>
        )}

        {showLegendModal && (
          <div className="modal-overlay" onClick={() => setShowLegendModal(false)}>
            <div className="modal info-modal" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <h3>Chú thích bản đồ</h3>
                <button className="close-btn" type="button" onClick={() => setShowLegendModal(false)}>×</button>
              </div>
              <div className="legend-list">
                <div className="legend-entry">
                  <span className="legend-chip chip-primary" />
                  <span>Khu khám bệnh</span>
                </div>
                <div className="legend-entry">
                  <span className="legend-chip chip-warning" />
                  <span>Khu cấp cứu</span>
                </div>
                <div className="legend-entry">
                  <span className="legend-chip chip-accent" />
                  <span>Khu kỹ thuật</span>
                </div>
                <div className="legend-entry">
                  <span className="legend-chip chip-service" />
                  <span>Khu dịch vụ</span>
                </div>
                <div className="legend-entry">
                  <span className="legend-chip chip-pharmacy" />
                  <span>Nhà thuốc</span>
                </div>
                <div className="legend-entry">
                  <span className="legend-chip chip-vehicle" />
                  <span>Xe điện</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {showStatusModal && (
          <div className="modal-overlay" onClick={() => setShowStatusModal(false)}>
            <div className="modal info-modal status-modal" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <h3>Cài đặt và trạng thái</h3>
                <button className="close-btn" type="button" onClick={() => setShowStatusModal(false)}>×</button>
              </div>

              <div className="status-grid">
                <div className="status-row">
                  <span className="status-label">Bản đồ</span>
                  <span className={`status-chip ${status.includes('Lỗi') ? 'status-danger' : 'status-success'}`}>
                    <span className="status-dot" />
                    {status}
                  </span>
                </div>

                <div className="status-row">
                  <span className="status-label">GPS</span>
                  {useTestGateLocation && (
                    <span className="status-chip status-warning">
                      <span className="status-dot" />
                      Mô phỏng
                    </span>
                  )}
                  {!useTestGateLocation && gpsStatus === 'prompt' && (
                    <span className="status-chip status-muted">
                      <span className="status-dot" />
                      Đang khởi tạo
                    </span>
                  )}
                  {!useTestGateLocation && gpsStatus === 'tracking' && (
                    <span className={`status-chip ${isUserInsideHospital ? 'status-success' : 'status-danger'}`}>
                      <span className="status-dot" />
                      {isUserInsideHospital ? 'Trong khuôn viên' : 'Ngoài khuôn viên'}
                    </span>
                  )}
                  {!useTestGateLocation && gpsStatus === 'denied' && (
                    <span className="status-chip status-warning">
                      <span className="status-dot" />
                      Bị từ chối
                    </span>
                  )}
                  {!useTestGateLocation && gpsStatus === 'error' && (
                    <span className="status-chip status-danger">
                      <span className="status-dot" />
                      Lỗi định vị
                    </span>
                  )}
                </div>

                <div className="status-row">
                  <span className="status-label">Vị trí mô phỏng</span>
                  <label className="status-toggle">
                    <input
                      type="checkbox"
                      checked={useTestGateLocation}
                      onChange={(event) => setUseTestGateLocation(event.target.checked)}
                    />
                    <span>{useTestGateLocation ? 'Cổng Lý Tự Trọng' : 'Tắt'}</span>
                  </label>
                </div>

                <div className="status-row">
                  <span className="status-label">Xe điện</span>
                  <span className={`status-chip ${electricVehicleStatus === 'online' ? 'status-success' : electricVehicleStatus === 'loading' ? 'status-muted' : electricVehicleStatus === 'outside' ? 'status-warning' : 'status-danger'}`}>
                    <span className="status-dot" />
                    {electricVehicleStatus === 'online' ? `${electricVehicles.length} xe trong khuôn viên` : electricVehicleStatus === 'loading' ? 'Đang kết nối' : electricVehicleStatus === 'outside' ? 'Ngoài khuôn viên' : 'Mất kết nối'}
                  </span>
                </div>
              </div>

              {rawUserLocation && (
                <div className="status-coordinates">
                  Người dùng: {rawUserLocation.lat.toFixed(5)}, {rawUserLocation.lng.toFixed(5)}
                  {useTestGateLocation ? ' (cổng Lý Tự Trọng)' : ''}
                  {!isUserInsideHospital ? ' - ngoài khuôn viên' : ''}
                </div>
              )}

              {nearbyElectricVehicles[0] && (
                <div className="status-coordinates vehicle-coordinates">
                  Xe gần nhất: {nearbyElectricVehicles[0].lat.toFixed(5)}, {nearbyElectricVehicles[0].lng.toFixed(5)}
                  {Number.isFinite(nearbyElectricVehicles[0].distanceKm) ? ` (${Math.round(nearbyElectricVehicles[0].distanceKm * 1000)}m)` : ''}
                </div>
              )}

              <button className="button secondary block status-reset-button" onClick={handleReset}>Làm mới bản đồ</button>
            </div>
          </div>
        )}

        {showQrModal && (
          <div className="modal-overlay" onClick={() => setShowQrModal(false)}>
            <div className="modal qr-scanner-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Quét Mã QR</h3>
                <button className="close-btn" onClick={() => setShowQrModal(false)}>×</button>
              </div>
              
              <div className="qr-scanner-viewport">
                {qrCameraError ? (
                  <div className="qr-scanner-error">
                    <span className="error-icon">⚠️</span>
                    <p>{qrCameraError}</p>
                  </div>
                ) : (
                  <>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="qr-scanner-video"
                    />
                    <div className="qr-scanner-overlay">
                      <div className="scanner-target-box">
                        <div className="corner top-left"></div>
                        <div className="corner top-right"></div>
                        <div className="corner bottom-left"></div>
                        <div className="corner bottom-right"></div>
                        <div className="scanner-laser-line"></div>
                      </div>
                      <p className="scanner-instruction">Đưa mã QR của phòng/điểm vào giữa khung hình để quét</p>
                    </div>
                  </>
                )}
              </div>

              <div className="modal-actions">
                <button className="button secondary block" onClick={() => setShowQrModal(false)}>Đóng</button>
              </div>

              {/* Cấu trúc chuẩn bị tích hợp giải mã QR:
                  1. Trong tương lai, chúng ta có thể sử dụng thư viện như html5-qrcode hoặc jsQR.
                  2. Cách triển khai:
                     - Sử dụng requestAnimationFrame để vẽ khung hình từ thẻ video lên một canvas ẩn.
                     - Lấy imageData = context.getImageData(0, 0, width, height).
                     - Sử dụng thư viện giải mã: const code = jsQR(imageData.data, width, height).
                     - Nếu phát hiện code.data:
                         - Kích hoạt callback dẫn đường hoặc nhận diện phòng.
                         - Đóng modal: setShowQrModal(false).
              */}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
