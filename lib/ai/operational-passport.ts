export type AiOperationalPassportSurface = "dashboard" | "customer" | "admin" | "onboarding";

export type AiOperationalPassport = {
  surface: AiOperationalPassportSurface;
  title: string;
  status: string | null;
  goal: string;
  route: string | null;
  nextActionId: string | null;
  nextActionLabel: string | null;
  checkpoint: string | null;
  handoffRoute: string | null;
  handoffLabel: string | null;
  confidence: "high" | "medium" | "low";
  summary: string;
  updatedAt: string;
};

export function buildOperationalPassport(input: {
  surface: AiOperationalPassportSurface;
  title: string;
  goal: string;
  status?: string | null;
  route?: string | null;
  nextActionId?: string | null;
  nextActionLabel?: string | null;
  checkpoint?: string | null;
  handoffRoute?: string | null;
  handoffLabel?: string | null;
  confidence?: "high" | "medium" | "low";
  updatedAt?: string;
}): AiOperationalPassport {
  const title = input.title.trim();
  const goal = input.goal.trim() || "Chưa có mục tiêu rõ ràng.";
  const status = input.status?.trim() || null;
  const route = input.route?.trim() || null;
  const nextActionLabel = input.nextActionLabel?.trim() || null;
  const checkpoint = input.checkpoint?.trim() || null;
  const handoffRoute = input.handoffRoute?.trim() || null;
  const handoffLabel = input.handoffLabel?.trim() || null;
  const confidence = input.confidence ?? "medium";
  const summary = [
    title,
    status ? `Trạng thái: ${status}` : "",
    `Mục tiêu: ${goal}`,
    nextActionLabel ? `Bước tiếp: ${nextActionLabel}` : "",
    checkpoint ? `Checkpoint: ${checkpoint}` : "",
    handoffLabel || handoffRoute ? `Handoff: ${handoffLabel || handoffRoute}` : ""
  ]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 280);

  return {
    surface: input.surface,
    title,
    status,
    goal,
    route,
    nextActionId: input.nextActionId?.trim() || null,
    nextActionLabel,
    checkpoint,
    handoffRoute,
    handoffLabel,
    confidence,
    summary,
    updatedAt: input.updatedAt ?? new Date().toISOString()
  };
}

export function passportDigest(passport: AiOperationalPassport | null | undefined) {
  if (!passport) return "";

  return [
    `Operational Passport: ${passport.title}`,
    passport.status ? `Trạng thái: ${passport.status}` : "",
    `Mục tiêu: ${passport.goal}`,
    passport.nextActionLabel ? `Bước tiếp: ${passport.nextActionLabel}` : "",
    passport.checkpoint ? `Checkpoint: ${passport.checkpoint}` : "",
    passport.handoffRoute || passport.handoffLabel ? `Handoff: ${passport.handoffLabel || passport.handoffRoute}` : "",
    passport.route ? `Route: ${passport.route}` : "",
    `Độ chắc: ${passport.confidence}`
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 1200);
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function sanitizeOperationalPassport(value: unknown): AiOperationalPassport | null {
  const record = asRecord(value);
  if (!record) return null;

  const surface = record.surface;
  const confidence = record.confidence;

  if (
    surface !== "dashboard" &&
    surface !== "customer" &&
    surface !== "admin" &&
    surface !== "onboarding"
  ) {
    return null;
  }

  if (confidence !== "high" && confidence !== "medium" && confidence !== "low") {
    return null;
  }

  if (typeof record.title !== "string" || typeof record.goal !== "string") {
    return null;
  }

  return buildOperationalPassport({
    surface,
    title: record.title,
    goal: record.goal,
    status: typeof record.status === "string" ? record.status : null,
    route: typeof record.route === "string" ? record.route : null,
    nextActionId: typeof record.nextActionId === "string" ? record.nextActionId : null,
    nextActionLabel: typeof record.nextActionLabel === "string" ? record.nextActionLabel : null,
    checkpoint: typeof record.checkpoint === "string" ? record.checkpoint : null,
    handoffRoute: typeof record.handoffRoute === "string" ? record.handoffRoute : null,
    handoffLabel: typeof record.handoffLabel === "string" ? record.handoffLabel : null,
    confidence,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : undefined
  });
}
