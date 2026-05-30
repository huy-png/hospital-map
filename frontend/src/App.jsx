import { useEffect, useMemo, useState } from 'react';
import MapView from './components/MapView.jsx';
import Sidebar from './components/Sidebar.jsx';
import { fetchGeoJson, getRoute } from './services/api.js';
import { buildPlaceIndex, queryPlaces } from './utils/geo.js';

const INITIAL_CENTER = [10.7813, 106.7030];

function App() {
  const [geoData, setGeoData] = useState({ road: null, building: null, point: null, boundary: null });
  const [places, setPlaces] = useState([]);
  const [placeQuery, setPlaceQuery] = useState('');
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [routeFrom, setRouteFrom] = useState('');
  const [routeTo, setRouteTo] = useState('');
  const [route, setRoute] = useState(null);
  const [status, setStatus] = useState('Sẵn sàng');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [layers, setLayers] = useState({ road: true, building: true, point: true, boundary: false });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

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
          setRouteFrom(validRoutePlaces[0].id);
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

  const routeFromLabel = routePlaces.find((item) => item.id === routeFrom)?.label || routeFrom;
  const routeToLabel = routePlaces.find((item) => item.id === routeTo)?.label || routeTo;

  const handleSelectPlace = (place) => {
    setSelectedPlace(place);
    setRouteFrom(place.id);
    setPlaceQuery('');
  };

  const handleSearchRoute = async () => {
    if (!routeFrom || !routeTo) {
      setError('Vui lòng chọn điểm đi và điểm đến.');
      return;
    }
    if (routeFrom === routeTo) {
      setError('Điểm đi và điểm đến không được giống nhau.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await getRoute(routeFrom, routeTo);
      setRoute(result.route || null);
      setStatus('Đã tìm đường');
      setPlaceQuery('');
    } catch (err) {
      setError(err.message || 'Không thể tìm đường');
      setRoute(null);
      setStatus('Lỗi định tuyến');
    } finally {
      setLoading(false);
    }
  };

  const handleEndRoute = () => {
    setRoute(null);
    setSelectedPlace(null);
    setStatus('Sẵn sàng');
  };

  const handleReset = () => {
    setRoute(null);
    setSelectedPlace(null);
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
            <p className="brand-title">BỆNH VIỆN ĐA KHOA ABC</p>
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
            <div className="map-top-card">
              <div className="map-top-field">
                <label>Vị trí của bạn</label>
                <select className="field-input" value={routeFrom} onChange={(event) => setRouteFrom(event.target.value)}>
                  <option value="" disabled>Chọn điểm đi</option>
                  {routePlaces.map((item) => (
                    <option key={`from-${item.id}`} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
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
                <button className="button primary" onClick={handleSearchRoute} disabled={loading || !routeFrom || !routeTo}>
                  {loading ? 'Đang tìm...' : route ? 'Cập nhật chỉ đường' : 'Bắt đầu chỉ đường'}
                </button>
                {route && (
                  <button className="button secondary" onClick={handleEndRoute}>
                    Kết thúc dẫn đường
                  </button>
                )}
              </div>
            </div>

            {error && (
              <div className="error-banner">
                {error}
              </div>
            )}

            <div className="map-wrapper">
              <MapView center={INITIAL_CENTER} layers={layers} geoData={geoData} route={route} selectedPlace={selectedPlace} />

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

            <div className="card layers-card">
              <h3>Lớp bản đồ</h3>
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

            <div className="card status-card">
              <h3>Trạng thái</h3>
              <p className="status-summary">{status}</p>
              <p className="status-description">{route ? 'Đường dẫn đã được thiết lập.' : 'Chưa có tuyến được chọn.'}</p>
              <button className="button secondary" onClick={handleReset}>Làm mới bản đồ</button>
            </div>
          </aside>
        </div>

        {showQrModal && (
          <div className="modal-overlay" onClick={() => setShowQrModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>Quét QR</h3>
              <p>Chức năng quét QR sẽ mở trên thiết bị di động.</p>
              <button className="button primary" onClick={() => setShowQrModal(false)}>Đóng</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
