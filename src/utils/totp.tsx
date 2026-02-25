// TOTP generator using Web Crypto API (browser-native, no dependencies needed)

function base32ToBytes(base32: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const str = base32.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (let i = 0; i < str.length; i++) {
    const idx = chars.indexOf(str[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return new Uint8Array(output);
}

export async function generateTOTP(
  secret: string,
  digits = 6,
  period = 30
): Promise<string> {
  try {
    if (!secret || secret.trim() === '') return '';

    const counter = Math.floor(Date.now() / 1000 / period);
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setUint32(0, 0, false);
    view.setUint32(4, counter >>> 0, false);

    const keyData = base32ToBytes(secret);
    if (keyData.length === 0) return '';

    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-1' },
      false,
      ['sign']
    );

    const mac = await crypto.subtle.sign('HMAC', key, buffer);
    const hash = new Uint8Array(mac);

    const offset = hash[hash.length - 1] & 0x0f;
    const code =
      (((hash[offset] & 0x7f) << 24) |
        ((hash[offset + 1] & 0xff) << 16) |
        ((hash[offset + 2] & 0xff) << 8) |
        (hash[offset + 3] & 0xff)) %
      Math.pow(10, digits);

    return code.toString().padStart(digits, '0');
  } catch {
    return '------';
  }
}

export function getRemainingSeconds(period = 30): number {
  return period - (Math.floor(Date.now() / 1000) % period);
}

export function getTOTPWindow(period = 30): number {
  return Math.floor(Date.now() / 1000 / period);
}
