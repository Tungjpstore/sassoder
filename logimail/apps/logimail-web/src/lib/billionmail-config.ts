export function readBillionMailProviderConfig() {
  const baseUrl = process.env.BILLIONMAIL_BASE_URL?.trim() ?? '';
  const apiToken = process.env.BILLIONMAIL_API_TOKEN?.trim() || process.env.BILLIONMAIL_API_KEY?.trim() || '';
  const apiPrefix = process.env.BILLIONMAIL_API_PREFIX?.trim() || '/api';
  const bridgeBaseUrl = process.env.BILLIONMAIL_BRIDGE_BASE_URL?.trim() || process.env.LOGIMAIL_BILLIONMAIL_BRIDGE_BASE_URL?.trim() || '';
  const bridgeToken = process.env.BILLIONMAIL_BRIDGE_TOKEN?.trim() || process.env.LOGIMAIL_BILLIONMAIL_BRIDGE_TOKEN?.trim() || '';
  return { baseUrl, apiToken, apiPrefix, bridgeBaseUrl, bridgeToken };
}

export function billionMailBridgeMailboxEndpoint(baseUrl: string) {
  return `${baseUrl.trim().replace(/\/+$/, '')}/mailbox`;
}

export function billionMailProviderReadiness() {
  const config = readBillionMailProviderConfig();
  const directReady = Boolean(config.baseUrl && config.apiToken);
  const bridgeReady = Boolean(config.bridgeBaseUrl && config.bridgeToken);
  if (directReady) return { ready: true as const, mode: 'direct' as const, missing: [] as string[] };
  if (bridgeReady) return { ready: true as const, mode: 'bridge' as const, missing: [] as string[] };
  return {
    ready: false as const,
    mode: 'not_configured' as const,
    missing: [
      !config.baseUrl ? 'BILLIONMAIL_BASE_URL' : null,
      !config.apiToken ? 'BILLIONMAIL_API_TOKEN' : null,
      !config.bridgeBaseUrl ? 'BILLIONMAIL_BRIDGE_BASE_URL' : null,
      !config.bridgeToken ? 'BILLIONMAIL_BRIDGE_TOKEN' : null,
    ].filter(Boolean) as string[],
  };
}
