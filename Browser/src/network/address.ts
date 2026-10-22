export function roomAddress(configured: string | undefined, page: { protocol: string; hostname: string; host: string }, development: boolean) {
  const host = configured ? configured.replace(/^(https?|wss?):\/\//, "").replace(/\/$/, "") : development ? `${page.hostname}:1999` : page.host;
  const explicitSecure = /^(https|wss):\/\//.test(configured ?? "");
  const explicitPlain = /^(http|ws):\/\//.test(configured ?? "");
  return { host, protocol: explicitSecure ? "wss" as const : explicitPlain ? "ws" as const : page.protocol === "https:" ? "wss" as const : "ws" as const };
}
