export type PwaConnectivityInput = {
  browserOnline: boolean;
  sameOriginReachable?: boolean | null;
};

export function resolvePwaConnectivity({ browserOnline, sameOriginReachable }: PwaConnectivityInput) {
  if (browserOnline || sameOriginReachable === true) return "online";
  if (sameOriginReachable === false) return "offline";
  return "unknown";
}
