import { useEffect, useMemo, useState, useRef } from 'react';
import MapView from './components/MapView.jsx';
import Sidebar from './components/Sidebar.jsx';
import { fetchGeoJson, getRoute } from './services/api.js';
import {
  buildPlaceIndex,
  queryPlaces,
  checkUserLocationInHospital,
  findNearestRoadNode,
  prependGpsConnector
} from './utils/geo.js';

const INITIAL_CENTER = [10.7813, 106.7030];
const GPS_ROUTE_START_ID = 'gps-location';

function App() {
  const [geoData, setGeoData] = useState({ road: null, building: null, point: null, boundary: null });
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
  const [layers, setLayers] = useState({ road: true, building: true, point: true, boundary: false });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [mobileRoutePanelOpen, setMobileRoutePanelOpen] = useState(false);

  // GPS state variables
  const [userLocation, setUserLocation] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('prompt'); // prompt, tracking, denied, error
  const [isInsideHospital, setIsInsideHospital] = useState(true);
  const [isGeofenceEnabled, setIsGeofenceEnabled] = useState(true);

  // Camera QR scanner state variables
  const [qrStream, setQrStream] = useState(null);
  const [qrCameraError, setQrCameraError] = useState(null);
  const videoRef = useRef(null);

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

  // Geofencing verification effect
  useEffect(() => {
    if (!isGeofenceEnabled) {
      setIsInsideHospital(true);
      return;
    }

    if (userLocation && geoData.boundary) {
      const { inside } = checkUserLocationInHospital(
        userLocation.lat,
        userLocation.lng,
        geoData.boundary,
        20 // 20-meter buffer zone
      );
      setIsInsideHospital(inside);
    } else {
      setIsInsideHospital(true); // Default to true if GPS coordinates not loaded/denied
    }
  }, [isGeofenceEnabled, userLocation, geoData.boundary]);

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
        const [road, building, point, boundary] = await Promise.all([
          fetchGeoJson('road'),
          fetchGeoJson('building'),
          fetchGeoJson('point'),
          fetchGeoJson('boundary')
        ]);

        setGeoData({ road, building, point, boundary });
        const nextPlaces = buildPlaceIndex({ roadGeoJson: road, pointGeoJson: point });
        setPlaces(nextPlaces);
        setStatus('Sẵn sàng');
        setError(null);
        const roadIds = new Set();
        road.features.forEach((feature) => {
          const from = feature?.properties?.from;
          const to = feature?.properties?.to;
          if (typeof from === 'string' && from.trim()) roadIds.add(from.trim());
          if (typeof to === 'string' && to.trim()) roadIds.add(to.trim());
        });
        const validRoutePlaces = nextPlaces.filter((item) => roadIds.has(item.id));
        if (validRoutePlaces.length > 0) {
          setRouteFrom(GPS_ROUTE_START_ID);
          setRouteTo(validRoutePlaces.length > 1 ? validRoutePlaces[1].id : validRoutePlaces[0].id);
        }
      } catch (err) {
        setError(err.message || 'Không thể tải dữ liệu vị trí');
        setStatus('Lỗi tải dữ liệu');
      }
    }

    loadData();
  }, []);

  const filteredPlaces = useMemo(() => queryPlaces(places, placeQuery), [places, placeQuery]);

  const routeablePlaceIds = useMemo(() => {
    const ids = new Set();
    geoData.road?.features?.forEach((feature) => {
      const from = feature?.properties?.from;
      const to = feature?.properties?.to;
      if (typeof from === 'string' && from.trim()) ids.add(from.trim());
      if (typeof to === 'string' && to.trim()) ids.add(to.trim());
    });
    return ids;
  }, [geoData.road]);

  const routePlaces = useMemo(
    () => places.filter((item) => routeablePlaceIds.has(item.id)),
    [places, routeablePlaceIds]
  );

  const routeFromLabel = nearestStartNode
    ? `Vị trí GPS của bạn (${nearestStartNode.id})`
    : 'Vị trí GPS của bạn';
  const routeToLabel = routePlaces.find((item) => item.id === routeTo)?.label || routeTo;
  const activeLayerCount = Object.values(layers).filter(Boolean).length;

  const handleSelectPlace = (place) => {
    setSelectedPlace(place);
    setRouteTo(place.id);
    setPlaceQuery('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSearchRoute = async () => {
    if (!userLocation) {
      setError('Chưa có vị trí GPS của bạn. Vui lòng cấp quyền vị trí và thử lại.');
      return;
    }
    if (isGeofenceEnabled && !isInsideHospital) {
      setError('Bạn đang ở ngoài phạm vi hỗ trợ của hệ thống. Chức năng dẫn đường đã bị vô hiệu hóa.');
      return;
    }
    if (!routeTo) {
      setError('Vui lòng chọn điểm đến.');
      return;
    }
    const nearestNode = findNearestRoadNode(userLocation, geoData.road);
    if (!nearestNode) {
      setError('Không tìm thấy điểm đường gần vị trí GPS hiện tại.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      let nextRoute;
      if (nearestNode.id === routeTo) {
        nextRoute = prependGpsConnector({ type: 'FeatureCollection', features: [] }, userLocation, nearestNode);
      } else {
        const result = await getRoute(nearestNode.id, routeTo);
        nextRoute = prependGpsConnector(result.route || null, userLocation, nearestNode);
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
    setRouteFrom(GPS_ROUTE_START_ID);
    setError(null);
    setStatus('Sẵn sàng');
  };

  const toggleLayer = (layerKey) => {
    setLayers((current) => ({ ...current, [layerKey]: !current[layerKey] }));
  };

  return (
    <div className="app-shell">
      <header className="top-header">
        <div className="brand-card header-brand">
          <div className="brand-visual">+</div>
          <div>
            <p className="brand-title">BỆNH VIỆN NHI ĐỒNG 2</p>
            <p className="brand-subtitle">Bản đồ nội bộ bệnh viện</p>
          </div>
        </div>

        <div className="header-actions">
          <button className="menu-item active">Trang chủ</button>
          <button className="menu-item">Bản đồ</button>
          <button className="menu-item">Hướng dẫn</button>
          <button className="button primary header-qr-btn" onClick={() => setShowQrModal(true)}>Quét QR</button>
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
                        userLocation
                          ? `${userLocation.lat.toFixed(5)}, ${userLocation.lng.toFixed(5)}`
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
                    <button className="button primary" onClick={handleSearchRoute} disabled={loading || !userLocation || !routeTo || (isGeofenceEnabled && !isInsideHospital)}>
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
                layers={layers}
                geoData={geoData}
                route={route}
                selectedPlace={selectedPlace}
                userLocation={userLocation}
              />

              {(route || selectedPlace) && (
                <div className="map-overlay-card">
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
            </div>
          </section>

          <aside className="right-panel">
            <div className="card legend-card">
              <h3>Chú thích</h3>
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
              </div>
            </div>

            <details className="card layers-card layer-dropdown">
              <summary className="layer-dropdown-summary">
                <span>Lớp bản đồ</span>
                <strong>{activeLayerCount}/4 đang bật</strong>
              </summary>
              <div className="layer-dropdown-body">
                <div className="layer-toggle">
                  <label>
                    <input type="checkbox" checked={layers.road} onChange={() => toggleLayer('road')} />
                    Đường nội bộ
                  </label>
                </div>
                <div className="layer-toggle">
                  <label>
                    <input type="checkbox" checked={layers.building} onChange={() => toggleLayer('building')} />
                    Tòa nhà
                  </label>
                </div>
                <div className="layer-toggle">
                  <label>
                    <input type="checkbox" checked={layers.point} onChange={() => toggleLayer('point')} />
                    Điểm dịch vụ
                  </label>
                </div>
                <div className="layer-toggle">
                  <label>
                    <input type="checkbox" checked={layers.boundary} onChange={() => toggleLayer('boundary')} />
                    Ranh giới khu vực
                  </label>
                </div>
              </div>
            </details>
            <div className="card status-card">
              <h3>Trạng thái hệ thống</h3>

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
                  {gpsStatus === 'prompt' && (
                    <span className="status-chip status-muted">
                      <span className="status-dot" />
                      Đang khởi tạo
                    </span>
                  )}
                  {gpsStatus === 'tracking' && (
                    <span className={`status-chip ${isInsideHospital ? 'status-success' : 'status-danger'}`}>
                      <span className="status-dot" />
                      {isInsideHospital ? 'Trong phạm vi' : 'Ngoài phạm vi'}
                    </span>
                  )}
                  {gpsStatus === 'denied' && (
                    <span className="status-chip status-warning">
                      <span className="status-dot" />
                      Bị từ chối
                    </span>
                  )}
                  {gpsStatus === 'error' && (
                    <span className="status-chip status-danger">
                      <span className="status-dot" />
                      Lỗi định vị
                    </span>
                  )}
                </div>

                <div className="status-row">
                  <span className="status-label">Phạm vi</span>
                  <label className="status-toggle">
                    <input
                      type="checkbox"
                      checked={isGeofenceEnabled}
                      onChange={(event) => setIsGeofenceEnabled(event.target.checked)}
                    />
                    <span>{isGeofenceEnabled ? 'Đang kiểm tra' : 'Tắt demo'}</span>
                  </label>
                </div>
              </div>

              {userLocation && (
                <div className="status-coordinates">
                  {userLocation.lat.toFixed(5)}, {userLocation.lng.toFixed(5)}
                </div>
              )}

              <button className="button secondary block status-reset-button" onClick={handleReset}>Làm mới bản đồ</button>
            </div>
          </aside>
        </div>

        {(error || (isGeofenceEnabled && !isInsideHospital)) && (
          <div className="notification-stack" role="status" aria-live="polite">
            {isGeofenceEnabled && !isInsideHospital && (
              <div className="error-banner warning-banner-accent">
                <strong>Ngoài phạm vi hỗ trợ</strong>
                <span>Chức năng dẫn đường đã bị vô hiệu hóa.</span>
              </div>
            )}

            {error && (
              <div className="error-banner">
                <strong>Thông báo</strong>
                <span>{error}</span>
              </div>
            )}
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
