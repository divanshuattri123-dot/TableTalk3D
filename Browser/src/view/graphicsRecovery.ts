export function watchGraphicsLoss(target: EventTarget, interrupted: () => void) {
  const lost = (event: Event) => {
    // Allow context restoration as well as rebuilding just the interrupted view.
    event.preventDefault();
    interrupted();
  };
  target.addEventListener('webglcontextlost', lost);
  return () => target.removeEventListener('webglcontextlost', lost);
}
