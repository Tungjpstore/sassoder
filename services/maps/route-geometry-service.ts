import type { RouteGeometry } from "@/services/maps/types";

type Point = [number, number];

function getMaxRoutePoints() {
  const value = Number(process.env.MAPS_ROUTE_GEOMETRY_MAX_POINTS ?? 140);
  return Number.isFinite(value) ? Math.min(Math.max(Math.round(value), 2), 1000) : 140;
}

function getSimplificationTolerance() {
  const value = Number(process.env.MAPS_ROUTE_GEOMETRY_TOLERANCE_DEGREES ?? 0.00005);
  return Number.isFinite(value) && value >= 0 ? Math.min(value, 0.01) : 0.00005;
}

export function getRouteGeometryCacheScope() {
  return `geom:${getMaxRoutePoints()}:${getSimplificationTolerance()}`;
}

function squaredDistanceToSegment(point: Point, start: Point, end: Point) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (dx === 0 && dy === 0) {
    const singleDx = point[0] - start[0];
    const singleDy = point[1] - start[1];
    return singleDx * singleDx + singleDy * singleDy;
  }

  const ratio = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)));
  const projected: Point = [start[0] + ratio * dx, start[1] + ratio * dy];
  const projectedDx = point[0] - projected[0];
  const projectedDy = point[1] - projected[1];
  return projectedDx * projectedDx + projectedDy * projectedDy;
}

function douglasPeucker(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2 || tolerance <= 0) return points;
  let maxDistance = 0;
  let splitIndex = 0;

  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = squaredDistanceToSegment(points[index], points[0], points[points.length - 1]);
    if (distance > maxDistance) {
      maxDistance = distance;
      splitIndex = index;
    }
  }

  if (maxDistance <= tolerance * tolerance) return [points[0], points[points.length - 1]];
  const left = douglasPeucker(points.slice(0, splitIndex + 1), tolerance);
  const right = douglasPeucker(points.slice(splitIndex), tolerance);
  return left.slice(0, -1).concat(right);
}

function downsample(points: Point[], maxPoints: number): Point[] {
  if (points.length <= maxPoints) return points;
  const result: Point[] = [];
  const lastIndex = points.length - 1;

  for (let index = 0; index < maxPoints; index += 1) {
    result.push(points[Math.round((index * lastIndex) / (maxPoints - 1))]);
  }

  return result;
}

function isValidPoint(point: number[]): point is Point {
  return point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]);
}

export function simplifyRouteGeometry(geometry: RouteGeometry | null, maxPoints = getMaxRoutePoints()) {
  if (!geometry || geometry.coordinates.length <= maxPoints) return geometry;
  const points = geometry.coordinates.filter(isValidPoint);
  if (points.length <= 2) return geometry;
  const simplified = downsample(douglasPeucker(points, getSimplificationTolerance()), maxPoints);
  return {
    type: "LineString" as const,
    coordinates: simplified
  };
}
