export type RemoteCustomerProfile = {
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryLat?: number;
  deliveryLng?: number;
};

export type RemoteCustomerProfileSnapshot = {
  version: 1;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryLat?: number;
  deliveryLng?: number;
};

function normalizeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function normalizeCoordinate(value: unknown, min: number, max: number) {
  const coordinate = Number(value);
  if (!Number.isFinite(coordinate) || coordinate < min || coordinate > max) return undefined;
  return coordinate;
}

export function normalizeRemoteCustomerProfile(value: Partial<RemoteCustomerProfile>): RemoteCustomerProfile {
  return {
    customerName: normalizeText(value.customerName, 120),
    customerPhone: normalizeText(value.customerPhone, 24),
    deliveryAddress: normalizeText(value.deliveryAddress, 240),
    deliveryLat: normalizeCoordinate(value.deliveryLat, -90, 90),
    deliveryLng: normalizeCoordinate(value.deliveryLng, -180, 180)
  };
}

export function hasRemoteCustomerProfileValue(profile: RemoteCustomerProfile) {
  return Boolean(
    profile.customerName ||
      profile.customerPhone ||
      profile.deliveryAddress ||
      typeof profile.deliveryLat === "number" ||
      typeof profile.deliveryLng === "number"
  );
}

export function serializeRemoteCustomerProfile(profile: RemoteCustomerProfile): RemoteCustomerProfileSnapshot {
  return {
    version: 1,
    ...normalizeRemoteCustomerProfile(profile)
  };
}

export function restoreRemoteCustomerProfileSnapshot(value: string | null): RemoteCustomerProfile {
  if (!value) return normalizeRemoteCustomerProfile({});

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return normalizeRemoteCustomerProfile({});
    return normalizeRemoteCustomerProfile(parsed as Partial<RemoteCustomerProfile>);
  } catch {
    return normalizeRemoteCustomerProfile({});
  }
}
