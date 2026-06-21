export type DashboardApiEnvelope<T = unknown> = {
  data?: T;
  error?: string;
  message?: string;
  ok?: boolean;
  success?: boolean;
};

export function dashboardApiErrorMessage(payload: DashboardApiEnvelope | null, fallback: string) {
  return payload?.error ?? payload?.message ?? fallback;
}

export async function readDashboardApiResponse<T = unknown>(response: Response, fallback = "Thao tác thất bại") {
  const payload = (await response.json().catch(() => null)) as DashboardApiEnvelope<T> | null;
  const failedEnvelope = payload?.ok === false || payload?.success === false;

  if (!response.ok || failedEnvelope) {
    throw new Error(dashboardApiErrorMessage(payload, fallback));
  }

  return payload?.data as T | undefined;
}
