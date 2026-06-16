import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Mailbox management now lives inside the unified console at "/".
export default function MailboxesPage() {
  redirect('/');
}
