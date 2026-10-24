import { useSyncExternalStore } from "react";

export const MOBILE_INTERFACE_QUERY = "(pointer: coarse), (max-width: 700px)";
const readMobile = () => window.matchMedia(MOBILE_INTERFACE_QUERY).matches;
const subscribe = (changed: () => void) => {
  const query = window.matchMedia(MOBILE_INTERFACE_QUERY);
  query.addEventListener("change", changed);
  return () => query.removeEventListener("change", changed);
};

// A hidden showcase would still download models and run its rendering loop.
export default function useMobileInterface() {
  return useSyncExternalStore(subscribe, readMobile, () => false);
}
