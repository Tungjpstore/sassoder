export const authPasswordMinLength = 10;
export const authPasswordMaxLength = 128;

export const authPasswordPolicyPatterns = {
  lowercase: /[a-z]/,
  uppercase: /[A-Z]/,
  number: /[0-9]/
} as const;

export function getAuthPasswordPolicyStatus(password: string) {
  return [
    {
      id: "min-length",
      label: `Ít nhất ${authPasswordMinLength} ký tự`,
      passed: password.length >= authPasswordMinLength
    },
    {
      id: "lowercase",
      label: "Có chữ thường",
      passed: authPasswordPolicyPatterns.lowercase.test(password)
    },
    {
      id: "uppercase",
      label: "Có chữ hoa",
      passed: authPasswordPolicyPatterns.uppercase.test(password)
    },
    {
      id: "number",
      label: "Có chữ số",
      passed: authPasswordPolicyPatterns.number.test(password)
    }
  ];
}

export function isAuthPasswordPolicySatisfied(password: string) {
  return getAuthPasswordPolicyStatus(password).every((item) => item.passed);
}
