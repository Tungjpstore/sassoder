import { notFound } from "next/navigation";
import { ReservationClient } from "@/components/customer/reservation-client";
import { createSeoMetadata } from "@/lib/seo/metadata";
import { getPublicReservationPreferenceOptionsBySlug, getPublicReservationSettingsBySlug } from "@/services/reservation-service";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params
}: {
  params: Promise<{ restaurantSlug: string }>;
}) {
  const { restaurantSlug } = await params;
  const restaurant = await getPublicReservationSettingsBySlug(restaurantSlug);

  return createSeoMetadata({
    title: restaurant ? `${restaurant.name} - Đặt bàn trước` : "Đặt bàn trước",
    description: "Trang đặt bàn trước trên LogiVN. Khách chọn thời gian, số khách và đặt cọc nếu quán yêu cầu.",
    path: `/r/${restaurantSlug}/reserve`,
    image: restaurant?.logo_url || undefined,
    noIndex: true
  });
}

export default async function PublicReservationPage({
  params
}: {
  params: Promise<{ restaurantSlug: string }>;
}) {
  const { restaurantSlug } = await params;
  const restaurant = await getPublicReservationSettingsBySlug(restaurantSlug);
  if (!restaurant) notFound();
  const preferenceOptions = await getPublicReservationPreferenceOptionsBySlug(restaurantSlug);

  return (
    <ReservationClient
      restaurant={{
        name: restaurant.name,
        slug: restaurant.slug,
        logoUrl: restaurant.logo_url,
        address: restaurant.address,
        storeLat: restaurant.store_lat,
        storeLng: restaurant.store_lng,
        hotline: restaurant.hotline,
        contactEmail: restaurant.contact_email,
        reservationsEnabled: restaurant.reservations_enabled,
        depositEnabled: restaurant.reservation_deposit_enabled,
        depositType: restaurant.reservation_deposit_type,
        depositValue: restaurant.reservation_deposit_value,
        holdMinutes: restaurant.reservation_hold_minutes,
        durationMinutes: restaurant.reservation_duration_minutes,
        maxDaysAhead: restaurant.reservation_max_days_ahead,
        minNoticeMinutes: restaurant.reservation_min_notice_minutes,
        preferenceOptions: preferenceOptions ?? {
          tableAreas: [],
          seatingZones: [],
          tableKinds: []
        }
      }}
    />
  );
}
