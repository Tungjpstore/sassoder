import { notFound } from "next/navigation";
import { ReservationClient } from "@/components/customer/reservation-client";
import { getPublicReservationSettingsBySlug } from "@/services/reservation-service";

export const dynamic = "force-dynamic";

export default async function PublicReservationPage({
  params
}: {
  params: Promise<{ restaurantSlug: string }>;
}) {
  const { restaurantSlug } = await params;
  const restaurant = await getPublicReservationSettingsBySlug(restaurantSlug);
  if (!restaurant) notFound();

  return (
    <ReservationClient
      restaurant={{
        name: restaurant.name,
        slug: restaurant.slug,
        logoUrl: restaurant.logo_url,
        address: restaurant.address,
        hotline: restaurant.hotline,
        contactEmail: restaurant.contact_email,
        reservationsEnabled: restaurant.reservations_enabled,
        depositEnabled: restaurant.reservation_deposit_enabled,
        depositType: restaurant.reservation_deposit_type,
        depositValue: restaurant.reservation_deposit_value,
        holdMinutes: restaurant.reservation_hold_minutes,
        durationMinutes: restaurant.reservation_duration_minutes,
        maxDaysAhead: restaurant.reservation_max_days_ahead,
        minNoticeMinutes: restaurant.reservation_min_notice_minutes
      }}
    />
  );
}
