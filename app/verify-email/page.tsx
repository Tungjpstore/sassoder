import { VerifyEmailForm } from "@/components/dashboard/verify-email-form";

export const dynamic = "force-dynamic";

export default async function VerifyEmailAliasPage({
  searchParams
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const params = await searchParams;
  return <VerifyEmailForm email={params.email ?? ""} />;
}
