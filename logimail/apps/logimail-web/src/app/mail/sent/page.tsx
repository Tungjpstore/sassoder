import { InboxView } from '@/components/logimail-pages';

export const dynamic = 'force-dynamic';

export default function SentPage() {
  return <InboxView folder="sent" />;
}
