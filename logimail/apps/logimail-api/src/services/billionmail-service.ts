export type BillionMailServiceConfig = {
  baseUrl: string;
  apiKey?: string;
  installDir: string;
};

export function getBillionMailConfig(): BillionMailServiceConfig {
  return {
    baseUrl: process.env.BILLIONMAIL_BASE_URL ?? '',
    apiKey: process.env.BILLIONMAIL_API_KEY,
    installDir: process.env.BILLIONMAIL_INSTALL_DIR ?? '/opt/BillionMail',
  };
}

export function assertBillionMailReady() {
  const config = getBillionMailConfig();
  const missing = ['baseUrl'].filter((key) => !config[key as keyof BillionMailServiceConfig]);
  return { ready: missing.length === 0, missing, installDir: config.installDir };
}
