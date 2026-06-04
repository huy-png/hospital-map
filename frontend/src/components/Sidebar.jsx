import { useState } from 'react';

export default function Sidebar({
  error,
  places,
  placeQuery,
  setPlaceQuery,
  filteredPlaces,
  onSelectPlace
}) {
  const [activePopup, setActivePopup] = useState(null);

  const quickItems = [
    { label: 'Khoa khám bệnh', hint: 'Phòng khám đa khoa', icon: '🩺' },
    { label: 'Khoa cấp cứu', hint: 'Cấp cứu 24/7', icon: '🚨' },
    { label: 'Nhà thuốc', hint: 'Thuốc và dịch vụ', icon: '💊' },
    { label: 'Bãi giữ xe', hint: 'Khu đậu xe', icon: '🅿️' },
    { label: 'ATM', hint: 'Rút tiền', icon: '🏧' },
    { label: 'Nhà vệ sinh', hint: 'Tiện ích', icon: '🚻' },
    { label: 'Quầy thông tin', hint: 'Hỗ trợ khách', icon: 'ℹ️' }
  ];

  const areas = [
    'Toàn khu',
    'Khu A - Khu khám bệnh',
    'Khu B - Khu điều trị nội trú',
    'Khu C - Khu kỹ thuật',
    'Khu D - Dịch vụ'
  ];

  const handleQuickClick = (item) => {
    const queryMap = {
      'Khoa khám bệnh': 'sanh',
      'Khoa cấp cứu': 'gate',
      'Nhà thuốc': 'cantin',
      'Bãi giữ xe': 'nhaxe',
      ATM: 'sanh',
      'Nhà vệ sinh': 'cantin',
      'Quầy thông tin': 'sanh'
    };
    const searchVal = queryMap[item.label] || item.label;
    setPlaceQuery(searchVal);
  };

  const handleAreaClick = (area) => {
    setPlaceQuery(area);
    setActivePopup(null);
  };

  return (
    <aside className="sidebar">
      <div className="card card-search">
        <div className="card-title">Tìm kiếm nhanh</div>
        <label className="field-label" htmlFor="quick-place-select">Chọn tiện ích</label>
        <select
          id="quick-place-select"
          className="field-input quick-select"
          defaultValue=""
          onChange={(event) => {
            const selectedItem = quickItems.find((item) => item.label === event.target.value);
            if (selectedItem) handleQuickClick(selectedItem);
          }}
        >
          <option value="" disabled>Chọn nhóm địa điểm</option>
          {quickItems.map((item) => (
            <option key={item.label} value={item.label}>
              {item.icon} {item.label}
            </option>
          ))}
        </select>

        <div className="search-section">
          <label className="field-label">Tra cứu địa điểm</label>
          <input
            type="text"
            className="field-input"
            value={placeQuery}
            placeholder="Nhập tên hoặc mã điểm"
            onChange={(event) => setPlaceQuery(event.target.value)}
          />

          <div className="search-results">
            {filteredPlaces.length > 0 ? (
              filteredPlaces.slice(0, 8).map((item) => (
                <button key={item.id} className="list-item" onClick={() => onSelectPlace(item)}>
                  <span>{item.label}</span>
                  <span className="badge">{item.source}</span>
                </button>
              ))
            ) : (
              <p className="empty-state">Không tìm thấy địa điểm.</p>
            )}
          </div>
        </div>
      </div>

      <div className="sidebar-popup-actions">
        <button type="button" className="sidebar-popup-button" onClick={() => setActivePopup('areas')}>
          <span className="sidebar-popup-icon" aria-hidden="true">+</span>
          <span>Tầng / Khu vực</span>
        </button>
        <button type="button" className="sidebar-popup-button" onClick={() => setActivePopup('contact')}>
          <span className="sidebar-popup-icon" aria-hidden="true">i</span>
          <span>Thông tin liên hệ</span>
        </button>
      </div>

      {activePopup === 'areas' && (
        <div className="modal-overlay" onClick={() => setActivePopup(null)}>
          <div className="modal info-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Tầng / Khu vực</h3>
              <button className="close-btn" type="button" onClick={() => setActivePopup(null)}>×</button>
            </div>
            <div className="area-list">
              {areas.map((area) => (
                <button key={area} type="button" className="area-item" onClick={() => handleAreaClick(area)}>
                  {area}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {activePopup === 'contact' && (
        <div className="modal-overlay" onClick={() => setActivePopup(null)}>
          <div className="modal info-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Thông tin liên hệ</h3>
              <button className="close-btn" type="button" onClick={() => setActivePopup(null)}>×</button>
            </div>
            <div className="contact-item">
              <span>Điện thoại</span>
              <strong>(028) 1234 5678</strong>
            </div>
            <div className="contact-item">
              <span>Email</span>
              <strong>info@benhvienabc.vn</strong>
            </div>
            <div className="contact-item">
              <span>Địa chỉ</span>
              <strong>123 Đường Y Tế, P. An Lạc, Q. Bình Tân, TP.HCM</strong>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="card card-error">
          <strong>Lỗi</strong>
          <p>{error}</p>
        </div>
      )}
    </aside>
  );
}
