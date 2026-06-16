import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Domain & DNS management now lives inside the unified console at "/".
export default function DomainsPage() {
  redirect('/');
}
