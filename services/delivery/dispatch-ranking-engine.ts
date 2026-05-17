import { buildDistanceEstimate } from "@/services/maps/distance-service";
import { resolveDistanceMatrix } from "@/services/maps/distance-matrix-service";
import type { Coordinate, DistanceMatrixCell, DistanceMatrixPoint, MapRequestContext, RoutingProvider } from "@/services/maps/types";
import type { DeliveryCourierStatus } from "@/services/delivery-tracking-service";

export type DispatchCourierCandidate = {
  id: string;
  name: string;
  phone?: string | null;
  status: DeliveryCourierStatus;
  lastLocationAt?: string | null;
  location?: (Coordinate & { capturedAt?: string | null; accuracyMeters?: number | null }) | null;
  activeOrderCount?: number;
};

export type DispatchJob = {
  pickup: Coordinate;
  dropoff: Coordinate;
  createdAt?: string | null;
};

export type RankedDispatchCandidate = DispatchCourierCandidate & {
  rank: number;
  score: number;
  eligible: boolean;
  reason: string;
  distanceToPickupKm: number | null;
  etaToPickupMinutes: number | null;
  totalEtaMinutes: number;
  deliveryLegMinutes: number;
  confidence: "high" | "medium" | "low";
  provider: DistanceMatrixCell["provider"];
};

type RankDispatchOptions = {
  now?: Date;
  provider?: RoutingProvider;
  context?: MapRequestContext;
  maxRoutedCouriers?: number;
  matrixResolver?: typeof resolveDistanceMatrix;
};

const unavailableStatuses = new Set<DeliveryCourierStatus>(["offline", "paused"]);

function minutesSince(value: string | null | undefined, now: Date) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.round((now.getTime() - timestamp) / 60_000));
}

function statusPenalty(status: DeliveryCourierStatus) {
  if (status === "available") return 0;
  if (status === "assigned") return 24;
  if (status === "busy") return 60;
  if (status === "paused") return 320;
  return 520;
}

function locationPenalty(ageMinutes: number | null, hasLocation: boolean) {
  if (!hasLocation) return 180;
  if (ageMinutes === null) return 120;
  if (ageMinutes > 45) return 90;
  if (ageMinutes > 15) return 36;
  if (ageMinutes > 5) return 12;
  return 0;
}

function resolveCandidatePoint(candidate: DispatchCourierCandidate): DistanceMatrixPoint | null {
  if (!candidate.location) return null;
  return {
    id: candidate.id,
    label: candidate.name,
    lat: candidate.location.lat,
    lng: candidate.location.lng
  };
}

function explainCandidate(candidate: DispatchCourierCandidate, ageMinutes: number | null, hasLocation: boolean) {
  if (candidate.status === "offline") return "Shipper đang offline";
  if (candidate.status === "paused") return "Shipper đang tạm dừng";
  if (!hasLocation) return "Thiếu vị trí GPS gần nhất";
  if (ageMinutes !== null && ageMinutes > 45) return "Vị trí GPS đã cũ";
  if (candidate.status === "busy") return "Đang giao đơn khác";
  if (candidate.status === "assigned") return "Đã được gán đơn";
  return "Phù hợp nhất theo vị trí và tải hiện tại";
}

export async function rankDispatchCandidates(
  job: DispatchJob,
  candidates: DispatchCourierCandidate[],
  options: RankDispatchOptions = {}
): Promise<RankedDispatchCandidate[]> {
  const now = options.now ?? new Date();
  const pickupPoint: DistanceMatrixPoint = { id: "pickup", label: "Pickup", ...job.pickup };
  const points = candidates.map(resolveCandidatePoint).filter((point): point is DistanceMatrixPoint => Boolean(point));
  const matrixResolver = options.matrixResolver ?? resolveDistanceMatrix;
  const matrix = await matrixResolver(points, [pickupPoint], {
    provider: options.provider,
    context: options.context,
    maxRoutedPairs: options.maxRoutedCouriers ?? 8
  });
  const pickupCells = new Map(matrix.map((cell) => [cell.originId, cell]));
  const deliveryLeg = buildDistanceEstimate(job.pickup, job.dropoff);

  const ranked = candidates.map((candidate) => {
    const ageMinutes = minutesSince(candidate.location?.capturedAt ?? candidate.lastLocationAt, now);
    const hasLocation = Boolean(candidate.location);
    const cell = pickupCells.get(candidate.id) ?? null;
    const distanceToPickupKm = cell?.distanceKm ?? (candidate.location ? buildDistanceEstimate(candidate.location, job.pickup).distanceKm : null);
    const etaToPickupMinutes = cell?.durationMinutes ?? (candidate.location ? buildDistanceEstimate(candidate.location, job.pickup).durationMinutes : null);
    const activeOrderCount = candidate.activeOrderCount ?? (candidate.status === "busy" ? 1 : 0);
    const eligible = !unavailableStatuses.has(candidate.status) && hasLocation;
    const score =
      statusPenalty(candidate.status) +
      locationPenalty(ageMinutes, hasLocation) +
      activeOrderCount * 28 +
      (distanceToPickupKm ?? 18) * 8 +
      (etaToPickupMinutes ?? 45) * 1.4;

    return {
      ...candidate,
      rank: 0,
      score: Math.round(score * 100) / 100,
      eligible,
      reason: explainCandidate(candidate, ageMinutes, hasLocation),
      distanceToPickupKm,
      etaToPickupMinutes,
      totalEtaMinutes: Math.round((etaToPickupMinutes ?? 45) + deliveryLeg.durationMinutes),
      deliveryLegMinutes: deliveryLeg.durationMinutes,
      confidence: cell?.confidence ?? (hasLocation ? "low" : "low"),
      provider: cell?.provider ?? "haversine"
    } satisfies RankedDispatchCandidate;
  });

  return ranked
    .sort((left, right) => {
      if (left.eligible !== right.eligible) return left.eligible ? -1 : 1;
      if (left.score !== right.score) return left.score - right.score;
      return left.name.localeCompare(right.name, "vi");
    })
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}
