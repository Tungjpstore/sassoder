import Link from "next/link";
import { notFound } from "next/navigation";
import { QrCode, ShoppingBag } from "lucide-react";
import { LogiVNLogo } from "@/components/brand/logivn-logo";
import { RemoteClientV2 } from "@/components/customer-v2/remote/remote-client-v2";
import { Button } from "@/components/ui/button";
import { createSeoMetadata } from "@/lib/seo/metadata";
import { getCachedPublicMenu } from "@/services/menu-service";
import "@/app/styles/customer-tokens-v2.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params
}: {
  params: Promise<{ restaurantSlug: string }>;
}) {
  const { restaurantSlug } = await params;
  const restaurant = await getCachedPublicMenu(restaurantSlug);

  return createSeoMetadata({
    title: restaurant ? `${restaurant.name} - Menu gọi món online` : "Menu quán",
    description: restaurant
      ? `Menu gọi món online của ${restaurant.name}. Khách chọn món, gọi thêm món và theo dõi trạng thái đơn trên LogiVN.`
      : "Menu gọi món online trên LogiVN.",
    path: `/r/${restaurantSlug}`,
    image: restaurant?.logo_url || undefined,
    noIndex: true
  });
}

export default async function TenantMenuFallbackPage({
  params
}: {
  params: Promise<{ restaurantSlug: string }>;
}) {
  const { restaurantSlug } = await params;
  const restaurant = await getCachedPublicMenu(restaurantSlug);
  if (!restaurant) notFound();

  if (restaurant.online_ordering_enabled && (restaurant.pickup_enabled || restaurant.delivery_enabled)) {
    return (
      <RemoteClientV2
        restaurant={{
          id: restaurant.id,
          name: restaurant.name,
          slug: restaurant.slug,
          logoUrl: restaurant.logo_url,
          address: restaurant.address,
          storeLat: restaurant.store_lat,
          storeLng: restaurant.store_lng,
          hotline: restaurant.hotline,
          contactEmail: restaurant.contact_email,
          receiptFooter: restaurant.receipt_footer,
          receiptShowQr: restaurant.receipt_show_qr,
          pickupEnabled: restaurant.pickup_enabled,
          deliveryEnabled: restaurant.delivery_enabled,
          deliveryRadiusKm: restaurant.delivery_radius_km,
          minOrderForDelivery: restaurant.min_order_for_delivery,
          pickupEtaMinutes: restaurant.pickup_eta_minutes,
          deliveryEtaMinutes: restaurant.delivery_eta_minutes,
          onlinePaymentMode: restaurant.online_payment_mode,
          deliveryTrackingEnabled: restaurant.delivery_tracking_enabled,
          showStoreMarkerOnOrdering: restaurant.show_store_marker_on_ordering,
          showCustomerDistance: restaurant.show_customer_distance,
          showDeliveryEta: restaurant.show_delivery_eta,
          serviceFeeEnabled: restaurant.service_fee_enabled,
          serviceFeePercent: restaurant.service_fee_percent,
          serviceFeeMin: restaurant.service_fee_min,
          serviceFeeMax: restaurant.service_fee_max,
          branches: restaurant.branches,
          promotions: restaurant.onlinePromotions
        }}
        categories={restaurant.categories.map((category) => ({
          id: category.id,
          name: category.name,
          items: (category.items ?? []).map((item) => ({
            id: item.id,
            categoryId: item.category_id,
            name: item.name,
            price: item.price,
            image: item.image_url,
            modifierGroups: item.modifierGroups ?? []
          }))
        }))}
      />
    );
  }

  return (
    <main className="stitch-customer vietnam-pattern relative flex min-h-screen items-center justify-center bg-[var(--background)] px-5">
      <section className="silk-panel relative w-full max-w-md rounded-2xl p-6 text-center">
        <div className="mb-5 flex justify-center">
          <LogiVNLogo className="h-9" priority />
        </div>
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--primary)] text-[#FFF7EB] dark:text-[var(--background)]">
          {restaurant.online_ordering_enabled ? <ShoppingBag size={22} /> : <QrCode size={22} />}
        </div>
        <h1 className="mt-5 text-2xl font-semibold">{restaurant.name}</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted-foreground)]">
          Vui lòng quét mã QR trên bàn để mở đúng bàn và bắt đầu gọi món. Nếu muốn nhận đơn từ xa, chủ quán cần bật Đặt món online trong trang Cài đặt.
        </p>
        <Link className="mt-6 inline-flex" href="/">
          <Button variant="secondary">Về trang chủ</Button>
        </Link>
      </section>
    </main>
  );
}
