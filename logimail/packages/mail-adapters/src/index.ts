export type MailProvider = 'billionmail';

export type MailboxProvisioningRequest = {
  provider: MailProvider;
  emailAddress: string;
  quotaMb: number;
};

export function assertMvpProvider(provider: string): provider is MailProvider {
  return provider === 'billionmail';
}
