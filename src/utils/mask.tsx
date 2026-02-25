export function maskCardNumber(num: string): string {
  const digits = num.replace(/\D/g, '');
  if (digits.length < 8) return digits;
  const first4 = digits.slice(0, 4);
  const last4 = digits.slice(-4);
  return `${first4} **** **** ${last4}`;
}

/** Format a card number with a space every 4 digits: 1234 5678 9012 3456 */
export function formatCardNumberSpaced(num: string): string {
  const digits = num.replace(/\D/g, '');
  return digits.replace(/(.{4})(?=.)/g, '$1 ');
}

export function maskCVV(cvv: string): string {
  return '•'.repeat(Math.max(cvv.length, 3));
}

export function maskEmail(email: string): string {
  const atIdx = email.indexOf('@');
  if (atIdx < 0) return email;
  const local = email.slice(0, atIdx);
  const domain = email.slice(atIdx);
  const visible = local.slice(0, Math.min(3, local.length));
  return `${visible}****${domain}`;
}

export function maskPassword(password: string): string {
  if (password.length <= 6) return '•'.repeat(password.length);
  const first3 = password.slice(0, 3);
  const last3 = password.slice(-3);
  return `${first3}****${last3}`;
}

/**
 * Normalize expiry to MM/YY (2-digit year).
 * "06/2028" → "06/28"  |  "6/28" → "06/28"  |  "06/28" → "06/28"
 */
export function formatExpiry(expiry: string): string {
  if (!expiry) return '';
  const m = expiry.match(/^(\d{1,2})\/(\d{2,4})$/);
  if (!m) return expiry;
  const mm = m[1].padStart(2, '0');
  const yy = m[2].slice(-2);
  return `${mm}/${yy}`;
}