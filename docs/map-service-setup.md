# LogiVN Map Service Setup

## Mục tiêu

Map system này được build theo thứ tự ưu tiên:

1. `MapLibre GL JS` ở frontend để tránh lock-in.
2. `Mapbox` cho tiles/style/rendering và trải nghiệm bản đồ.
3. `Goong` cho geocoding, reverse geocoding, routing, ETA và distance tại Việt Nam.
4. Fallback low-cost: `Vietmap -> OSRM -> Nominatim -> Haversine` khi timeout/quota/outage.

## Cấu hình môi trường

Thêm các biến sau vào Vercel hoặc `.env.local`:

```bash
NEXT_PUBLIC_MAP_STYLE_URL=
NEXT_PUBLIC_MAP_STREETS_TILE_URL=
NEXT_PUBLIC_MAP_SATELLITE_STYLE_URL=
NEXT_PUBLIC_MAP_HYBRID_STYLE_URL=
NEXT_PUBLIC_MAP_SATELLITE_TILE_URL=
NEXT_PUBLIC_MAP_HYBRID_TRANSPORT_TILE_URL=
NEXT_PUBLIC_MAP_HYBRID_LABEL_TILE_URL=
NEXT_PUBLIC_MAP_SATELLITE_ATTRIBUTION="Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
NEXT_PUBLIC_MAP_TILE_ATTRIBUTION="© OpenStreetMap contributors"
MAPS_GEOCODER_PROVIDER="goong"
MAPS_GEOCODER_FALLBACKS="goong,vietmap,mapbox,nominatim"
MAPS_GEOCODER_COUNTRY_CODES="vn"
MAPS_GEOCODER_LANGUAGE="vi"
MAPS_ROUTING_PROVIDER="goong"
MAPS_ROUTING_FALLBACKS="goong,vietmap,osrm"
MAPS_NOMINATIM_URL="https://nominatim.openstreetmap.org/search"
MAPS_OSRM_URL="https://router.project-osrm.org"
MAPS_USER_AGENT="LogiVN Maps/1.0 (+https://logivn.com)"
MAPS_CIRCUIT_FAILURE_THRESHOLD="3"
MAPS_CIRCUIT_COOLDOWN_MS="30000"
MAPS_TELEMETRY_ENABLED="true"
MAPS_TELEMETRY_SAMPLE_RATE="0.2"
MAPS_DB_TELEMETRY_ENABLED="true"
MAPS_DB_TELEMETRY_SAMPLE_RATE="0.15"
MAPS_CACHE_NAMESPACE="logivn:maps:v1"
MAPS_RATE_LIMIT_REDIS_ENABLED="true"
MAPS_RATE_LIMIT_NAMESPACE="logivn:maps:rate-limit:v1"
MAPS_DISABLED_PROVIDERS=""
MAPS_DISABLED_GEOCODERS=""
MAPS_DISABLED_ROUTERS=""
MAPS_DISABLED_GEOCODE_PROVIDERS=""
MAPS_DISABLED_REVERSE_PROVIDERS=""
MAPS_DISABLED_ROUTE_PROVIDERS=""
MAPS_MAX_DAILY_PROVIDER_REQUESTS=""
MAPS_MAX_DAILY_COST_VND=""
MAPS_MAX_DAILY_GOONG_ROUTE_REQUESTS=""
MAPS_ROUTE_GEOMETRY_MAX_POINTS="140"
MAPS_ROUTE_GEOMETRY_TOLERANCE_DEGREES="0.00005"
MAPS_GOONG_PLACES_ENABLED="true"
MAPS_GOONG_PLACES_AUTOCOMPLETE_TTL_MS="600000"
MAPS_GOONG_PLACE_DETAIL_TTL_MS="2592000000"
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
MAPS_COST_VND_GOONG_GEOCODE="0"
MAPS_COST_VND_GOONG_REVERSE="0"
MAPS_COST_VND_GOONG_ROUTE="0"
DELIVERY_BRANCH_ROUTE_TOP_N="2"
DELIVERY_SPATIAL_LOOKUP_ENABLED="true"
DELIVERY_SPATIAL_PREFILTER_LIMIT="6"
DELIVERY_SPATIAL_PREFILTER_RADIUS_KM="50"
DELIVERY_SPATIAL_CACHE_TTL_MS="30000"
DELIVERY_QUOTE_CACHE_TTL_MS="25000"
DELIVERY_ENFORCE_OPERATING_HOURS="true"
MAPBOX_ACCESS_TOKEN=
VIETMAP_API_KEY=
GOONG_API_KEY=
NEXT_PUBLIC_GOONG_MAPTILES_KEY=
```

