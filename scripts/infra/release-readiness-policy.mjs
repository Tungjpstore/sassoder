const FORBIDDEN_MARKER_PATTERN = /\b(Waived|Pending|Missing|TBD|TODO|Blocked|Failed|Fail)\b/gi;

function blocker(code, message) {
  return { code, message };
}

function metadataValue(text, key) {
  const pattern = new RegExp(`^${key}\\s*:\\s*(.+?)\\s*$`, "im");
  return text.match(pattern)?.[1]?.trim() ?? "";
}

function exactTokenPresent(text, value) {
  if (!value) return false;
  let offset = 0;
  while (true) {
    const index = text.indexOf(value, offset);
    if (index < 0) return false;
    const before = text[index - 1] ?? "";
    const after = text[index + value.length] ?? "";
    if (!/[A-Za-z0-9_./-]/.test(before) && !/[A-Za-z0-9_./-]/.test(after)) return true;
    offset = index + value.length;
  }
}

function markdownStatusAndEvidence(text) {
  const values = [];
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const header = lines[index];
    if (!/^\s*\|/.test(header) || !/\bStatus\b/i.test(header)) continue;
    const columns = header.split("|").slice(1, -1).map((column) => column.trim().toLowerCase());
    if (!columns.length || !/^\s*\|?\s*:?-{3,}/.test(lines[index + 1] ?? "")) continue;
    const relevantColumns = columns
      .map((column, columnIndex) => ({ column, columnIndex }))
      .filter(({ column }) => column === "status" || /evidence|notes?/.test(column));

    for (let rowIndex = index + 2; rowIndex < lines.length && /^\s*\|/.test(lines[rowIndex]); rowIndex += 1) {
      const cells = lines[rowIndex].split("|").slice(1, -1).map((cell) => cell.trim());
      for (const { column, columnIndex } of relevantColumns) {
        if (cells[columnIndex]) values.push({ source: column, value: cells[columnIndex] });
      }
    }
  }

  return values;
}

function forbiddenMarkers(text, status, tableValues) {
  const values = [
    { source: "top-level status", value: status },
    ...tableValues,
  ];
  const found = new Map();

  for (const { source, value } of values) {
    for (const match of value.matchAll(FORBIDDEN_MARKER_PATTERN)) {
      const marker = match[1].toLowerCase();
      found.set(marker, source);
    }
  }

  return [...found.entries()].map(([marker, source]) => blocker(
    "forbidden-marker",
    `Release QA contains forbidden marker "${marker}" in ${source}.`
  ));
}

function parseDate(value) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return null;
  return new Date(timestamp);
}

function parseMigrationCount(text) {
  const metadata = text.match(/^Migration(?:\s+file)?\s+count\s*:\s*(\d+)\s*$/im);
  if (metadata) return Number(metadata[1]);

  const table = text.match(/^\|\s*Migration(?:\s+file)?\s+count\s*\|\s*(\d+)\s*\|?\s*$/im);
  return table ? Number(table[1]) : null;
}

function approvedStatus(status) {
  return /^(?:approved(?:\s+for\s+(?:release|production))?|pass(?:ed)?|pass[- ]ready|ready(?:\s+for\s+(?:release|production))?|go)(?:\s*[-:]\s*.+)?$/i.test(status.trim());
}

/**
 * Evaluate authenticated QA evidence without touching the network or filesystem.
 * @param {{text:string,currentBranch:string,currentCommit:string,currentMigrationCount:number,now?:Date|string,maxAgeDays?:number}} input
 */
export function evaluateReleaseQaSignoff({
  text,
  currentBranch,
  currentCommit,
  currentMigrationCount,
  now = new Date(),
  maxAgeDays = 14,
}) {
  const blockers = [];
  const status = metadataValue(text, "Status");
  const dateText = metadataValue(text, "Date");
  const migrationCount = parseMigrationCount(text);
  const tableValues = markdownStatusAndEvidence(text);

  blockers.push(...forbiddenMarkers(text, status, tableValues));

  if (!status) {
    blockers.push(blocker("status-missing", "Release QA sign-off has no top-level Status field."));
  } else if (!approvedStatus(status)) {
    blockers.push(blocker("status-not-approved", `Top-level QA status "${status}" is not an approved/pass-ready status.`));
  }

  const date = parseDate(dateText);
  if (!date) {
    blockers.push(blocker("date-invalid", `QA Date "${dateText || "(missing)"}" is not parseable.`));
  } else {
    const referenceDate = now instanceof Date ? now : new Date(now);
    const ageDays = (referenceDate.getTime() - date.getTime()) / 86_400_000;
    if (ageDays < 0) {
      blockers.push(blocker("date-future", `QA evidence date ${dateText} is in the future.`));
    } else if (ageDays > maxAgeDays) {
      blockers.push(blocker("stale-evidence", `QA evidence is ${ageDays.toFixed(1)} days old; maximum allowed age is ${maxAgeDays} days.`));
    }
  }

  if (!currentBranch) {
    blockers.push(blocker("current-branch-missing", "Current release branch could not be determined."));
  } else if (!exactTokenPresent(text, currentBranch)) {
    blockers.push(blocker("branch-mismatch", `QA sign-off does not contain current branch "${currentBranch}".`));
  }

  if (!currentCommit) {
    blockers.push(blocker("current-commit-missing", "Current release commit could not be determined."));
  } else if (!/^[0-9a-f]{40,64}$/i.test(currentCommit)) {
    blockers.push(blocker("current-commit-not-full", "Current release commit is not a full SHA."));
  } else if (!exactTokenPresent(text.toLowerCase(), currentCommit.toLowerCase())) {
    blockers.push(blocker("commit-mismatch", `QA sign-off does not contain full current commit ${currentCommit}.`));
  }

  if (!Number.isInteger(migrationCount)) {
    blockers.push(blocker("migration-count-missing", "QA sign-off is missing a structured Migration count field."));
  } else if (!Number.isInteger(currentMigrationCount)) {
    blockers.push(blocker("current-migration-count-missing", "Current migration count could not be determined."));
  } else if (migrationCount !== currentMigrationCount) {
    blockers.push(blocker("migration-count-mismatch", `QA sign-off migration count ${migrationCount} does not match current count ${currentMigrationCount}.`));
  }

  return {
    ok: blockers.length === 0,
    blockers,
    status,
    date: dateText,
    migrationCount,
  };
}

export function releasePreflightExitCode({ hasBlockers, reportOnly = false }) {
  return hasBlockers && !reportOnly ? 1 : 0;
}
