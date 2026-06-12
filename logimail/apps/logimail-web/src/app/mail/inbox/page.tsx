import { InboxView } from '@/components/logimail-pages';

export const dynamic = 'force-dynamic';

export default function InboxPage() {
  return <InboxView folder="inbox" />;
}
