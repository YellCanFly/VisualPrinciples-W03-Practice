/** Deterministic opaque sRGB utilities. Alpha is deliberately unsupported in rubric 2.0. */
export type RGB = readonly [number, number, number];
const NAMED: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff',
  yellow: '#ffff00', cyan: '#00ffff', aqua: '#00ffff', magenta: '#ff00ff', fuchsia: '#ff00ff',
  gray: '#808080', grey: '#808080', silver: '#c0c0c0', maroon: '#800000', olive: '#808000',
  lime: '#00ff00', teal: '#008080', navy: '#000080', purple: '#800080', orange: '#ffa500',
};
export function parseColor(input: string): RGB {
  let value = input.trim().toLowerCase();
  value = NAMED[value] ?? value;
  if (/^#[\da-f]{3}$/.test(value)) value = '#' + [...value.slice(1)].map(c => c + c).join('');
  if (/^#[\da-f]{6}$/.test(value)) return [1, 3, 5].map(n => parseInt(value.slice(n, n + 2), 16) / 255) as unknown as RGB;
  const rgb = value.match(/^rgb\(\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*[, ]\s*([\d.]+%?)\s*\)$/);
  if (rgb) {
    const parts = rgb.slice(1).map(c => parseFloat(c) / (c.endsWith('%') ? 100 : 255));
    if (parts.every(c => Number.isFinite(c) && c >= 0 && c <= 1)) return parts as unknown as RGB;
  }
  throw new Error(`不可解析或不支持的非不透明颜色：${input}`);
}
export const clip = (value: number) => Math.max(0, Math.min(1, value));
export const linear = (value: number, low: number, high: number) => clip((value - low) / (high - low));
const channelLinear = (c: number) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
export function luminance(color: RGB): number {
  return color.map(channelLinear).reduce((total, c, i) => total + c * [0.2126, 0.7152, 0.0722][i], 0);
}
export function contrastRatio(a: RGB, b: RGB): number {
  const l1 = luminance(a), l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
export function sameColor(a: RGB, b: RGB): boolean { return a.every((c, i) => Math.abs(c - b[i]) < 1e-8); }
export function oklab(color: RGB): RGB {
  const [r, g, b] = color.map(channelLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
export function colorSimilarity(a: string, b: string): number {
  if (a === 'none' || b === 'none') return a === b ? 1 : 0;
  const p = oklab(parseColor(a)), q = oklab(parseColor(b));
  return 1 - linear(Math.hypot(...p.map((v, i) => v - q[i])), 0.02, 0.15);
}
export function relativeSimilarity(a: number, b: number): number {
  if (a === 0 && b === 0) return 1;
  return 1 - linear(Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)), 0.05, 0.30);
}
