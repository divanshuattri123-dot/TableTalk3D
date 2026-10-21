export const PLAYER_COLORS = ["#ed6266", "#4e9fef", "#37b995", "#efb447", "#ac81e4", "#ed79bc"];

export function playerColorKey(color: string): string {
  const key = color.trim().toLowerCase();
  return /^#[0-9a-f]{3}$/.test(key) ? `#${key.slice(1).split("").map(value => value + value).join("")}` : key;
}

export function isPlayerColorTaken(players: readonly { id: string; color: string }[], color: string, exceptId?: string) {
  return players.some(player => player.id !== exceptId && playerColorKey(player.color) === playerColorKey(color));
}
