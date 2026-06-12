export function getSmtpSendPolicy() {
  return {
    rateLimitRequired: true,
    auditLogRequired: true,
    campaignAutopilot: false,
  };
}
