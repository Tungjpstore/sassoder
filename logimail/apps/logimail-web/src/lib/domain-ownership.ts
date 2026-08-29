import { randomBytes, timingSafeEqual } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';

export type DomainOwnershipChallenge = {
  name: string;
  type: 'TXT';
  content: string;
  token: string;
  createdAt: string;
};

export function createDomainOwnershipChallenge(domain: string, now = new Date()): DomainOwnershipChallenge {
  const token = randomBytes(24).toString('base64url');
  return {
    name: `_logimail-challenge.${domain.toLowerCase()}`,
    type: 'TXT',
    content: `logimail-verification=${token}`,
    token,
    createdAt: now.toISOString(),
  };
}

export function ownershipTokenMatches(records: string[], token: string) {
  const expected = Buffer.from(`logimail-verification=${token}`);
  return records.some((record) => {
    const candidate = Buffer.from(record.trim());
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  });
}

export async function verifyDomainOwnership(challenge: DomainOwnershipChallenge) {
  let records: string[] = [];
  try {
    records = (await resolveTxt(challenge.name)).map((chunks) => chunks.join(''));
  } catch {
    // NXDOMAIN and propagation delays are both an unverified result.
  }
  return { verified: ownershipTokenMatches(records, challenge.token), observedRecords: records };
}
