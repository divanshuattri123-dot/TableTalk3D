type FullscreenDocument = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void> };
type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
type OrientationControl = { lock?: (orientation: "landscape") => Promise<void>; unlock?: () => void };

export const phoneNeedsLandscape = (width: number, height: number, coarsePointer: boolean) => coarsePointer && width <= 700 && height > width;

export async function lockGameLandscape(orientation: OrientationControl = screen.orientation as OrientationControl): Promise<boolean> {
  try { if (!orientation?.lock) return false; await orientation.lock("landscape"); return true; } catch { return false; }
}

export function releaseGameOrientation(orientation: OrientationControl = screen.orientation as OrientationControl) {
  try { orientation?.unlock?.(); } catch { /* Some browsers expose the API but disallow it in an embedded page. */ }
}

export const fullscreenActive = () => Boolean(document.fullscreenElement || (document as FullscreenDocument).webkitFullscreenElement);

export async function enterGameFullscreen(element: HTMLElement = document.documentElement): Promise<boolean> {
  try {
    if (!fullscreenActive()) {
      if (element.requestFullscreen) await element.requestFullscreen({ navigationUI: "hide" });
      else if ((element as FullscreenElement).webkitRequestFullscreen) await (element as FullscreenElement).webkitRequestFullscreen!();
      else return false;
    }
    // Mobile browsers normally require fullscreen before accepting an orientation lock.
    if (window.matchMedia("(pointer: coarse)").matches) await lockGameLandscape();
    return true;
  } catch { return false; }
}

export async function exitGameFullscreen() {
  releaseGameOrientation();
  if (document.exitFullscreen && document.fullscreenElement) await document.exitFullscreen();
  else await (document as FullscreenDocument).webkitExitFullscreen?.();
}
