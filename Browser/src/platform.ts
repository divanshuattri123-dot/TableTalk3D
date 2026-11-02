export const PUBLIC_GAME_URL = 'https://divanshuattri123-dot.github.io/TableTalk3D/';
export function roomShareUrl(room: string, href: string, packaged = import.meta.env.VITE_PACKAGED_APP === 'true') {
  const url = new URL(packaged ? PUBLIC_GAME_URL : href);
  url.search = new URLSearchParams({ room }).toString(); url.hash = '';
  return url.href;
}
export function nativeMobileShell() {
  if (typeof window === 'undefined') return false;
  const bridge = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return bridge?.isNativePlatform?.() === true;
}
