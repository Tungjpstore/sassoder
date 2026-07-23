export interface ReleaseQaBlocker {
  code: string;
  message: string;
}

export interface ReleaseQaEvaluation {
  ok: boolean;
  blockers: ReleaseQaBlocker[];
  status: string;
  date: string;
  migrationCount: number | null;
}

export interface ReleaseQaEvaluationInput {
  text: string;
  currentBranch: string;
  currentCommit: string;
  currentMigrationCount: number;
  now?: Date | string;
  maxAgeDays?: number;
}

export function evaluateReleaseQaSignoff(input: ReleaseQaEvaluationInput): ReleaseQaEvaluation;
export function releasePreflightExitCode(input: { hasBlockers: boolean; reportOnly?: boolean }): 0 | 1;
