import { DomainDetailView } from '@/components/logimail-pages';

export const dynamic = 'force-dynamic';

export default async function DomainDetailPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <DomainDetailView id={id} />;
}
