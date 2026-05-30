# Hospital Map

Dự án `hospital-map` là một ứng dụng bản đồ bệnh viện với backend xử lý dữ liệu GeoJSON và frontend hiển thị bản đồ, tìm địa điểm, và chức năng dẫn đường.

## Tổng quan

- `backend`: Node.js server cung cấp các file GeoJSON và API định tuyến.
- `frontend`: React + Vite ứng dụng hiển thị bản đồ qua Leaflet, giao diện tìm kiếm và dẫn đường.

## Cấu trúc thư mục

```
hospital-map/
  README.md
  backend/
    package.json
    src/
      server.js
      geojson/
        boundary.geojson
        building.geojson
        point.geojson
        road.geojson
  frontend/
    package.json
    vite.config.js
    index.html
    src/
      main.jsx
      App.jsx
      components/
        MapView.jsx
        Sidebar.jsx
      services/
        api.js
      utils/
        geo.js
      styles/
        globals.css
```

## Chức năng chính

### Backend

- Phục vụ dữ liệu GeoJSON:
  - `GET /geojson/road`
  - `GET /geojson/building`
  - `GET /geojson/point`
  - `GET /geojson/boundary`
- Tính toán đường đi ngắn nhất theo dữ liệu `road.geojson`:
  - `GET /route?from=<nodeId>&to=<nodeId>`
- Sử dụng thuật toán Dijkstra để tìm tuyến đường.

### Frontend

- Hiển thị bản đồ với Leaflet.
- Hiển thị các lớp: đường, tòa nhà, điểm, ranh giới.
- Thanh tìm kiếm địa điểm và danh sách kết quả.
- Chức năng dẫn đường từ điểm đi đến điểm đến.
- Bật/tắt lớp hiển thị để debug và nâng cấp dễ dàng.

## Thiết kế UX/UI

Màu sắc chính được sử dụng:

- `--bg: #F8FAFC`
- `--surface: #FFFFFF`
- `--building: #E2E8F0`
- `--road: #CBD5E1`
- `--border: #94A3B8`
- `--primary: #2563EB`
- `--success: #22C55E`
- `--warning: #F59E0B`
- `--danger: #EF4444`
- `--text: #0F172A`

Giao diện được thiết kế để dễ đọc, có cấu trúc sidebar + bản đồ, và các thành phần UI tách biệt để dễ chỉnh sửa.

## Hướng dẫn chạy

### Backend

1. Mở terminal vào `backend`:
   ```bash
   cd d:\projects\hospital-map\backend
   ```
2. Khởi động backend:
   ```bash
   npm start
   ```
3. Mặc định backend lắng nghe ở `http://localhost:3000`.

### Frontend

1. Mở terminal vào `frontend`:
   ```bash
   cd d:\projects\hospital-map\frontend
   ```
2. Cài đặt nếu chưa cài:
   ```bash
   npm install
   ```
3. Chạy ứng dụng:
   ```bash
   npm run dev
   ```
4. Mặc định Vite sẽ chạy ở `http://localhost:4173`.

## API tham khảo

- `GET /geojson/road`
- `GET /geojson/building`
- `GET /geojson/point`
- `GET /geojson/boundary`
- `GET /route?from=gate-ltr&to=IT-room`

Ví dụ trả về:
```json
{
  "status": "ok",
  "from": "gate-ltr",
  "to": "IT-room",
  "length_km": 0.16,
  "route": { ... }
}
```

## Ghi chú kỹ thuật

- Backend không cần `npm install` thêm nếu chỉ chạy server Node cơ bản; nhưng nếu cần mở rộng có thể thêm thư viện.
- Frontend dùng Vite, React, Leaflet; phần logic API và dữ liệu địa điểm đã tách riêng để dễ debug.
- `src/utils/geo.js` xây chỉ mục điểm và quản lý tìm kiếm.
- `src/components` tách biệt các phần hiển thị để dễ bảo trì.

## Nâng cấp sau này

- Thêm dữ liệu tên điểm hiển thị rõ ràng hơn trong `point.geojson`.
- Bổ sung autocomplete chuyên sâu.
- Thay Leaflet bằng Maplibre hoặc Mapbox nếu cần bản đồ phức tạp hơn.
- Mở rộng backend để lưu các node, tính năng cân bằng trọng số hoặc tránh đường.

---

Tệp này được thiết kế để giúp người đọc mới hiểu nhanh cấu trúc và cách chạy dự án.`