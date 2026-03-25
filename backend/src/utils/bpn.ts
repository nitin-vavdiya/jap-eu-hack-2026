import { randomBytes } from 'crypto';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Generates a CSPRNG BPN matching ^(BPNL|BPNS)[A-Z0-9]{12}$
 */
export function generateBpn(prefix: 'BPNL' | 'BPNS' = 'BPNL'): string {
  const bytes = randomBytes(12);
  const suffix = Array.from(bytes)
    .map((b) => CHARS[b % CHARS.length])
    .join('');
  return `${prefix}${suffix}`;
}
