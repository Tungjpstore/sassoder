import { buildDistanceEstimate } from "@/services/maps/distance-service";
import { resolveDistanceAndEta } from "@/services/maps/routing/routing-service";
import type {
  DistanceMatrixCell,
  DistanceMatrixPoint,
  MapRequestContext,
  ResolvedRouteResult,
  RoutingProvider
} from "@/services/maps/types";

type MatrixResolver = (
  origin: DistanceMatrixPoint,
  destination: DistanceMatrixPoint,
  options: { provider?: RoutingProvider; context?: MapRequestContext }
) => Promise<ResolvedRouteResult>;

type ResolveDistanceMatrixOptions = {
  provider?: RoutingProvider;
  context?: MapRequestContext;
  maxRoutedPairs?: number;
  concurrency?: number;
  resolver?: MatrixResolver;
};

function estimatedCell(origin: DistanceMatrixPoint, destination: DistanceMatrixPoint): DistanceMatrixCell {
  const estimate = buildDistanceEstimate(origin, destination);
  return {
    originId: origin.id,
    destinationId: destination.id,
    distanceKm: estimate.distanceKm,
    durationMinutes: estimate.durationMinutes,
    provider: "haversine",
    confidence: "low",
    isEstimated: true
  };
}

function routeToCell(origin: DistanceMatrixPoint, destination: DistanceMatrixPoint, route: ResolvedRouteResult): DistanceMatrixCell {
  return {
    originId: origin.id,
    destinationId: destination.id,
    distanceKm: route.distanceKm,
    durationMinutes: route.durationMinutes ?? buildDistanceEstimate(origin, destination).durationMinutes,
    provider: route.provider,
    confidence: route.confidence,
    isEstimated: route.isEstimated
  };
}

async function mapWithConcurrency<T, TResult>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<TResult>
) {
  const results = new Array<TResult>(values.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, values.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(values[index]);
      }
    })
  );

  return results;
}

export function buildEstimatedDistanceMatrix(
  origins: DistanceMatrixPoint[],
  destinations: DistanceMatrixPoint[]
): DistanceMatrixCell[] {
  return origins.flatMap((origin) => destinations.map((destination) => estimatedCell(origin, destination)));
}

export async function resolveDistanceMatrix(
  origins: DistanceMatrixPoint[],
  destinations: DistanceMatrixPoint[],
  options: ResolveDistanceMatrixOptions = {}
): Promise<DistanceMatrixCell[]> {
  const pairs = origins.flatMap((origin) => destinations.map((destination) => ({ origin, destination })));
  const maxRoutedPairs = options.maxRoutedPairs ?? 12;
  if (pairs.length === 0) return [];
  if (pairs.length > maxRoutedPairs) return buildEstimatedDistanceMatrix(origins, destinations);

  const resolver = options.resolver ?? resolveDistanceAndEta;
  return mapWithConcurrency(pairs, options.concurrency ?? 4, async ({ origin, destination }) => {
    try {
      const route = await resolver(origin, destination, { provider: options.provider, context: options.context });
      return routeToCell(origin, destination, route);
    } catch {
      return estimatedCell(origin, destination);
    }
  });
}
