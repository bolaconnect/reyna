export interface ParsedCard {
  cardNumber: string;
  expiryDate: string;
  cvv: string;
  cardholderName: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  phoneNumber: string;
  email: string;
  country: string;
}

export interface ParsedEmail {
  email: string;
  password: string;
  secret2FA: string;
  recoveryEmail: string;
  phone: string;
  note?: string;
}

export interface ParseResult {
  cards: ParsedCard[];
  emails: ParsedEmail[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns true if the string looks like a TOTP / 2FA secret */
function isSecret2FA(s: string): boolean {
  if (!s || s.length < 8) return false;
  const t = s.trim();

  // Standard Base32 uppercase (e.g. JBSWY3DPEHPK3PXP)
  if (/^[A-Z2-7]{16,}$/.test(t)) return true;

  // Compact alphanumeric ≥ 20 chars (lowercase or mixed)
  // e.g. 3cgrmeaj4cofx4rw4tcivu5gluzqwafr
  if (/^[a-zA-Z0-9]{20,}$/.test(t)) return true;

  // Grouped format: 4-char blocks separated by spaces (min 4 groups)
  // e.g. "oj27 lqpm ksay 5pmy 6uoi p3yf vzvk 6sew"
  // e.g. "bil5 aokq imz5 wbpu ktb7 wpuw 4wde ch7i"
  if (/^[a-zA-Z0-9]{4}( [a-zA-Z0-9]{4}){3,}$/.test(t)) return true;

  return false;
}

/** Check if a string is a valid email address */
function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/**
 * In a space-split token array, find the longest consecutive run of
 * 4-char alphanumeric tokens (≥ 4 groups) — this is a grouped 2FA secret.
 */
function extractGrouped2FA(
  tokens: string[]
): { secret: string; usedIndices: Set<number> } {
  let bestStart = -1;
  let bestLen = 0;
  let curStart = -1;
  let curLen = 0;

  for (let i = 0; i < tokens.length; i++) {
    if (/^[a-zA-Z0-9]{4}$/.test(tokens[i])) {
      if (curStart === -1) { curStart = i; curLen = 1; }
      else curLen++;
      if (curLen >= 4 && curLen > bestLen) {
        bestStart = curStart;
        bestLen = curLen;
      }
    } else {
      curStart = -1;
      curLen = 0;
    }
  }

  if (bestStart !== -1 && bestLen >= 4) {
    const usedIndices = new Set<number>();
    for (let i = bestStart; i < bestStart + bestLen; i++) usedIndices.add(i);
    return {
      secret: tokens.slice(bestStart, bestStart + bestLen).join(' '),
      usedIndices,
    };
  }

  return { secret: '', usedIndices: new Set() };
}

// ─── Card Parser ──────────────────────────────────────────────────────────────

/**
 * Formats supported:
 *   cardNum|MM|YY|CVV[|name|street|city|state|zip|phone|email|country]
 *   cardNum|MM/YY[YY]|CVV[|name|...]
 *   cardNum|MM/YY[YY][|name|...]   (CVV optional)
 */
function tryParseCard(line: string): ParsedCard | null {
  // Support | first, then fall back to / if no | is found
  const delimiter = line.includes('|') ? '|' : (line.includes('/') ? '/' : null);
  if (!delimiter) return null;

  const parts = line.split(delimiter).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  // First field must look like a card number (at least 12 digits after cleaning)
  const rawCard = parts[0].replace(/[\s\-\.]/g, '');
  if (!/^\d{12,19}$/.test(rawCard)) return null;

  const p1 = parts[1] ?? '';
  const p2 = parts[2] ?? '';
  const p3 = parts[3] ?? '';

  let expiry = '';
  let cvv = '';
  let remainingStart = 2; // index of first extra field

  // ── Format A: cardNum | MM | YY | CVV ──
  // or cardNum / MM / YY / CVV
  if (
    /^\d{1,2}$/.test(p1) &&
    /^\d{2,4}$/.test(p2) &&
    (/^\d{3,4}$/.test(p3) || p3 === '')
  ) {
    const mm = p1.padStart(2, '0');
    const yy = p2.length === 4 ? p2.slice(-2) : p2;
    expiry = `${mm}/${yy}`;
    if (/^\d{3,4}$/.test(p3)) {
      cvv = p3;
      remainingStart = 4;
    } else {
      remainingStart = 3;
    }
  }
  // ── Format B: cardNum | MM/YY[YY] | CVV ──
  else if (/^\d{1,2}\/\d{2,4}$/.test(p1)) {
    expiry = p1;
    if (/^\d{3,4}$/.test(p2)) {
      cvv = p2;
      remainingStart = 3;
    } else {
      remainingStart = 2;
    }
  }
  // Not a recognised card format
  else {
    return null;
  }

  // Extra positional fields after CVV
  const ex = parts.slice(remainingStart);
  // Positional order: name | street | city | state | zip | phone | email | country
  return {
    cardNumber: rawCard,
    expiryDate: expiry,
    cvv,
    cardholderName: ex[0] ?? '',
    streetAddress: ex[1] ?? '',
    city: ex[2] ?? '',
    state: ex[3] ?? '',
    zipCode: ex[4] ?? '',
    phoneNumber: ex[5] ?? '',
    email: ex[6] ?? '',
    country: ex[7] ?? '',
  };
}

// ─── Email Parser ─────────────────────────────────────────────────────────────

/**
 * Formats supported (tab-delimited or space-delimited):
 *   email  password  [recoveryEmail]  [secret2FA]  [phone]  [smsUrl]
 *
 * 2FA secret can be:
 *   - Grouped: "oj27 lqpm ksay 5pmy ..." (4-char blocks, spaces within a tab-field)
 *   - Compact: "3cgrmeaj4cofx4rw4tcivu5gluzqwafr"
 *   - Base32 uppercase: "JBSWY3DPEHPK3PXP"
 *
 * Detection heuristics for remaining fields:
 *   - Contains @  → recoveryEmail
 *   - Starts with http → skip (SMS / token URL)
 *   - 7–15 pure digits → phone
 *   - Matches isSecret2FA() → secret2FA
 */
function tryParseEmail(line: string): ParsedEmail | null {
  // If no @ and no obvious 2FA secret, it's likely not an email row
  const hasAt = line.includes('@');
  const hasSecret = isSecret2FA(line);
  if (!hasAt && !hasSecret) return null;

  const hasTabs = line.includes('\t');

  let emailVal = '';
  let password = '';
  let secret2FA = '';
  let recoveryEmail = '';
  let phone = '';
  const notes: string[] = [];

  if (hasTabs) {
    // ── Tab-delimited (Excel Style) ──
    // DO NOT filter(Boolean) here because empty columns denote missing fields.
    // Positional order: 0:Email, 1:Pass, 2:RecoveryEmail, 3:Secret2FA, 4:Phone, 5:Note/URL
    const fields = line.split('\t').map((s) => s.trim());

    // Basic heuristic: if it has at least 2 fields or one strong email/secret
    if (fields.length < 2 && !hasAt && !hasSecret) return null;

    emailVal = fields[0] || '';
    password = fields[1] || '';

    // Recovery Email (Col 2)
    if (fields[2] && isEmail(fields[2])) {
      recoveryEmail = fields[2];
    } else if (fields[2]) {
      // If it's not an email, maybe it's something else? (e.g. 2FA secret shifted)
      if (isSecret2FA(fields[2])) secret2FA = fields[2];
      else notes.push(fields[2]);
    }

    // 2FA Secret (Col 3)
    if (fields[3] && isSecret2FA(fields[3]) && !secret2FA) {
      secret2FA = fields[3];
    } else if (fields[3]) {
      // If col 3 is a phone number, assign it
      if (/^\d{7,15}$/.test(fields[3])) phone = fields[3];
      else notes.push(fields[3]);
    }

    // Phone (Col 4)
    if (fields[4] && /^\d{7,15}$/.test(fields[4]) && !phone) {
      phone = fields[4];
    } else if (fields[4]) {
      notes.push(fields[4]);
    }

    // Note / Rest (Col 5+)
    if (fields.length > 5) {
      notes.push(...fields.slice(5).filter(Boolean));
    }
  } else {
    // ── Space / comma / pipe delimited (Heuristic Search) ──
    const tokens = line.split(/[\s,|]+/).filter(Boolean);
    const emailIdx = tokens.findIndex(isEmail);

    if (emailIdx === -1) {
      if (!hasSecret) return null;
      const { secret } = extractGrouped2FA(tokens);
      secret2FA = secret || tokens.find(isSecret2FA) || '';
      notes.push(...tokens.filter(t => t !== secret2FA));
    } else {
      emailVal = tokens[emailIdx];
      password = tokens[emailIdx + 1] ?? '';

      const rest = tokens.slice(emailIdx + 2);
      const { secret, usedIndices } = extractGrouped2FA(rest);
      if (secret) secret2FA = secret;

      for (let i = 0; i < rest.length; i++) {
        if (usedIndices.has(i)) continue;
        const token = rest[i];
        if (!token) continue;
        if (token.startsWith('http')) {
          notes.push(token);
          continue;
        }
        if (isEmail(token) && token !== emailVal && !recoveryEmail) {
          recoveryEmail = token;
        } else if (/^\d{7,15}$/.test(token) && !phone) {
          phone = token;
        } else if (!secret2FA && isSecret2FA(token)) {
          secret2FA = token;
        } else {
          notes.push(token);
        }
      }
    }
  }

  // Row must have at least an email OR a password OR a secret OR a recovery email to be useful
  if (!emailVal && !password && !secret2FA && !recoveryEmail) return null;

  return {
    email: emailVal,
    password,
    secret2FA,
    recoveryEmail,
    phone,
    note: notes.join(' ')
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function parseInput(input: string): ParseResult {
  const lines = input.split('\n').filter((l) => l.trim().length > 0);
  const cards: ParsedCard[] = [];
  const emails: ParsedEmail[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Cards are always pipe-delimited and lead with a card number → try first
    const card = tryParseCard(trimmed);
    if (card) {
      cards.push(card);
      continue;
    }

    // Then try email
    const email = tryParseEmail(line); // Use raw line to preserve tabs
    if (email) {
      emails.push(email);
    }
  }

  return { cards, emails };
}
