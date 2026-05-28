function parseIpv4(value: string) {
  const parts = value.trim().split(".");
  if (parts.length !== 4) return null;

  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    result = (result << 8) + octet;
  }

  return result >>> 0;
}

function normalizeIp(value: string | null | undefined) {
  const ip = value?.trim();
  if (!ip) return null;
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  return ip;
}

export function exactIpCidr(ipAddress: string | null | undefined) {
  const ip = normalizeIp(ipAddress);
  if (!ip || ip === "local") return null;
  if (parseIpv4(ip) !== null) return `${ip}/32`;
  if (ip.includes(":")) return `${ip}/128`;
  return null;
}

export function ipMatchesCidr(ipAddress: string | null | undefined, cidr: string | null | undefined) {
  const ip = normalizeIp(ipAddress);
  const rule = cidr?.trim();
  if (!ip || !rule || ip === "local") return false;

  const [baseIp, rawPrefix] = rule.split("/");
  const ipV4 = parseIpv4(ip);
  const baseV4 = parseIpv4(baseIp ?? "");
  if (ipV4 !== null && baseV4 !== null) {
    const prefix = rawPrefix === undefined ? 32 : Number(rawPrefix);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (ipV4 & mask) === (baseV4 & mask);
  }

  const normalizedRuleIp = normalizeIp(baseIp);
  return Boolean(normalizedRuleIp && ip.toLowerCase() === normalizedRuleIp.toLowerCase());
}

export function firstForwardedIp(value: string | null | undefined) {
  return value?.split(",")[0]?.trim() || null;
}
