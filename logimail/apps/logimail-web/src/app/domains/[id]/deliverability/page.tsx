import { DeliverabilityView } from '@/components/logimail-pages';

export const dynamic = 'force-dynamic';

export default async function DeliverabilityPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <DeliverabilityView id={id} />;
}
