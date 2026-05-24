# Roadmap 10 tinh nang lon cho LogiVN

Muc tieu: bien LogiVN tu QR ordering MVP thanh he dieu hanh nha hang/cafe nhe, de ban, de scale cho 100-300 quan.

## Can cu thi truong

- Square Future of Restaurants 2025 nhan manh cong nghe, loyalty va marketing la cac huong giup nha hang tang trai nghiem khach va doanh thu.
- National Restaurant Association Off-Premises Restaurant Trends 2025 cho thay takeout/delivery/drive-thru da tro thanh kenh doanh thu thiet yeu, voi yeu cau ve toc do, cong nghe dat/thanh toan truc quan, uu dai va loyalty.
- Toast Voice of the Restaurant Industry 2025 tap trung vao bai toan loi nhuan, hieu suat van hanh va guest experience khi chi phi mon va nhan su tang.
- OpenTable 2025 goi y cac huong AI POS, self-service QR/kiosk, waitlist, contactless payment va table status realtime.
- Supy 2025 nhan manh inventory, AI forecast, POS integration va multi-unit dashboard cho chuoi nhieu diem ban.

## De xuat tinh nang

### 1. Hoa don ban nang cao

Trang thai hien tai: da bat dau bang `table_bills`, moi ban co mot hoa don mo va nhieu luot goi mon.

Nang cap tiep theo:
- Tach/gop hoa don theo khach.
- Chuyen ban, gop ban, tach ban.
- Phi dich vu, VAT, chiet khau, tip.
- In/xuat hoa don PDF.

Gia tri: dung voi luong dung thuc te cua quan an, vi khach goi nhieu lan truoc khi thanh toan.

### 2. Kitchen Display System

Man hinh bep rieng theo khu vuc:
- Bep nong, bar, mon nuoc, cashier.
- KOT realtime, uu tien don tre, dem nguoc SLA.
- Trang thai mon: moi, dang lam, xong, da giao.

Gia tri: giam tre mon, giam sai sot, phu hop voi quan dong khach.

### 3. Tu dong doi soat thanh toan

Ket noi san sang:
- Casso webhook.
- PayOS webhook.
- Bank transaction import.

Logic:
- Match `BILL-{billId}` voi giao dich ngan hang.
- Tu chuyen bill sang `paid`.
- Canh bao sai so tien, thieu tien, noi dung chuyen khoan sai.

Gia tri: giam thao tac thu cong va giam that thoat.

### 4. Loyalty va CRM khong can app

Khach chi can so dien thoai hoac Zalo/email:
- Tich diem.
- Voucher sinh nhat.
- Ma quay lai sau 7/14/30 ngay.
- Lich su mon yeu thich.

Gia tri: tang tan suat quay lai, mo ra goi SaaS cao hon.

### 5. Menu engineering va goi y ban them

Dashboard phan tich:
- Mon ban chay.
- Mon loi nhuan cao/thap.
- Mon bi huy/het hang.
- Combo goi y trong gio hang.

AI/logic ban them:
- "Thuong goi kem".
- Combo theo khung gio.
- Upsell size, topping, mon them.

Gia tri: tang gia tri trung binh moi bill.

### 6. Quan ly ton kho va dinh luong

Mo rong menu thanh recipe:
- 1 ly ca phe = x gram bot + y ml sua.
- Ban mon nao tru kho mon do.
- Canh bao sap het nguyen lieu.
- Bao cao food cost.

Gia tri: kiem soat loi nhuan, rat dang tien voi quan co nhieu chi nhanh.

Tai lieu P0 da duoc tach rieng de bat dau implementation:
- `docs/inventory-commercialization-plan.md`
- `docs/inventory-v1-spec.md`

### 7. Dat ban va waitlist

Them luong front-of-house:
- Dat ban theo gio.
- Danh sach cho.
- SMS/Zalo thong bao den luot.
- Map ban realtime: trong, dang dung, dang doi mon, sap thanh toan.

Gia tri: hop voi nha hang co luong khach den truc tiep cao.

### 8. Multi-branch va owner dashboard

Cho chuoi nhieu quan:
- Mot owner quan ly nhieu restaurant.
- So sanh doanh thu, AOV, thoi gian phuc vu, mon top theo chi nhanh.
- Phan quyen owner/manager/staff.
- Audit log thay doi menu, gia, thanh toan.

Gia tri: day san pham len phan khuc chuoi 5-50 chi nhanh.

### 9. Online ordering cho takeaway/delivery rieng cua quan

Ngoai QR tai ban:
- Link dat mang di.
- Khung gio nhan hang.
- Thanh toan VietQR truoc.
- Trang thai bep va thong bao cho khach.
- Ma giam gia theo kenh rieng, khong phu thu san giao do an.

Gia tri: mo them doanh thu truc tiep, khong phu thuoc app ben thu ba.

### 10. Quan ly nhan su, SLA va hieu suat ca lam

Mo rong tu timer hien co:
- Lich ca lam.
- KPI: thoi gian nhan don, thoi gian ra mon, don tre.
- Nhat ky thao tac cua nhan vien.
- Phan quyen theo vai tro.

Gia tri: giup chu quan quan ly van hanh, khong chi nhin don hang.

## Thu tu uu tien de lam

1. Hoa don ban nang cao.
2. Kitchen Display System.
3. Tu dong doi soat thanh toan.
4. Menu engineering va upsell.
5. Loyalty/CRM.
6. Quan ly ban + dat ban/waitlist.
7. Ton kho/dinh luong.
8. Multi-branch owner dashboard.
9. Online ordering takeaway/delivery.
10. Nhan su/SLA/audit log.

## Cach nghien cuu truoc khi code

- Phong van 10 chu quan: 4 cafe, 3 quan an, 2 nha hang, 1 chuoi nho.
- Do luong 5 chi so hien tai: thoi gian nhan don, thoi gian ra mon, bill trung binh, ty le thanh toan QR, ty le khach goi them.
- Lam prototype Figma cho 3 tinh nang top dau.
- Chay pilot 2 quan trong 2 tuan.
- Uu tien theo RICE: Reach, Impact, Confidence, Effort.

## Nguon tham khao

- Square Future of Restaurants 2025: https://squareup.com/us/en/the-bottom-line/series/foc/future-of-restaurants
- National Restaurant Association Off-Premises Restaurant Trends 2025: https://www.restaurant.org/research-and-media/research/research-reports/off-premises-restaurant-trends-2025/
- National Restaurant Association press release 2025: https://restaurant.org/research-and-media/media/press-releases/from-trend-to-transformation-off-premises-dining-now-essential-for-restaurant-consumers%2C-operators/
- Toast Voice of the Restaurant Industry 2025: https://pos.toasttab.com/zh-us/news/2025-voice-of-the-restaurant-industry-survey
- OpenTable restaurant tech trends 2025: https://www.opentable.com/restaurant-solutions/resources/restaurant-technology-trends-to-watch/
- Supy restaurant tech trends 2025: https://supy.io/blog/restaurant-tech-trends-2025/