Nếu `NEXT_PUBLIC_MAP_STYLE_URL` để trống nhưng có `NEXT_PUBLIC_GOONG_MAPTILES_KEY`, LogiVN tự dùng style street mặc định của Goong:

```bash
https://tiles.goong.io/assets/goong_map_web.json?api_key=...
```

## Khuyến nghị production

- Không dùng `tile.openstreetmap.org` làm tile source mặc định cho production traffic lớn.
- Với 300+ quán, nên trỏ `NEXT_PUBLIC_MAP_STYLE_URL` sang tile/style provider riêng như MapTiler, Stadia Maps, Protomaps hoặc self-hosted tiles.
- Public `Nominatim` không phù hợp cho autocomplete realtime dày đặc. Giữ nó làm fallback cuối cho geocode, không đặt làm primary ở production.
- `Goong` nên là primary cho thị trường Việt Nam vì dữ liệu địa chỉ, hẻm/đường nội đô và ETA phù hợp hơn low-cost global providers.
- `OSRM` public đủ tốt cho degraded routing, nhưng khi delivery volume tăng nên self-host hoặc cache qua Cloudflare Worker.
- Nếu dùng Goong, `GOONG_API_KEY` là REST API key cho geocode/routing; map tiles key chỉ nên đi qua `NEXT_PUBLIC_MAP_STYLE_URL` hoặc `NEXT_PUBLIC_GOONG_MAPTILES_KEY` khi style provider yêu cầu public token.
- `DELIVERY_SPATIAL_LOOKUP_ENABLED=true` bật PostGIS prefilter qua RPC `find_nearest_delivery_stores`, giúp backend chỉ lấy các chi nhánh gần nhất trước khi gọi Goong routing.
- `DELIVERY_SPATIAL_PREFILTER_LIMIT=6` là số ứng viên tối đa lấy từ PostGIS; `DELIVERY_BRANCH_ROUTE_TOP_N=2` là số ứng viên thật sự được route qua Goong sau khi rank nhanh.
- `DELIVERY_SPATIAL_PREFILTER_RADIUS_KM=50` tránh route những địa chỉ quá xa; nếu quán giao liên tỉnh hoặc mô hình cloud kitchen, tăng theo thực tế.

## Luồng hiện tại

- Dashboard:
  - Chủ quán dùng `StoreLocationPicker` để tìm địa chỉ, pin map, kéo marker và lưu `store_lat/store_lng`.
  - Onboarding cũng dùng cùng map picker để tọa độ quán trở thành source-of-truth ngay từ lúc đăng ký.
  - Chủ quán dùng `DeliveryZoneMapEditor` để vẽ vùng giao hàng trực tiếp trên MapLibre, kéo vertex marker, thêm điểm bằng click map và xem diện tích/khoảng cách tối đa.
  - Các map vận hành hỗ trợ chuyển lớp `Đường / Vệ tinh / Hybrid` để chủ quán kiểm tra mặt tiền, hẻm, cổng vào và vùng giao hàng rõ hơn.
  - Settings > Đặt món online có `BranchDeliveryControls` để bật/tắt giao hàng, pause khi bếp quá tải, đóng tạm và đặt giờ giao riêng cho từng chi nhánh; panel cũng hiển thị số chi nhánh sẵn sàng nhận giao và cảnh báo thiếu một mốc giờ giao.
- Customer:
  - Remote order cho khách chọn tỉnh/xã, dùng GPS, tìm địa chỉ, chạm/kéo pin trên bản đồ, rồi tính khoảng cách, ETA và phí ship.
  - Pickup/đến lấy dùng `RestaurantVisitMapCard` để khách xem tuyến đến quán, mở Google Maps/Apple Maps và ước tính ETA.
  - Tracking map dùng MapLibre thật thay vì SVG tĩnh, có route geometry, marker quán/khách/tài xế và layer switch vệ tinh.
  - GPS accuracy guard cảnh báo/chặn vị trí browser quá rộng để desktop/IP geolocation không bị dùng như GPS thật.
  - Hệ thống ưu tiên chi nhánh gần nhất nếu `store_branches` có dữ liệu.
