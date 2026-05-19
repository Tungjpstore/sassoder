export function resolveDeliveryQuoteEtaMinutes({
  showRouteEta,
  routeDurationMinutes,
  configuredEtaMinutes
}: {
  showRouteEta: boolean;
  routeDurationMinutes?: number | null;
  configuredEtaMinutes: number;
}) {
  const fallbackEta = Number.isFinite(configuredEtaMinutes)
    ? Math.max(1, Math.round(configuredEtaMinutes))
    : 30;

  if (!showRouteEta || !Number.isFinite(routeDurationMinutes)) return fallbackEta;
  return Math.max(fallbackEta, Math.round(Number(routeDurationMinutes)));
}
