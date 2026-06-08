# Hospital Map

Ứng dụng bản đồ nội bộ bệnh viện, gồm backend phục vụ dữ liệu GeoJSON/API định tuyến và frontend React hiển thị bản đồ Leaflet, tìm kiếm địa điểm, dẫn đường từ GPS, quản lý lớp bản đồ và hiển thị xe điện gần người dùng.

## Tổng Quan

- `backend`: Node.js HTTP server đọc dữ liệu GeoJSON, tính tuyến đường bằng Dijkstra và lấy dữ liệu GPS xe điện từ Firebase Realtime Database.
- `frontend`: React + Vite + Leaflet hiển thị bản đồ bệnh viện, trang bản đồ fullscreen, điều khiển lớp bản đồ, popup cài đặt/trạng thái, vị trí người dùng và xe điện.

## Cấu Trúc Thư Mục

```text
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
        map-1.0.geojson
        map.png
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

## Tính Năng Chính

### Bản Đồ

- Hiển thị các lớp GeoJSON: đường, tòa nhà, điểm, ranh giới và `map-1.0`.
- Lớp `map-1.0` được hiển thị như bản đồ chi tiết, giữ nguyên cách viết nhãn thay vì tự đổi hoa/thường.
- Có nút bật/tắt từng lớp bản đồ trong popup `Lớp bản đồ`.
- Hỗ trợ zoom in/out và kéo bản đồ không giới hạn theo mức zoom Leaflet.
- Có nút `Về` trên bản đồ để đưa camera về khung bệnh viện.
- Trang `Bản đồ` dùng layout fullscreen, các chức năng được đặt nổi xung quanh bản đồ.

### Dẫn Đường

- Người dùng có thể chọn điểm đến và tìm đường từ vị trí GPS hiện tại.
- Có vị trí mô phỏng tại `Cổng Lý Tự Trọng` để test chức năng dẫn đường.
- Hệ thống tìm node đường gần GPS nhất trong `map-1.0`, sau đó gọi API route.
- Nếu GPS nằm ngoài phạm vi bệnh viện và geofence đang bật, chức năng dẫn đường sẽ bị vô hiệu hóa.
- Camera bản đồ chỉ tự fit khi có ngữ cảnh mới như tải lần đầu, chọn điểm/tuyến mới hoặc gọi xe điện; việc zoom/pan thủ công không còn bị reset bởi dữ liệu realtime.

### Xe Điện

- Frontend gọi API GPS xe điện từ backend.
- Khi người dùng bấm `Xe điện`, bản đồ hiển thị các xe gần người dùng nhất.
- Xe điện có marker riêng, vòng nhấn và popup hiển thị tọa độ, thiết bị, vệ tinh và khoảng cách nếu có.
- Dữ liệu xe điện được cập nhật định kỳ, nhưng không tự kéo camera về mặc định sau mỗi lần polling.

### UI/UX

- Header có hai chế độ: `Trang chủ` và `Bản đồ`.
- Trên mobile, các nút header được gom vào dropdown `Menu` để tránh tràn giao diện.
- Dropdown header được đặt z-index cao hơn Leaflet map, tránh bị bản đồ che.
- Các khối `Chú thích`, `Lớp bản đồ`, `Xe điện`, `Cài đặt` được tổ chức như nhóm chức năng bên cạnh/trên bản đồ.
- Khối trạng thái hệ thống đã chuyển thành popup `Cài đặt và trạng thái`.
- Có popup QR và thông báo lỗi/trạng thái nổi.

## Backend

Backend chạy bằng Node.js thuần, không dùng framework web ngoài.

### API GeoJSON

```text
GET /geojson/road
GET /geojson/building
GET /geojson/point
GET /geojson/boundary
GET /geojson/map-1.0
```

### API Định Tuyến

```text
GET /route?map=map-1.0&from=<nodeId|coord:lon,lat>&to=<nodeId|coord:lon,lat>
```

Ví dụ:

```text
GET /route?map=map-1.0&from=coord:106.703157,10.780525&to=coord:106.703358,10.782190
```

Response mẫu:

```json
{
  "status": "ok",
  "from": "coord:106.703157,10.780525",
  "to": "coord:106.703358,10.782190",
  "map": "map-1.0",
  "length_km": 0.16,
  "route": {
    "type": "FeatureCollection",
    "features": []
  }
}
```

Nếu `map=road`, backend dùng graph từ `road.geojson`. Nếu không truyền `map`, mặc định dùng `map-1.0`.

### API GPS Xe Điện

```text
GET /firebase/gps
GET /firebase/gps?device=<deviceId>
```

Backend đọc cấu hình Firebase từ biến môi trường hoặc `backend/.env`.

Các biến thường dùng:

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
```

### Health Check

```text
GET /
GET /health
```

Trả về trạng thái server, danh sách GeoJSON khả dụng và ví dụ route.

## Frontend

Frontend dùng React, Vite, Leaflet và React-Leaflet.

### API Base URL

Mặc định frontend gọi backend tại:

```text
http://<hostname hiện tại>:3000
```

Có thể override bằng biến môi trường:

```text
VITE_API_BASE_URL=http://localhost:3000
```

## Hướng Dẫn Chạy

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

### Build Frontend

```bash
cd d:\projects\hospital-map\frontend
npm run build
```

File build được xuất ra `frontend/dist`.

## Kiểm Tra Nhanh

```bash
cd d:\projects\hospital-map\frontend
npm run build
```

```bash
cd d:\projects\hospital-map
node --check backend\src\server.js
```

## Ghi Chú Kỹ Thuật

- `backend/src/server.js` xử lý toàn bộ API, CORS, đọc GeoJSON, Firebase REST và định tuyến.
- `frontend/src/services/api.js` gom các API call của frontend.
- `frontend/src/utils/geo.js` xử lý tìm kiếm địa điểm, kiểm tra geofence, tìm node đường gần GPS và nối tuyến GPS vào tuyến trả về.
- `frontend/src/components/MapView.jsx` chịu trách nhiệm render Leaflet, layer GeoJSON, marker người dùng, marker xe điện, auto-fit camera và nút về bản đồ bệnh viện.
- `frontend/src/App.jsx` quản lý state chính: trang active, layer, route, GPS, xe điện, popup và menu mobile.

## Hướng Phát Triển

- Bổ sung nhiều thiết bị xe điện bằng cách thêm device ID ở frontend hoặc đưa danh sách device về từ backend.
- Chuẩn hóa tên địa điểm trong GeoJSON để tìm kiếm và hiển thị thân thiện hơn.
- Thêm hướng dẫn từng bước trên tuyến đường nếu dữ liệu đường có đủ metadata.
- Bổ sung xác thực/cấu hình an toàn hơn cho Firebase khi đưa lên môi trường thật.
- Tách cấu hình bệnh viện, vị trí test và danh sách layer thành file config riêng nếu dự án mở rộng.
