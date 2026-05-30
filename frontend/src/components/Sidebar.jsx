export default function Sidebar({
  status,
  error,
  places,
  placeQuery,
  setPlaceQuery,
  filteredPlaces,
  onSelectPlace
}) {
  const quickItems = [
    { label: 'Khoa khám bệnh', hint: 'Phòng khám đa khoa' },
    { label: 'Khoa cấp cứu', hint: 'Cấp cứu 24/7' },
    { label: 'Nhà thuốc', hint: 'Thuốc và dịch vụ' },
    { label: 'Bãi giữ xe', hint: 'Khu đậu xe' },
    { label: 'ATM', hint: 'Rút tiền' },
    { label: 'Nhà vệ sinh', hint: 'Tiện ích' },
    { label: 'Quầy thông tin', hint: 'Hỗ trợ khách' }
  ];

  const areas = [
    'Toàn khu',
    'Khu A - Khu khám bệnh',
    'Khu B - Khu điều trị nội trú',
    'Khu C - Khu kỹ thuật',
    'Khu D - Dịch vụ'
  ];

  return (
    <aside className="sidebar">
      <div className="card card-side">
        <div>
          <h1>Bệnh viện ABC</h1>
          <p className="subtitle">Tìm kiếm nhanh và điều hướng trong khuôn viên.</p>
        </div>
        <span className={`status-badge ${status === 'Sẵn sàng' ? 'status-ok' : 'status-warning'}`}>
          {status}
        </span>
      </div>

      <div className="card card-search">
        <div className="card-title">Tìm kiếm nhanh</div>
        <div className="quick-links-dropdown">
          <label className="dropdown-label">Chọn nhanh</label>
          <select className="quick-dropdown" onChange={(e) => {
            const idx = e.target.selectedIndex - 1;
            if (idx >= 0) {
              const item = quickItems[idx];
              // attempt to search by quick label
              setPlaceQuery(item.label);
            }
          }}>
            <option value="">-- Chọn --</option>
            {quickItems.map((item) => (
              <option key={item.label} value={item.label}>{item.label} - {item.hint}</option>
            ))}
          </select>
        </div>

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

      <div className="card card-areas">
        <div className="card-title">Tầng / Khu vực</div>
        <div className="area-list">
          {areas.map((area) => (
            <button key={area} type="button" className="area-item" onClick={() => setPlaceQuery(area)}>
              {area}
            </button>
          ))}
        </div>
      </div>

      <div className="card card-contact">
        <div className="contact-label">Thông tin liên hệ</div>
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

      {error && (
        <div className="card card-error">
          <strong>Lỗi</strong>
          <p>{error}</p>
        </div>
      )}
    </aside>
  );
}
