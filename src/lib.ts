export const SITE_URL = 'https://nenisys.shop';
export const OG_DEFAULT = `${SITE_URL}/og-image.png`;
export const API_URL: string = (import.meta.env.VITE_API_URL ?? 'https://api.nenisys.shop').replace(/\/+$/, '');
export const PAGE_SIZE = 13; // 1 featured + 12 in the grid

/** Relative paths, fragments, https, mailto and tel only (mirrors the backend check). */
export function isSafeHref(v: string): boolean {
  if (!v || v.length > 2048 || /[\\\s\u0000-\u001f\u007f]/.test(v)) return false;
  if (v.startsWith('#')) return true;
  if (v.startsWith('/')) return !v.startsWith('//');
  try {
    return ['https:', 'mailto:', 'tel:'].includes(new URL(v).protocol);
  } catch {
    return false;
  }
}

export function isHttpsUrl(v: string): boolean {
  if (!v || v.length > 2048) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !u.username && !u.password;
  } catch {
    return false;
  }
}

const FMT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' });
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : FMT.format(d);
}
