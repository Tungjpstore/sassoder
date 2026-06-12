import { InboxView } from '@/components/logimail-pages';

export const dynamic = 'force-dynamic';

export default function SpamPage() {
  return <InboxView folder="spam" />;
}
