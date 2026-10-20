type FullscreenDocument = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void> };
type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

export const fullscreenActive = () => Boolean(document.fullscreenElement || (document as FullscreenDocument).webkitFullscreenElement);

export async function enterGameFullscreen(element: HTMLElement = document.documentElement): Promise<boolean> {
  try {
    if (element.requestFullscreen) await element.requestFullscreen({ navigationUI: "hide" });
    else if ((element as FullscreenElement).webkitRequestFullscreen) await (element as FullscreenElement).webkitRequestFullscreen!();
    else return false;
    return true;
  } catch { return false; }
}

export async function exitGameFullscreen() {
  if (document.exitFullscreen && document.fullscreenElement) await document.exitFullscreen();
  else await (document as FullscreenDocument).webkitExitFullscreen?.();
}
