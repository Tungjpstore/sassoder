import { jsonOk } from '@/lib/api-boundary';
import { getRegistrationDomains } from '@/lib/registration-domains';

export async function GET() {
  const domains = await getRegistrationDomains();
  return jsonOk({ domains });
}
