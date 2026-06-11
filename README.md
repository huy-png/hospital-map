# Hospital Map

Ứng dụng bản đồ nội bộ bệnh viện gồm backend Node.js phục vụ GeoJSON/API định tuyến và frontend React + Leaflet để tìm kiếm địa điểm, dẫn đường từ GPS, hiển thị vị trí người dùng và xe điện.

## Cấu Trúc

```text
hospital-map/
  backend/
    src/
      server.js
      geojson/
        boundary.geojson
        map-01.geojson
        map.png
  frontend/
    src/
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

## Tính Năng

- Frontend chỉ tải và hiển thị một nguồn GeoJSON chính: `map-01`.
- `boundary.geojson` được dùng làm ranh giới khuôn viên để giới hạn GPS người dùng và xe điện.
- Các `LineString` trong `map-01` được dùng cho định tuyến nhưng không hiển thị như lớp nền trên bản đồ.
- Người dùng chọn điểm đến từ các `Point` trong `map-01`, sau đó hệ thống tìm node đường gần GPS nhất trong khuôn viên và gọi API định tuyến.
- Xe điện được lấy vị trí từ Firebase qua backend, lọc theo `boundary.geojson`, rồi hiển thị bằng marker riêng.
- Bản đồ có nút `Về`, popup chú thích, popup trạng thái/cài đặt, QR scanner placeholder và layout fullscreen cho trang bản đồ.

## Backend

Backend chạy bằng Node.js thuần.

### API GeoJSON

```text
GET /geojson/map-01
GET /geojson/boundary
```

### API Định Tuyến

```text
GET /route?map=map-01&from=<coord:lon,lat>&to=<coord:lon,lat>
```

Ví dụ:

```text
GET /route?map=map-01&from=coord:106.703157,10.780525&to=coord:106.703358,10.782190
```

### API GPS Xe Điện

```text
GET /firebase/gps
GET /firebase/gps?device=<deviceId>
POST /firebase/vehicle-request
```

Backend đọc cấu hình Firebase từ biến môi trường hoặc `backend/.env`.

```text
PORT=3000
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_DATABASE_URL=
FIREBASE_PROJECT_ID=
FIREBASE_EMAIL=
FIREBASE_PASSWORD=
FIREBASE_GPS_ROOT=iot
FIREBASE_GPS_DEVICE=441D64F39AF0
FIREBASE_VEHICLE_REQUEST_ROOT=vehicleRequests
```

Khi người dùng bấm `Gọi xe điện`, frontend gửi điểm đón và xe được gọi tới `POST /firebase/vehicle-request`. Backend ghi request lên Firebase tại:

```text
vehicleRequests/<requestId>
vehicleRequests/latest
```

ESP32 có thể đọc `vehicleRequests/latest` để lấy yêu cầu mới nhất, hoặc theo dõi các key `req_<timestamp>`.

Gói tin được ghi lên Firebase có dạng gọn:

```json
{
  "id": "req_1780000000000",
  "status": "pending",
  "createdAt": "2026-06-12T00:00:00.000Z",
  "source": "web-map",
  "pickup": {
    "lat": 10.780525,
    "lng": 106.703157,
    "label": "Cổng Lý Tự Trọng",
    "nearestPlaceId": "coord:106.703157,10.780525",
    "distanceToNearestPlaceMeters": 0
  },
  "vehicle": {
    "device": "441D64F39AF0",
    "distanceMeters": 120
  }
}
```

### Health Check

```text
GET /
GET /health
```

## Chạy Dự Án

### Backend

```bash
cd d:\projects\hospital-map\backend
npm start
```

Backend mặc định chạy tại:

```text
http://localhost:3000
```

### Frontend

```bash
cd d:\projects\hospital-map\frontend
npm install
npm run dev
```

Theo `vite.config.js`, frontend chạy tại:

```text
http://localhost:4173
```

### Kiểm Tra Nhanh

```bash
cd d:\projects\hospital-map\frontend
npm run build
```

```bash
cd d:\projects\hospital-map
node --check backend\src\server.js
```
