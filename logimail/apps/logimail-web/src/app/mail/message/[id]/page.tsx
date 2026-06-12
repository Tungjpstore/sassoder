import { MessageDetailView } from '@/components/logimail-pages';

export const dynamic = 'force-dynamic';

export default async function MessagePage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  return <MessageDetailView id={id} />;
}
