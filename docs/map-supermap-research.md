# LogiVN Super Map Research

Ngày cập nhật: 2026-05-09

## Mục tiêu

LogiVN dùng Goong cho geocoding, reverse geocoding, routing, ETA và distance, còn Mapbox/MapLibre phụ trách tiles, style và frontend rendering. Hướng này phù hợp thị trường Việt Nam vì Goong có API địa chỉ/route theo ngữ cảnh Việt Nam, trong khi MapLibre giúp giữ frontend render nhẹ, kiểm soát được chi phí và không khóa chặt vào một vendor.

## Repo đã tham khảo

- [maplibre/maplibre-gl-js](https://github.com/maplibre/maplibre-gl-js): lõi render WebGL open-source, source/layer GeoJSON, marker draggable và style spec.
- [visgl/react-map-gl](https://github.com/visgl/react-map-gl): pattern React-friendly Map, Source, Layer, Marker, controlled camera và tránh object inline gây update thừa.
- [maplibre/ngx-maplibre-gl](https://github.com/maplibre/ngx-maplibre-gl): pattern framework wrapper khai báo map/layer/source rõ ràng, hữu ích để chuẩn hóa component API nội bộ.
- [mapbox/mapbox-gl-draw](https://github.com/mapbox/mapbox-gl-draw): UX modes cho polygon, vertex editing, draw.create/update/delete events. LogiVN lấy cảm hứng UX nhưng chưa kéo dependency để tránh tăng bundle và rủi ro tương thích MapLibre.
- [goong-io/goong-map-react](https://github.com/goong-io/goong-map-react): fork theo triết lý reactive viewport, phù hợp làm tham chiếu nhưng không nên dùng trực tiếp vì dự án đang dùng MapLibre + Next.js mới.
- [goong-io/goong-sdk](https://github.com/goong-io/goong-sdk): SDK cho REST APIs như Directions, Distance Matrix, Geocoding, Places. LogiVN vẫn gọi REST qua backend proxy để không expose secret key.
- [goong-io/goong-geocoder-js](https://github.com/goong-io/goong-geocoder-js): geocoder UI dùng Places API. LogiVN học autocomplete/select flow, nhưng frontend không gọi Goong trực tiếp.

## Quyết định kiến trúc

1. Không thêm wrapper map mới vào bundle ngay. Dùng `maplibre-gl` trực tiếp, import động trong client component và chỉ tạo thin internal Map Kit khi đã có đủ use case lặp lại.
2. Không expose `GOONG_API_KEY`, `VIETMAP_API_KEY`, `MAPBOX_ACCESS_TOKEN` ở client. Frontend tiếp tục gọi `/api/maps/search`, `/api/maps/reverse`, `/api/maps/route`.
3. Polygon editor của chủ quán chuyển sang MapLibre thật thay vì SVG giả lập. Điều này giúp merchant nhìn đúng phố/ngõ/cầu/kênh/rạch khi vẽ vùng giao hàng.
4. Giữ Goong Places Autocomplete làm phase kế tiếp có kiểm soát chi phí: autocomplete trả prediction, chỉ gọi Place Detail khi user chọn một prediction, dùng session token và cache.
5. Route/quote vẫn re-quote ở backend khi tạo order. Map UI chỉ là UX, không là nguồn sự thật cho phí giao hàng.

## Nâng cấp đã áp dụng

- Thêm `DeliveryZoneMapEditor` dùng MapLibre source/layer cho delivery polygon.
- Hỗ trợ thêm điểm bằng click map, kéo vertex marker, tạo lại polygon mẫu, xóa điểm cuối và fit bounds.
- Hiển thị trạng thái polygon hợp lệ, diện tích và khoảng cách xa nhất ngay trong UI.
- Tối ưu mobile bằng bottom control sheet và các nút lớn dễ chạm.
- Thêm Goong Places Address Intelligence: `/api/maps/autocomplete`, `/api/maps/place-detail`, session token phía client, cache autocomplete/detail và fallback về geocode khi Places không khả dụng.
- Onboarding, `StoreLocationPicker` và customer delivery picker đều dùng autocomplete trước, chỉ gọi detail khi người dùng chọn một prediction.
- Thêm multi-layer map: street/satellite/hybrid resolver, layer switch control, vệ tinh fallback bằng raster style. Bản nâng cấp mới dùng Esri satellite + transportation/boundaries overlays cho hybrid để không phụ thuộc Mapbox public token mặc định.
- Delivery quote có origin repair: nếu dữ liệu public chưa đồng bộ `store_lat/store_lng`, backend geocode địa chỉ quán, quote tiếp và backfill tọa độ.
- Geocode quality guard: lọc kết quả Goong dạng chuỗi tọa độ khi query không phải tọa độ, rồi fallback sang Mapbox/Nominatim để tránh lưu sai vị trí quán.
- GPS accuracy guard: luồng khách và chủ quán cảnh báo/chặn vị trí trình duyệt có accuracy quá rộng, giảm lỗi desktop/IP geolocation báo xa bất thường.
- Japan/local test mode: geocoding country scope cấu hình bằng `MAPS_GEOCODER_COUNTRY_CODES`; production Việt Nam giữ `vn`, môi trường test tại Nhật dùng `vn,jp`.
- `RouteMiniMap` chuyển từ SVG tĩnh sang MapLibre thật để khách/chủ quán theo dõi route, tài xế và lớp bản đồ trực quan hơn.

## Blueprint Super Map Kit

Các component map nên tiến tới dùng chung 5 primitive:

- `MapCanvas`: khởi tạo MapLibre lazy, nhận style/fallback style và lifecycle events.
- `LogiVNMarker`: marker QR/cafe/khách/tài xế cùng brand token.
- `GeoJsonLayer`: render route, polygon, exclusion zone, service zone bằng source/layer ổn định.
- `AddressSearchBox`: dùng backend proxy, debounce/abort/dedupe, sau này hỗ trợ Goong Places session token.
- `RoutePreview`: nhận geometry đã tính từ backend, fit bounds và hiển thị confidence/provider badge.

## Roadmap tiếp theo

1. Tách `MapCanvas`, marker factory và GeoJSON layer helper để onboarding, ordering, reservation và dashboard dùng cùng một Map Kit.
2. Dùng Goong Distance Matrix cho nearest branch top-N khi quán có nhiều chi nhánh, tránh gọi Direction nhiều lần.
3. Thêm route simplification ở API để giảm payload mobile và render mượt hơn trên Android yếu.
4. Bổ sung Map telemetry theo flow: onboarding, online_ordering, customer_ordering, reservation, dashboard_ops.
5. Gom `StoreLocationPicker` và `CustomerDeliveryLocationPicker` vào một `AddressSearchBox` primitive dùng chung.
6. Thêm tenant-level map preference để quán chọn mặc định street/satellite/hybrid cho khách.
