import { notFound } from "next/navigation";
import { CustomerOrderClient } from "@/components/customer/order-client";
import { getCachedPublicMenu } from "@/services/menu-service";
import { getPublicTable } from "@/services/table-service";

export const dynamic = "force-dynamic";

export default async function CustomerTablePage({
  params
}: {
  params: Promise<{ restaurantSlug: string; tableId: string }>;
}) {
  const { restaurantSlug, tableId } = await params;
  const restaurant = await getCachedPublicMenu(restaurantSlug);
  if (!restaurant) notFound();

  const table = await getPublicTable(restaurant.id, tableId);
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
      categories={restaurant.categories.map((category) => ({
        id: category.id,
        name: category.name,
        items: (category.items ?? []).map((item) => ({
          id: item.id,
          categoryId: item.category_id,
          name: item.name,
          price: item.price,
          image: item.image_url
        }))
      }))}
    />
  );
}