- Frontend Map Kit:
  - `components/maps/logivn-marker.ts` chuẩn hóa marker quán/khách/tài xế/GPS để không copy style marker giữa các map.
  - `components/maps/route-preview-layer.ts` chuẩn hóa route GeoJSON layer, fit bounds và fallback polyline cho route preview/tracking.
  - `components/maps/map-canvas.tsx` và `components/maps/address-search-box.tsx` là primitive nhẹ cho màn hình map mới, giữ backend proxy `/api/maps/*` là nguồn dữ liệu duy nhất. `StoreLocationPicker` và `DeliveryZoneMapEditor` đã dùng `MapCanvas`, marker factory và fit-bounds helper chung.
- Reservation:
  - Public reservation page dùng `RestaurantVisitMapCard` để khách xem khoảng cách/tuyến đến quán trước khi giữ bàn.
  - Dashboard reservation hiển thị cùng map preview khi chủ quán chia sẻ link/QR đặt bàn.
  - Vị trí khách trong reservation chỉ dùng client-side để tính tuyến, không lưu vào booking nhằm giảm PII và rủi ro privacy.
- API:
  - `/api/maps/autocomplete`
  - `/api/maps/place-detail`
  - `/api/maps/search`
  - `/api/maps/reverse`
  - `/api/maps/route`
  - `/api/location/nearest-store`
  - `/api/delivery/fee`
  - Map APIs nhận optional `provider`, `restaurantId`, `restaurantSlug` để tenant-aware observability/cache mà vẫn giữ response envelope cũ.
  - `/api/maps/route` trả route estimate bằng Haversine khi routing providers đều lỗi, thay vì để client tự xử lý null.
- Delivery quote:
  - Backend luôn re-quote khi tạo order, không tin phí client.
  - `/api/restaurants/[restaurantSlug]/delivery-quote` hỗ trợ cả `POST` và `GET` query params để tương thích client cũ; route slug luôn thắng payload body để tránh quote nhầm tenant.
  - `/api/location/nearest-store` hỗ trợ cả `POST` và `GET` query params, nhưng cùng dùng rate limit, route-distance top-N và availability filter.
  - Quote kiểm tra `opening_time/closing_time` theo múi giờ Việt Nam trước khi nhận đơn giao hàng; có thể tắt tạm bằng `DELIVERY_ENFORCE_OPERATING_HOURS=false` trong rollout.
  - Nếu quote chưa thấy `store_lat/store_lng` nhưng quán có địa chỉ, backend sẽ geocode địa chỉ quán, dùng làm origin tạm thời và backfill lại tọa độ để tránh khách gặp lỗi "quán chưa cấu hình tọa độ".
  - Nếu quote phát hiện tọa độ quán cách điểm giao bất thường, backend geocode lại địa chỉ quán, dùng origin tốt hơn cho quote hiện tại và backfill `store_lat/store_lng`.
  - Quote dùng PostGIS để lọc chi nhánh gần nhất theo geography index, sau đó mới gọi Goong cho 1-2 ứng viên tốt nhất.
  - API `/api/location/nearest-store` cũng dùng PostGIS prefilter rồi route top-N qua routing provider của tenant, không chỉ trả chi nhánh gần nhất theo đường chim bay.
  - Chi nhánh dùng các cột chuẩn trên `store_branches` để tạm dừng giao hàng mà không xóa khỏi hệ thống: `accepting_delivery`, `delivery_paused`, `temporarily_closed`, `delivery_opening_time`, `delivery_closing_time`, `delivery_availability_note`. Các key cũ trong `store_branches.metadata` (`deliveryPaused`, `temporarilyClosed`, `acceptingDelivery=false`, `openingTime`, `closingTime`, `availabilityNote`) vẫn được đọc như fallback/backward-compatible.
  - Dashboard update các cột availability qua server action `updateBranchDeliveryAvailabilityAction`; quote và nearest-store sẽ tự loại chi nhánh không khả dụng khỏi route-distance selection.
  - Snapshot pricing trong quote lưu `pricingVersion`, free-shipping flag, tier match và multiplier để audit phí ship, debug surge/rainy-day rollout và xử lý tranh chấp.
  - Quote trả thêm `addressQualitySnapshot` để dashboard/customer flow biết địa chỉ có đủ số nhà, đường, phường/xã, quận/huyện, tọa độ và route confidence hay chưa. Đây là lớp chống lệch điểm giao cho hẻm/ngõ/kiệt ở Việt Nam.
  - Delivery zone logic được tách thành `services/delivery/delivery-zone-service.ts`: exclusion zone luôn được ưu tiên chặn trước custom polygon, sau đó mới xét outside-area blocked/confirmation/allowed.
  - `deliveryAreaSnapshot` lưu thêm trạng thái đánh giá vùng giao (`inside_custom_area`, `outside_requires_confirmation`, `outside_blocked`, `excluded`, ...), tên vùng loại trừ nếu match và flag outside custom area.
  - Quote dùng provider theo tenant (`map_geocoding_provider`, `map_routing_provider`) và fallback chain server-side.
  - Geocoding fallback production mặc định là Goong -> Vietmap -> Mapbox -> Nominatim. Goong vẫn là primary cho Việt Nam, Mapbox là lớp cứu hộ khi địa chỉ khó hoặc provider trả kết quả kém chất lượng.
  - Country scope mặc định là Việt Nam qua `MAPS_GEOCODER_COUNTRY_CODES=vn`. Khi cần test tại Nhật có thể bật `vn,jp` để Mapbox/Nominatim fallback xử lý địa chỉ Nhật nhưng vẫn giữ Goong là primary cho Việt Nam.
  - API quote có cache/dedupe ngắn hạn theo slug, subtotal, địa chỉ đã hash và tọa độ làm tròn để giảm spam khi khách sửa form.
  - Route geometry từ provider được simplify trước khi cache/trả về client để giảm payload và render mượt hơn trên Android yếu; chỉnh bằng `MAPS_ROUTE_GEOMETRY_MAX_POINTS`.
  - Order lưu `delivery_quote_snapshot`, `delivery_route_provider`, `delivery_route_confidence`, `delivery_quote_version` để xử lý tranh chấp, analytics và debug provider.
