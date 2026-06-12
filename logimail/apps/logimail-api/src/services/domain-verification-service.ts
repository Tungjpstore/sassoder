export type DnsCheckStatus = 'unknown' | 'pass' | 'fail' | 'warning';

export type DomainCheck = {
  mx: DnsCheckStatus;
  spf: DnsCheckStatus;
  dkim: DnsCheckStatus;
  dmarc: DnsCheckStatus;
  ptr: DnsCheckStatus;
};

export function emptyDomainCheck(): DomainCheck {
  return { mx: 'unknown', spf: 'unknown', dkim: 'unknown', dmarc: 'unknown', ptr: 'unknown' };
}
