export const PASSWORD_MAX_AGE_DAYS = 90;
export const PASSWORD_MIN_LENGTH = 6;

export function validatePasswordClient(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH)
    return `비밀번호는 최소 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다`;
  return null;
}

export const PASSWORD_RULE_TEXT = `${PASSWORD_MIN_LENGTH}자 이상`;

export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
}

export function isPasswordExpiringSoon(iso: string | null | undefined): boolean {
  const d = daysSince(iso);
  return d != null && d >= PASSWORD_MAX_AGE_DAYS;
}
