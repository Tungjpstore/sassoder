import { InboxView } from '@/components/logimail-pages';

export const dynamic = 'force-dynamic';

export default function TrashPage() {
  return <InboxView folder="trash" />;
}
