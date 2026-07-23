export interface NpmAuditCounts {
  critical: number;
  high: number;
  moderate: number;
  low: number;
  info: number;
  total: number;
}

export interface NpmAuditEvaluation {
  ok: boolean;
  status: "pass" | "block";
  summary: string;
  counts: NpmAuditCounts | null;
}

export function evaluateNpmAuditReport(report: unknown): NpmAuditEvaluation;
