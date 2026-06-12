type LogimailApprovalEventInput = {
  requestId: string;
  requestType: 'account' | 'domain' | 'mailbox';
  requesterUserId?: string | null;
  requesterEmail?: string | null;
  workspaceId?: string | null;
  workspaceName?: string | null;
  workspaceSlug?: string | null;
  targetValue: string;
  purpose?: string | null;
  domain?: string | null;
  mailHostname?: string | null;
  emailAddress?: string | null;
  displayName?: string | null;
  quotaMb?: number | null;
  riskFlags?: string[];
  plannedRecordCount?: number;
  createdAt?: string | null;
};

export async function notifyPlatformLogimailApprovalRequested(input: LogimailApprovalEventInput) {
  const gatewayUrl = process.env.LOGIVN_API_INTERNAL_URL || process.env.LOGIVN_API_PUBLIC_URL || '';
  const internalKey = process.env.LOGIVN_INTERNAL_API_KEY || '';
  if (!gatewayUrl || !internalKey) {
    console.warn('[logimail-platform-events] skipped approval notification: missing gateway env');
    return { queued: false, reason: 'missing_gateway_config' as const };
  }

  const event = {
    type: 'platform.logimail.approval_requested',
    eventId: `platform.logimail.approval_requested:${input.requestType}:${input.requestId}`,
    tenantId: 'platform',
    source: 'dashboard',
    occurredAt: new Date().toISOString(),
    logimail: {
      requestId: input.requestId,
      requestType: input.requestType,
      requesterUserId: input.requesterUserId ?? null,
      requesterEmail: input.requesterEmail ?? null,
      workspaceId: input.workspaceId ?? null,
      workspaceName: input.workspaceName ?? null,
      workspaceSlug: input.workspaceSlug ?? null,
      targetValue: input.targetValue,
      purpose: input.purpose ?? null,
      domain: input.domain ?? null,
      mailHostname: input.mailHostname ?? null,
      emailAddress: input.emailAddress ?? null,
      displayName: input.displayName ?? null,
      quotaMb: input.quotaMb ?? null,
      riskFlags: input.riskFlags ?? [],
      plannedRecordCount: input.plannedRecordCount ?? 0,
      createdAt: input.createdAt ?? new Date().toISOString(),
    },
  };

  let eventsUrl: URL;
  try {
    eventsUrl = new URL('/events', gatewayUrl);
  } catch (error) {
    console.error('[logimail-platform-events] publish failed', {
      requestId: input.requestId,
      requestType: input.requestType,
      message: error instanceof Error ? error.message : String(error),
    });
    return { queued: false, reason: 'invalid_gateway_url' as const };
  }

  const response = await fetch(eventsUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-logivn-internal-key': internalKey,
    },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(1500),
  }).catch((error) => {
    console.error('[logimail-platform-events] publish failed', {
      requestId: input.requestId,
      requestType: input.requestType,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  });

  if (!response?.ok) {
    console.error('[logimail-platform-events] gateway rejected approval notification', {
      requestId: input.requestId,
      requestType: input.requestType,
      status: response?.status ?? 0,
    });
    return { queued: false, reason: 'gateway_rejected' as const };
  }

  return { queued: true as const };
}
