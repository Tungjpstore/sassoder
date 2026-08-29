export type VerifiedTotpFactor = {
  id: string;
  factor_type: 'totp';
  status: 'verified';
  friendly_name?: string;
};

type MfaResult<T> = Promise<{ data: T | null; error: Error | null }>;

export type AdminMfaApi = {
  listFactors: () => MfaResult<{ totp: VerifiedTotpFactor[] }>;
  challengeAndVerify: (input: { factorId: string; code: string }) => MfaResult<unknown>;
};

export class AdminMfaFactorsError extends Error {
  constructor() {
    super('Không thể đọc phương thức MFA của tài khoản. Thao tác chưa được chạy lại.');
    this.name = 'AdminMfaFactorsError';
  }
}

export class AdminMfaVerificationError extends Error {
  constructor() {
    super('Mã xác thực chưa đúng hoặc đã hết hạn. Kiểm tra mã mới nhất rồi thử lại.');
    this.name = 'AdminMfaVerificationError';
  }
}

export function isMfaRequiredError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 'mfa_required';
}

export function selectVerifiedTotpFactor(factors: readonly VerifiedTotpFactor[]): VerifiedTotpFactor | null {
  return factors.find((factor) => factor.factor_type === 'totp' && factor.status === 'verified') ?? null;
}

export async function loadVerifiedTotpFactor(mfa: Pick<AdminMfaApi, 'listFactors'>): Promise<VerifiedTotpFactor | null> {
  const { data, error } = await mfa.listFactors();
  if (error || !data) throw new AdminMfaFactorsError();
  return selectVerifiedTotpFactor(data.totp);
}

export async function verifyTotpAndRetry<T>(input: {
  mfa: Pick<AdminMfaApi, 'challengeAndVerify'>;
  factorId: string;
  code: string;
  retry: () => Promise<T>;
}): Promise<T> {
  const { error } = await input.mfa.challengeAndVerify({ factorId: input.factorId, code: input.code });
  if (error) throw new AdminMfaVerificationError();

  // The guarded mutation is invoked once only after Supabase has persisted the AAL2 session.
  return input.retry();
}