- Address intelligence:
  - `services/maps/address-quality-service.ts` phân tích địa chỉ Việt Nam thành số nhà, đường, phường/xã, quận/huyện, tỉnh/thành và alley hint để chấm điểm chất lượng giao hàng.
  - Frontend dùng `/api/maps/autocomplete` khi chủ quán/khách tìm địa chỉ, truyền `sessionToken` theo phiên nhập để Goong Places gom request đúng khuyến nghị.
  - Chỉ khi user chọn một gợi ý, frontend mới gọi `/api/maps/place-detail` để lấy tọa độ chính xác. Nếu provider fallback đã có sẵn tọa độ, client dùng luôn và không gọi detail.
  - Autocomplete cache ngắn hạn theo query + location bias; place detail cache dài hạn theo `placeId` để giảm chi phí Goong.
- Customer delivery UX:
  - Remote order checkout dùng `resolveDeliveryQuoteCustomerInsight` để tóm tắt phí ship, ETA, provider/route confidence, trạng thái vùng giao và chất lượng địa chỉ từ quote metadata.
  - Màn `Thông tin giao hàng` hiển thị cảnh báo địa chỉ mơ hồ/hẻm nhỏ, trạng thái ngoài vùng giao hoặc vùng loại trừ, và nút `Thử tính lại` khi provider/mạng lỗi.
  - Quote request trên client có debounce, request cancellation và retry mềm có giới hạn để không spam provider khi mạng yếu.
