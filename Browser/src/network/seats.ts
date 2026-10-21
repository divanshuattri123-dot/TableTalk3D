import type { Session } from "./useGameRoom";

interface SeatStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
const key = (room: string) => `table-talk-seat:${room}`;
export function readSeat(room: string, stores: SeatStorage[]): Session | undefined {
  for (const store of stores) {
    try {
      const seat = JSON.parse(store.getItem(key(room)) ?? store.getItem("table-talk-seat") ?? "null") as Session | null;
      if (seat?.roomCode === room && seat.player?.id) return seat;
    } catch { /* One blocked store must not prevent trying another. */ }
  }
}
export function writeSeat(seat: Session, stores: SeatStorage[]) {
  for (const store of stores) {
    try { store.setItem(key(seat.roomCode), JSON.stringify(seat)); }
    catch { /* Private browsing may offer only a live seat. */ }
  }
}
