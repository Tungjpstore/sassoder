import { notFound } from "next/navigation";
import { CustomerOrderClient } from "@/components/customer/order-client";
import { createSeoMetadata } from "@/lib/seo/metadata";
import { getCachedPublicMenu } from "@/services/menu-service";
import { getPublicTable } from "@/services/table-service";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params
}: {
  params: Promise<{ restaurantSlug: string; tableId: string }>;
}) {
  const { restaurantSlug, tableId } = await params;
  const restaurant = await getCachedPublicMenu(restaurantSlug);

  return createSeoMetadata({
    title: restaurant ? `${restaurant.name} - Gọi món tại bàn` : "Gọi món tại bàn",
    description: "Trang gọi món QR theo bàn trên LogiVN. Trang này dành cho khách tại quán và không được lập chỉ mục công khai.",
    path: `/r/${restaurantSlug}/table/${tableId}`,
    image: restaurant?.logo_url || undefined,
    noIndex: true
  });
}

export default async function CustomerTablePage({
  params,
  searchParams
}: {
  params: Promise<{ restaurantSlug: string; tableId: string }>;
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  const { restaurantSlug, tableId } = await params;
  const query = await searchParams;
  const tableAccessToken = Array.isArray(query.t) ? query.t[0] : query.t;
  const restaurant = await getCachedPublicMenu(restaurantSlug);
  if (!restaurant) notFound();

  const table = await getPublicTable(restaurant.id, tableId, tableAccessToken);
  if (!table) notFound();

  return (
    <CustomerOrderClient
      restaurant={{
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        logoUrl: restaurant.logo_url,
        address: restaurant.address,
        hotline: restaurant.hotline,
        contactEmail: restaurant.contact_email,
        receiptFooter: restaurant.receipt_footer,
        receiptShowQr: restaurant.receipt_show_qr,
        promotions: restaurant.promotions
      }}
      table={{ id: table.id, name: table.name }}
      tableAccessToken={table.qr_token ?? tableAccessToken}
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