- Ops:
  - Nếu cấu hình `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`, geocode/reverse/route/quote cache sẽ dùng Redis REST chung giữa các Vercel instances.
  - Các map API dùng cùng Redis REST để rate limit xuyên Vercel instances; nếu chưa cấu hình Redis, hệ thống tự fallback về memory bucket theo từng instance.
  - Cache key được hash SHA-256, không lưu raw address trong key.
  - Provider/cache/quote metrics được ghi vào `map_provider_request_logs`, `map_cache_event_logs`, `delivery_quote_metric_logs` theo sampling.
  - Dashboard API nội bộ: `GET /api/admin/maps/metrics?windowHours=24`.
  - Settings > Đặt món online hiển thị `MapOperationalMetricsPanel` từ `getMapOperationalMetrics`, gồm provider failure, cache hit, quote acceptance, estimated rate, latency và cost estimate.
  - Metrics panel có health warning cho provider failure cao, cache hit thấp, quote dùng Haversine nhiều và quote latency chậm.
  - Provider policy guard cho phép tắt nhanh provider bằng env (`MAPS_DISABLED_PROVIDERS`, `MAPS_DISABLED_GEOCODERS`, `MAPS_DISABLED_ROUTERS`, hoặc theo operation), đặt soft cap request/cost hằng ngày và tự skip provider trước khi gọi HTTP.
  - Cost guard dùng `MAPS_COST_VND_{PROVIDER}_{OPERATION}` để ước tính chi phí theo request; khi vượt cap, provider trả về fallback chain thay vì làm hỏng API public.
  - `getMapDeliveryReadiness` kiểm tra readiness trước deploy: geocoding, routing, Redis cache, distributed rate limit, map tiles/style và DB telemetry. Kết quả hiển thị trong `MapOperationalMetricsPanel`.
- Realtime delivery:
  - Trạng thái giao hàng ghi thêm `delivery_tracking_events` để audit và broadcast realtime tới channel `customer-order:{orderId}`.
  - Endpoint nội bộ `POST /api/admin/orders/{orderId}/delivery-location` nhận GPS ping từ dashboard/driver app tương lai.
  - Endpoint nội bộ `GET/POST /api/admin/delivery/couriers` quản lý đội shipper theo từng tenant/quán.
  - Endpoint nội bộ `POST /api/admin/orders/{orderId}/delivery-courier` phân công hoặc gỡ shipper khỏi đơn giao.
  - Endpoint nội bộ `GET /api/admin/orders/{orderId}/dispatch-candidates` xếp hạng shipper theo trạng thái, GPS mới nhất, active order count và route-distance tới điểm pickup.
  - `services/maps/distance-matrix-service.ts` cung cấp distance matrix abstraction có route resolver, concurrency limit và Haversine fallback khi matrix quá lớn hoặc provider lỗi.
  - `services/delivery/dispatch-ranking-engine.ts` là lõi pure để sau này tái dùng cho driver app, multi-driver dispatch hoặc AI route optimization mà không phụ thuộc Supabase.
  - `courier_locations` lưu lịch sử vị trí append-only, có `geography(Point, 4326)` và GiST index để mở rộng dispatch/nearby courier.
  - Dashboard Orders có điều phối shipper, nút `Gửi vị trí hiện tại` cho đơn giao hàng, dùng browser GPS và cập nhật marker shipper trên mini map.
  - Dashboard Orders tự hydrate top dispatch candidates khi mở đơn giao, hiển thị shipper đề xuất và cho phép gán nhanh từ danh sách top 3.
  - Khi shipper được phân công, hệ thống ghi `delivery_courier_id`, `delivery_assigned_at`, event `assigned/unassigned` và gắn `courier_id` vào GPS/status events để audit.

## Database

Chạy migration:

```bash
npx supabase db push
```

Các migration map chính:

- `20260509083117_map_service_foundation.sql`: tọa độ cửa hàng, provider config, branch table và order route snapshot.
- `20260509115359_delivery_quote_snapshot.sql`: quote snapshot/version/confidence cho order.
- `20260509121507_map_persistent_observability.sql`: provider/cache/quote metrics bền vững.
- `20260509123808_map_spatial_branch_lookup.sql`: PostGIS geography generated columns, GiST index và RPC nearest delivery store.
- `20260509125609_delivery_realtime_tracking_foundation.sql`: courier, location ping và tracking event append-only.
- `20260509132004_delivery_courier_assignment.sql`: gắn shipper vào order và index cho delivery dispatch.
- `20260509162000_delivery_map_control_center.sql`: cấu hình map/delivery control center và broadcast thêm delivery/service fee.
- `20260517113000_delivery_branch_availability.sql`: cột availability chính thức cho chi nhánh và RPC nearest-store trả metadata chuẩn.

## Future scaling notes

- Giai đoạn 1:
  - `restaurants.store_lat/store_lng` là đủ cho single-store.
- Giai đoạn 2:
  - Dùng `store_branches` cho multi-branch selection và quote theo chi nhánh gần nhất.
