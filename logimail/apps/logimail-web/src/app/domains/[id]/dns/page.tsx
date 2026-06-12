import { DnsChecklistView } from '@/components/logimail-pages';

export const dynamic = 'force-dynamic';

export default async function DomainDnsPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <DnsChecklistView id={id} />;
}
