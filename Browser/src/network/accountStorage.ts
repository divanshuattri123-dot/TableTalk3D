const endpoint = "/api/player-data";
const pending = new Map<string, string>();
const saved = new Map<string, string>();
let saving: Promise<void> | undefined;

export const usesCloudAccount = () =>
  typeof document !== "undefined" && Boolean(document.querySelector('meta[name="tabletalk-cloud-account"]'));

export async function loadCloudAccount() {
  if (!usesCloudAccount()) return;
  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) throw new Error("Your saved profile could not be loaded.");
  const { values } = await response.json() as { values: Record<string, string> };
  for (const [key, value] of Object.entries(values)) saved.set(key, value);
  window.addEventListener("online", () => void flushCloudAccount().catch(() => {}));
  // Back navigation after sign-out must recheck the current Sites session.
  window.addEventListener("pageshow", event => { if (event.persisted) window.location.reload(); });
}

export function flushCloudAccount(): Promise<void> {
  if (!usesCloudAccount()) return Promise.resolve();
  if (saving) return saving;
  saving = (async () => {
    while (pending.size) {
      const entries = [...pending];
      const result = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(entries)),
        keepalive: true
      });
      if (!result.ok) throw new Error("Your changes could not be saved. Try again when connected.");
      for (const [key, value] of entries) {
        if (pending.get(key) === value) pending.delete(key);
      }
    }
  })().finally(() => { saving = undefined; });
  return saving;
}

const cloudStorage = {
  getItem(key: string) { return saved.get(key) ?? null; },
  setItem(key: string, value: string) {
    if (saved.get(key) === value) return;
    saved.set(key, value);
    pending.set(key, value);
    void flushCloudAccount().catch(() => {});
  }
};

export function playerStorage() {
  return usesCloudAccount() ? cloudStorage : window.localStorage;
}
