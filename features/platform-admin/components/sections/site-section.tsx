import { Upload } from "lucide-react";
import {
  updateBillingSettingAction,
  updateBrandSettingAction,
  updateLandingSettingAction
} from "@/app/admin/actions";
import {
  Field,
  PrimaryButton,
  SectionCard,
  TextArea
} from "@/features/platform-admin/components/primitives";
import type { Snapshot } from "@/features/platform-admin/types";

export function SiteSettings({ snapshot }: { snapshot: Snapshot }) {
  const brand = snapshot.settings.brand.value;
  const landing = snapshot.settings.landing.value;
  const billing = snapshot.settings.billing.value;

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <SectionCard title="Nhận diện thương hiệu">
        <form action={updateBrandSettingAction} encType="multipart/form-data" className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Tên công ty" name="companyName" defaultValue={String(brand.companyName)} />
            <Field label="Pháp nhân" name="legalName" defaultValue={String(brand.legalName)} />
            <Field label="Hotline" name="hotline" defaultValue={String(brand.hotline)} />
            <Field label="Email hỗ trợ" name="email" type="email" defaultValue={String(brand.email)} />
            <Field label="Màu chính" name="primaryColor" type="color" defaultValue={String(brand.primaryColor)} />
            <Field label="Màu nhấn" name="accentColor" type="color" defaultValue={String(brand.accentColor)} />
          </div>
          <TextArea label="Địa chỉ công ty" name="address" defaultValue={String(brand.address)} rows={2} />
          <input type="hidden" name="logoUrl" value={String(brand.logoUrl)} />
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Tải logo mới
            <input name="logoFile" type="file" accept="image/*" className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm" />
          </label>
          <PrimaryButton tone="dark"><Upload size={16} /> Lưu thương hiệu</PrimaryButton>
        </form>
      </SectionCard>

      <SectionCard title="Landing page">
        <form action={updateLandingSettingAction} encType="multipart/form-data" className="grid gap-4">
          <Field label="Headline hero" name="heroTitle" defaultValue={String(landing.heroTitle)} />
          <TextArea label="Mô tả hero" name="heroSubtitle" defaultValue={String(landing.heroSubtitle)} rows={3} />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="CTA chính" name="primaryCta" defaultValue={String(landing.primaryCta)} />
            <Field label="CTA phụ" name="secondaryCta" defaultValue={String(landing.secondaryCta)} />
          </div>
          <Field label="Tiêu đề social proof" name="trustTitle" defaultValue={String(landing.trustTitle)} />
          <Field label="Tiêu đề vùng dashboard" name="dashboardTitle" defaultValue={String(landing.dashboardTitle)} />
          <TextArea label="Mô tả vùng dashboard" name="dashboardSubtitle" defaultValue={String(landing.dashboardSubtitle)} rows={2} />
          <Field label="Tiêu đề CTA cuối trang" name="finalTitle" defaultValue={String(landing.finalTitle)} />
          <TextArea label="Mô tả CTA cuối trang" name="finalSubtitle" defaultValue={String(landing.finalSubtitle)} rows={2} />
          <Field label="Tagline footer" name="footerTagline" defaultValue={String(landing.footerTagline)} />
          <input type="hidden" name="bannerUrl" value={String(landing.bannerUrl)} />
          <label className="grid gap-2 text-sm font-semibold text-slate-700">
            Tải banner hero mới
            <input name="bannerFile" type="file" accept="image/*" className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm" />
          </label>
          <PrimaryButton tone="dark"><Upload size={16} /> Lưu landing</PrimaryButton>
        </form>
      </SectionCard>

      <SectionCard title="Tài khoản VietQR của LogiVN" className="xl:col-span-2">
        <form action={updateBillingSettingAction} className="grid gap-4 md:grid-cols-5">
          <Field label="Ngân hàng" name="bankCode" defaultValue={String(billing.bankCode)} />
          <Field label="Số tài khoản" name="bankAccount" defaultValue={String(billing.bankAccount)} />
          <Field label="Tên chủ TK" name="bankAccountName" defaultValue={String(billing.bankAccountName)} />
          <Field label="Prefix nội dung" name="transferPrefix" defaultValue={String(billing.transferPrefix)} />
          <Field label="Gói mặc định" name="defaultPlanCode" defaultValue={String(billing.defaultPlanCode)} />
          <div className="md:col-span-5">
            <PrimaryButton tone="orange">Lưu cấu hình thu phí</PrimaryButton>
          </div>
        </form>
      </SectionCard>
    </div>
  );
}
