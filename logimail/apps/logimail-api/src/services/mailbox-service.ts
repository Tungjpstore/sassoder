export type CreateMailboxInput = {
  workspaceId: string;
  domainId: string;
  emailAddress: string;
  quotaMb?: number;
};

export function validateMailboxInput(input: CreateMailboxInput) {
  if (!input.emailAddress.includes('@')) return { ok: false as const, error: 'invalid_email' };
  return { ok: true as const };
}
