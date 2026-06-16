import 'server-only';

import type { RunbookStep } from '@/lib/ops/runbook';
import { scanBounceRate, scanPendingSla } from '@/lib/ops/alerting';

// Named runbooks available to the run endpoint (Requirement 12.1). Each builder
// returns ordered steps; parameterless runbooks keep the API simple and safe.

export const RUNBOOK_KEYS = ['alerts-scan'] as const;
export type RunbookKey = (typeof RUNBOOK_KEYS)[number];

export function isRunbookKey(value: string): value is RunbookKey {
  return (RUNBOOK_KEYS as readonly string[]).includes(value);
}

export function buildRunbookSteps(key: RunbookKey): RunbookStep[] {
  switch (key) {
    case 'alerts-scan':
      return [
        {
          key: 'bounce-rate-scan',
          label: 'Quét tỉ lệ hard-bounce 24h',
          run: async () => {
            const result = await scanBounceRate();
            return { ok: true, detail: `rate=${(result.rate * 100).toFixed(1)}% breached=${result.breached}` };
          },
        },
        {
          key: 'sla-scan',
          label: 'Quét SLA yêu cầu pending',
          run: async () => {
            const result = await scanPendingSla();
            return { ok: true, detail: `breaches=${result.breaches.length}` };
          },
        },
      ];
    default:
      return [];
  }
}
