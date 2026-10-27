/** Deterministic string hash → 32-bit unsigned int. */
export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const PALETTE = [
  '#C05621', '#B7791F', '#9C4221', '#2C5282', '#2F855A',
  '#6B46C1', '#B83280', '#975A16', '#2C7A7B', '#822727',
  '#4A5568', '#1A365D', '#22543D', '#5A3E8B', '#9B2C2C',
];

export interface SpineStyle {
  color: string;
  accent: string;
  roughness: number;
}

/** Spine colour + accent derived from the skill title/slug. */
export function spineStyle(seed: string): SpineStyle {
  const h = hashString(seed);
  const color = PALETTE[h % PALETTE.length];
  const accent = PALETTE[(h >>> 8) % PALETTE.length];
  return { color, accent, roughness: 0.55 + ((h >>> 16) % 30) / 100 };
}

/** Slight per-book colour jitter so the shelf does not look flat. */
export function jitterColor(hex: string, seed: string, amount = 14): string {
  const h = hashString(seed);
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const r = clamp(((n >> 16) & 255) + (((h & 0xff) % (amount * 2 + 1)) - amount));
  const g = clamp(((n >> 8) & 255) + ((((h >> 8) & 0xff) % (amount * 2 + 1)) - amount));
  const b = clamp((n & 255) + ((((h >> 16) & 0xff) % (amount * 2 + 1)) - amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
