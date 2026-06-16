// Pure auto-approval decision logic (Requirement 9). No imports so the rule
// matrix can be unit-tested directly.

export type ApprovalRequestType = 'account' | 'domain' | 'mailbox';

export type AutoApprovalRules = {
  account: boolean;
  domain: boolean;
  mailbox: boolean;
};

export const DEFAULT_AUTO_APPROVAL_RULES: AutoApprovalRules = {
  // Conservative defaults: only low-risk mailbox requests auto-approve.
  account: false,
  domain: false,
  mailbox: true,
};

export type AutoApprovalDecision = {
  autoApprove: boolean;
  reason: 'rule_disabled' | 'risk_flags_present' | 'auto_approved';
};

/**
 * Decide whether a request auto-approves (R9.1–9.3):
 *  - the rule for its type must be enabled, and
 *  - it must carry no risk flags (any risk flag keeps it pending).
 */
export function evaluateAutoApprovalDecision(input: {
  type: ApprovalRequestType;
  riskFlags?: string[] | null;
  rules?: AutoApprovalRules;
}): AutoApprovalDecision {
  const rules = input.rules ?? DEFAULT_AUTO_APPROVAL_RULES;
  const riskFlags = input.riskFlags ?? [];

  if (!rules[input.type]) return { autoApprove: false, reason: 'rule_disabled' };
  if (riskFlags.length > 0) return { autoApprove: false, reason: 'risk_flags_present' }; // R9.3
  return { autoApprove: true, reason: 'auto_approved' }; // R9.2
}

export const BULK_MAX_IDS = 500;

/** Clamp/validate a bulk identifier set to the 500-item cap (R10.4). */
export function limitBulkIds(ids: string[]): string[] {
  return ids.slice(0, BULK_MAX_IDS);
}
