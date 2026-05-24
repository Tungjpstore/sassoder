import { AppError, fail, ok } from "@/lib/response";

export const preferredRegion = "sin1";

type VietnamWard = {
  Code: string;
  FullName: string;
  ProvinceCode: string;
};

type VietnamProvince = {
  Code: string;
  FullName: string;
  Wards: VietnamWard[];
};

const sourceUrl =
  "https://raw.githubusercontent.com/thanglequoc/vietnamese-provinces-database/master/json/vn_only_simplified_json_generated_data_vn_units_minified.json";
const sourceLabel = "Decision 19/2025/QD-TTg, effective 2025-07-01";
const cacheTtlMs = 24 * 60 * 60 * 1000;
let cachedUnits: { expiresAt: number; value: VietnamProvince[] } | null = null;

const fallbackProvinces: VietnamProvince[] = [
  { Code: "01", FullName: "Thành phố Hà Nội", Wards: [] },
  { Code: "04", FullName: "Tỉnh Cao Bằng", Wards: [] },
  { Code: "08", FullName: "Tỉnh Tuyên Quang", Wards: [] },
  { Code: "11", FullName: "Tỉnh Điện Biên", Wards: [] },
  { Code: "12", FullName: "Tỉnh Lai Châu", Wards: [] },
  { Code: "14", FullName: "Tỉnh Sơn La", Wards: [] },
  { Code: "15", FullName: "Tỉnh Lào Cai", Wards: [] },
  { Code: "19", FullName: "Tỉnh Thái Nguyên", Wards: [] },
  { Code: "20", FullName: "Tỉnh Lạng Sơn", Wards: [] },
  { Code: "22", FullName: "Tỉnh Quảng Ninh", Wards: [] },
  { Code: "24", FullName: "Tỉnh Bắc Ninh", Wards: [] },
  { Code: "25", FullName: "Tỉnh Phú Thọ", Wards: [] },
  { Code: "31", FullName: "Thành phố Hải Phòng", Wards: [] },
  { Code: "33", FullName: "Tỉnh Hưng Yên", Wards: [] },
  { Code: "37", FullName: "Tỉnh Ninh Bình", Wards: [] },
  { Code: "38", FullName: "Tỉnh Thanh Hóa", Wards: [] },
  { Code: "40", FullName: "Tỉnh Nghệ An", Wards: [] },
  { Code: "42", FullName: "Tỉnh Hà Tĩnh", Wards: [] },
  { Code: "44", FullName: "Tỉnh Quảng Trị", Wards: [] },
  { Code: "46", FullName: "Thành phố Huế", Wards: [] },
  { Code: "48", FullName: "Thành phố Đà Nẵng", Wards: [] },
  { Code: "51", FullName: "Tỉnh Quảng Ngãi", Wards: [] },
  { Code: "52", FullName: "Tỉnh Gia Lai", Wards: [] },
  { Code: "56", FullName: "Tỉnh Khánh Hòa", Wards: [] },
  { Code: "66", FullName: "Tỉnh Đắk Lắk", Wards: [] },
  { Code: "68", FullName: "Tỉnh Lâm Đồng", Wards: [] },
  { Code: "75", FullName: "Tỉnh Đồng Nai", Wards: [] },
  { Code: "79", FullName: "Thành phố Hồ Chí Minh", Wards: [] },
  { Code: "80", FullName: "Tỉnh Tây Ninh", Wards: [] },
  { Code: "82", FullName: "Tỉnh Đồng Tháp", Wards: [] },
  { Code: "86", FullName: "Tỉnh Vĩnh Long", Wards: [] },
  { Code: "91", FullName: "Tỉnh An Giang", Wards: [] },
  { Code: "92", FullName: "Thành phố Cần Thơ", Wards: [] },
  { Code: "96", FullName: "Tỉnh Cà Mau", Wards: [] }
];

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase();
}

function isProvinceArray(value: unknown): value is VietnamProvince[] {
  return (
    Array.isArray(value) &&
    value.every(
      (province) =>
        province &&
        typeof province === "object" &&
        typeof (province as VietnamProvince).Code === "string" &&
        typeof (province as VietnamProvince).FullName === "string" &&
        Array.isArray((province as VietnamProvince).Wards)
    )
  );
}

async function loadVietnamUnits() {
  if (cachedUnits && cachedUnits.expiresAt > Date.now()) return cachedUnits.value;

  try {
    const response = await fetch(sourceUrl, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 * 60 * 24 }
    });
    const data = await response.json();
    if (!response.ok || !isProvinceArray(data)) throw new Error("Invalid administrative data");

    cachedUnits = {
      value: data,
      expiresAt: Date.now() + cacheTtlMs
    };
    return data;
  } catch (error) {
    console.error("[location/vietnam-admin] Falling back to province-only data", {
      message: error instanceof Error ? error.message : String(error)
    });
    return fallbackProvinces;
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const provinceCode = searchParams.get("provinceCode")?.trim() ?? "";
    const query = normalizeSearch(searchParams.get("q")?.trim() ?? "");
    const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 160), 1), 500);
    const units = await loadVietnamUnits();

    const provinces = units.map((province) => ({
      code: province.Code,
      name: province.FullName,
      wardCount: province.Wards.length
    }));

    if (!provinceCode) {
      return ok({
        source: sourceLabel,
        provinces,
        wards: []
      });
    }

    const province = units.find((item) => item.Code === provinceCode);
    if (!province) throw new AppError("Không tìm thấy tỉnh/thành trong danh mục hành chính.", 404);

    const wards = province.Wards.filter((ward) => !query || normalizeSearch(ward.FullName).includes(query))
      .slice(0, limit)
      .map((ward) => ({
        code: ward.Code,
        name: ward.FullName,
        provinceCode: ward.ProvinceCode
      }));

    return ok({
      source: sourceLabel,
      provinces,
      selectedProvince: {
        code: province.Code,
        name: province.FullName,
        wardCount: province.Wards.length
      },
      wards
    });
  } catch (error) {
    return fail(error);
  }
}
