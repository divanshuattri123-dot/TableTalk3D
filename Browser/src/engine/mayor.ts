import { classicPosition, railroadPositions } from "./board";
import type { GameState, Player } from "./types";

export const TRAIN_FARE = 75;
export const LOAN_AMOUNT = 200;
export const LOAN_REPAYMENT = 225;
export const LOAN_CASH_LIMIT = 400;
export const AUDIT_FINE = 25;
export const WHEEL_SECTIONS = ["Bank dividend", "Building loan matures", "Doctor’s fee", "Jail release", "Advance to GO", "Lucky Scratch"] as const;

export type CityPolicy = "loans" | "transit";
export interface TaxBill {
  round: number;
  amount: number;
  dueTurn: number;
  status: "open" | "deferred" | "paid";
}
interface CitySeat {
  turns: number;
  rent: number;
  bills: TaxBill[];
  borrowed?: true;
  loanDue?: number;
  rodeExpress?: true;
  freeRideRound?: number;
  visitedWheel?: true;
}
export interface WheelDecision {
  id: number;
  playerId: string;
  section?: number;
  prize?: number;
}
export interface CityDesk {
  mayorId: string;
  firstId: string;
  term: number;
  termStart: number;
  round: number;
  treasury: number;
  auditUsed?: true;
  tip?: string[];
  proposalUsed?: true;
  voteUsed?: true;
  proposal?: { term: number; kind: CityPolicy; sponsorId: string; votes: string[] };
  policy?: { kind: CityPolicy; sponsorId: string };
  seats: Record<string, CitySeat>;
  wheel?: WheelDecision;
  wheelResult?: WheelDecision;
  jackpotUsed?: true;
}
export type CityAction =
  | { type: "CITY_PAY_TAX" | "CITY_DEFER_TAX"; playerId: string; round: number }
  | { type: "CITY_AUDIT"; playerId: string; term: number; targetId: string }
  | { type: "CITY_TIP"; playerId: string; term: number }
  | { type: "CITY_PROPOSE"; playerId: string; term: number; policy: CityPolicy }
  | { type: "CITY_VOTE"; playerId: string; term: number }
  | { type: "CITY_LOAN"; playerId: string; round: number }
  | { type: "CITY_EXPRESS"; playerId: string }
  | { type: "CITY_SPIN"; playerId: string; wheelId: number; section?: number; prizeRoll?: number }
  | { type: "CITY_SCRATCH" | "CITY_SKIP_WHEEL"; playerId: string; wheelId: number };

export function startCity(players: Player[], firstId: string): CityDesk {
  return {
    mayorId: firstId, firstId, term: 1, termStart: 1, round: 1, treasury: 400,
    seats: Object.fromEntries(players.map(player => [player.id, { turns: 0, rent: 0, bills: [] }]))
  };
}

export function updateCitySeat(state: GameState, id: string, update: (seat: CitySeat) => CitySeat): GameState {
  const desk = state.mayor;
  const seat = desk?.seats[id];
  if (!desk || !seat) return state;
  return { ...state, mayor: { ...desk, seats: { ...desk.seats, [id]: update(seat) } } };
}

export const recordRent = (state: GameState, id: string, amount: number) =>
  state.mayor && amount > 0 ? updateCitySeat(state, id, seat => ({ ...seat, rent: seat.rent + amount })) : state;

export function fortPosition(state: Pick<GameState, "boardSize">) {
  return classicPosition(23, state.boardSize);
}

export function cityStable(state: GameState) {
  return !!state.mayor && (state.phase === "awaitingRoll" || state.phase === "awaitingEndTurn");
}

export function trainOffer(state: GameState, playerId: string) {
  const desk = state.mayor;
  if (!desk || state.phase !== "awaitingRoll" || state.activePlayerId !== playerId || state.consecutiveDoubles !== 0) return;
  const player = state.players.find(candidate => candidate.id === playerId);
  const stations = railroadPositions(state.boardSize);
  if (!player || player.bankrupt || player.inJail || !stations.includes(player.position) || desk.seats[playerId]?.rodeExpress) return;
  const seat = desk.seats[playerId];
  const free = desk.policy?.kind === "transit" && seat?.freeRideRound !== desk.round && desk.treasury >= TRAIN_FARE;
  return { to: stations.find(position => position > player.position) ?? stations[0]!, fare: free ? 0 : TRAIN_FARE };
}