- Giai đoạn 3:
  - Thêm Redis/Upstash cache cho route/geocode dùng chung giữa Vercel instances.
  - Thêm cost dashboard dựa trên provider request logs và env `MAPS_COST_VND_*`.
- Giai đoạn 4:
  - Dùng PostGIS `geography(Point, 4326)` + GiST index để prefilter branch/server-side trước khi gọi Goong.
- Giai đoạn 5:
  - Thêm `delivery_couriers`, `courier_locations`, `delivery_tracking_events` làm foundation shipper tracking.
  - Customer map nhận broadcast `delivery_tracking` để hiện marker vị trí giao hàng khi có GPS ping.
- Giai đoạn 6:
  - Dashboard live delivery ops: gửi GPS hiện tại, hiển thị GPS ping gần nhất khi reload, nghe realtime `delivery_tracking_events`.
- Giai đoạn 7:
  - Shipper assignment: quản lý danh sách shipper nội bộ, phân công/gỡ shipper theo đơn, snapshot assignment trên order.
- Giai đoạn 8:
  - Đồng bộ map trên toàn dự án: onboarding, online order, pickup direction, reservation public/dashboard cùng dùng tọa độ quán và backend map proxy.
- Giai đoạn 9:
  - Super Map Kit: tách `MapCanvas`, marker factory, GeoJSON layer helper, `AddressSearchBox` và `RoutePreview` để onboarding, ordering, reservation, dashboard dùng cùng primitive.
- Giai đoạn 10:
  - Goong Places Autocomplete + Place Detail đã có backend proxy, cache và frontend session token cho onboarding, store picker và customer delivery picker.
- Giai đoạn 11:
  - Multi-layer map đã hỗ trợ street/satellite/hybrid bằng `resolveClientMapStyle` + `applyClientMapLayer`. Mặc định không cần Mapbox public token: street dùng Goong/custom style hoặc OSM raster fallback, satellite dùng Esri World Imagery, hybrid thêm transportation + boundaries/places overlay. Nếu dùng style URL riêng, set `NEXT_PUBLIC_MAP_SATELLITE_STYLE_URL` / `NEXT_PUBLIC_MAP_HYBRID_STYLE_URL`.
- Giai đoạn 12:
  - GPS/geocode quality guard: lọc kết quả Goong dạng tọa độ giả địa chỉ, chặn GPS/IP quá rộng và tự repair tọa độ quán khi quote phát hiện drift lớn. Ngưỡng repair chỉnh bằng `MAPS_STORE_COORDINATE_REPAIR_TRIGGER_KM`.
- Giai đoạn 13:
  - Nếu routing volume lớn, cân nhắc self-host OSRM/Valhalla cho degraded routing hoặc route precomputation theo cụm địa chỉ.
- Giai đoạn 14:
  - Delivery Intelligence v2: distance matrix abstraction, dispatch candidate ranking và health warning cho map ops đã sẵn sàng để mở rộng sang driver app/live tracking.

Xem thêm blueprint research: [`docs/map-supermap-research.md`](./map-supermap-research.md).

## Cost strategy

- Default production:
  - MapLibre + Goong/custom style URL cho street rendering, Esri raster fallback cho satellite/hybrid để giảm chi phí.
  - Goong primary cho geocode/reverse/route/ETA.
  - Route cache + request dedupe + circuit breaker để giảm request trùng.
- Degraded / low-cost fallback:
  - Vietmap nếu Goong lỗi hoặc hết quota.
  - OSRM cho routing fallback.
  - Nominatim cho geocode fallback cuối.
  - Haversine estimation khi mọi routing provider đều lỗi.

## Security

- Không expose secret provider keys ra client.
- Tất cả geocoding/routing đi qua server routes.
- Có rate limiting cho map search, reverse, route và delivery quote.
- Có structured telemetry dạng JSON cho provider latency, cache hit và quote success; đưa log này vào Vercel Log Drains / Datadog / Grafana Loki khi cần.
- Có thể đặt thêm Cloudflare cache theo query string cho `/api/maps/*`.
- Không expose `GOONG_API_KEY`, `VIETMAP_API_KEY`, `MAPBOX_ACCESS_TOKEN` từ frontend; frontend chỉ nhận public style URL/tile key khi provider yêu cầu.
