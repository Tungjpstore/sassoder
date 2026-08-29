export function trustedClientIp(headers: Headers) {
  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  // The rightmost forwarded address is the one appended by our trusted proxy.
  const forwarded = headers.get('x-forwarded-for') ?? '';
  const addresses = forwarded.split(',').map((value) => value.trim()).filter(Boolean);
  return addresses.at(-1) ?? 'unknown';
}