export function cityLoanAvailable(state: GameState, playerId: string) {
  const desk = state.mayor;
  const player = state.players.find(candidate => candidate.id === playerId);
  return cityStable(state) && state.activePlayerId === playerId && !!player && !player.bankrupt &&
    player.cash <= LOAN_CASH_LIMIT && desk?.policy?.kind === "loans" &&
    desk.policy.sponsorId !== playerId && desk.treasury >= LOAN_AMOUNT && !desk.seats[playerId]?.borrowed;
}

export function nextMayor(state: GameState, after: string) {
  const index = state.players.findIndex(player => player.id === after);
  for (let offset = 1; offset <= state.players.length; offset++) {
    const candidate = state.players[(index + offset) % state.players.length]!;
    if (!candidate.bankrupt) return candidate.id;
  }
  return after;
}

export function newTerm(desk: CityDesk, mayorId: string): CityDesk {
  return { ...desk, mayorId, term: desk.term + 1, termStart: desk.round, auditUsed: undefined, tip: undefined, proposalUsed: undefined };
}

export const cityTax = (rent: number) =>
  Math.min(200, Math.floor((
    Math.max(0, Math.min(300, rent) - 100) * 2 +
    Math.max(0, Math.min(600, rent) - 300) * 3 +
    Math.max(0, rent - 600) * 4
  ) / 10));

export function nextCityTurn(state: GameState, actor: string, nextId: string): GameState {
  let desk = state.mayor;
  if (!desk) return state;
  state = updateCitySeat(state, actor, seat => ({ ...seat, turns: seat.turns + 1 }));
  desk = state.mayor!;
  const start = state.players.findIndex(player => player.id === desk!.firstId);
  const index = (id: string) => (state.players.findIndex(player => player.id === id) - start + state.players.length) % state.players.length;
  if (index(nextId) > index(actor)) return state;

  const round = desk.round + 1;
  const seats = { ...desk.seats };
  for (const player of state.players) {
    const seat = seats[player.id]!;
    const bill = cityTax(seat.rent);
    seats[player.id] = {
      ...seat, rent: 0,
      bills: bill && !player.bankrupt ? [...seat.bills, { round: desk.round, amount: bill, dueTurn: seat.turns + 2, status: "open" }] : seat.bills
    };
  }
  const proposal = desk.proposal;
  const active = state.players.filter(player => !player.bankrupt);
  const switchPolicy = proposal && active.filter(player => proposal.votes.includes(player.id)).length > active.length / 2;
  const policy = proposal && {
    kind: switchPolicy ? (proposal.kind === "loans" ? "transit" : "loans") as CityPolicy : proposal.kind,
    sponsorId: proposal.sponsorId
  };
  const advanced = { ...desk, round, seats, proposal: undefined, policy };
  return { ...state, mayor: round - desk.termStart >= 2 ? newTerm(advanced, nextMayor(state, desk.mayorId)) : advanced };
}

export function projectCityState(state: GameState, seatId?: string): GameState {
  const desk = state.mayor;
  if (!desk) return state;
  const seats: CityDesk["seats"] = {};
  for (const [id, seat] of Object.entries(desk.seats)) {
    seats[id] = id === seatId ? seat : { ...seat, rent: 0, bills: [] };
  }
  const players = state.players.map(player => {
    if (player.id === seatId) return player;
    const unposted = desk.seats[player.id]?.bills.reduce((sum, bill) => sum + (bill.status === "paid" ? bill.amount : 0), 0) ?? 0;
    return unposted ? { ...player, cash: player.cash + unposted } : player;
  });
  return {
    ...state, players,
    eventLog: state.eventLog.filter(event => !event.privateTo || event.privateTo === seatId),
    notice: state.eventLog[0]?.privateTo && state.eventLog[0].privateTo !== seatId ? undefined : state.notice,
    mayor: {
      ...desk, seats, tip: desk.mayorId === seatId ? desk.tip : undefined,
      jackpotUsed: desk.wheel?.prize === 2000 ? undefined : desk.jackpotUsed,
      wheel: desk.wheel ? { ...desk.wheel, prize: undefined } : undefined
    }
  };
}
