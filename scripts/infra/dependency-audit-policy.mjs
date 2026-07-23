/**
 * Convert npm audit JSON output into a release-gate decision.
 * Keep this pure so the policy is testable without network access.
 */
export function evaluateNpmAuditReport(report) {
  const vulnerabilities = report?.metadata?.vulnerabilities;
  if (!vulnerabilities || typeof vulnerabilities !== "object") {
    return {
      ok: false,
      status: "block",
      summary: "npm audit output is missing metadata.vulnerabilities.",
      counts: null,
    };
  }

  const counts = {
    critical: Number(vulnerabilities.critical ?? 0),
    high: Number(vulnerabilities.high ?? 0),
    moderate: Number(vulnerabilities.moderate ?? 0),
    low: Number(vulnerabilities.low ?? 0),
    info: Number(vulnerabilities.info ?? 0),
    total: Number(vulnerabilities.total ?? 0),
  };
  const invalidCount = Object.values(counts).some((value) => !Number.isFinite(value) || value < 0);
  if (invalidCount) {
    return {
      ok: false,
      status: "block",
      summary: "npm audit output contains invalid vulnerability counts.",
      counts,
    };
  }

  const blocking = counts.critical + counts.high;
  return {
    ok: blocking === 0,
    status: blocking === 0 ? "pass" : "block",
    summary:
      blocking === 0
        ? `npm audit found no critical/high vulnerabilities (${counts.total} total advisory record(s)).`
        : `npm audit found ${counts.critical} critical and ${counts.high} high vulnerability(ies).`,
    counts,
  };
}
