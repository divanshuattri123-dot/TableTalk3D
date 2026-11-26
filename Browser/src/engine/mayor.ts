import { classicPosition, colorGroupTiles, getBoard, railroadPositions } from "./board";
import type { AuctionState, ColorGroup, GameState, Player, Tile } from "./types";

export const TRAIN_FARE = 75;
export const LOAN_AMOUNT = 200;
export const LOAN_REPAYMENT = 225;
export const LOAN_CASH_LIMIT = 1000;
export const AUCTION_CREDIT_CASH_LIMIT = 400;
export const AUDIT_FINE = 25;
export const WHEEL_SECTIONS = ["Bank dividend", "Building loan matures", "Doctor’s fee", "Jail release", "Advance to GO", "Lucky Scratch"] as const;

export const CITY_POLICIES = {
  loans: "Emergency Loans",
  transit: "Transit Day",
  wealth: "Cash Reserve Levy",
  credit: "City-Backed Auction",
  "rent-relief": "Rent Relief",
  permits: "Permit Pause"
} as const;
export type CityPolicy = keyof typeof CITY_POLICIES;
export const OFFICE_PROJECTS = ["wealth", "credit", "rent-relief"] as const satisfies readonly CityPolicy[];
export const PERMIT_LOCK_COUNT = 3;
export const MAYOR_MOVE_SPACES = 5;
export type CityContract = "build" | "transit";
export const CITY_CONTRACTS = { build: "Develop a District", transit: "Connect the City" } as const;
export const CITY_CONTRACT_REWARD = 150;
interface CityProject { kind: CityPolicy; sponsorId: string; district?: ColorGroup; used?: true }
export interface TaxBill {
  id?: number;
  round: number;
  amount: number;
  dueTurn: number;
  status: "open" | "deferred" | "paid";
}
interface CitySeat {
  turns: number;
  rent: number;
  taxedRent?: number;
  bills: TaxBill[];
  borrowed?: true;
  loanDue?: number;
  loanAmountDue?: number;
  rentReliefRound?: number;
  completedExpress?: true;
  contract?: CityContract;
  contractPaid?: true;
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
  council?: true;
  speakerUsedTerm?: number;
  reserveLevyUsed?: true;
  proposal?: CityProject & { term: number; votes: string[] };
  policy?: CityProject;
  seats: Record<string, CitySeat>;
  wheel?: WheelDecision;
  wheelResult?: WheelDecision;
  jackpotUsed?: true;
  pendingRoundAdvance?: true;
  office?: { permitPropertyIds?: number[]; rivalMoveTerm?: number; investigationUsed?: true };
}
export type CityAction =
  | { type: "CITY_PAY_TAX" | "CITY_DEFER_TAX"; playerId: string; round: number; billId?: number | null }
  | { type: "CITY_AUDIT"; playerId: string; term: number; targetId: string }
  | { type: "CITY_TIP"; playerId: string; term: number }
  | { type: "CITY_PROPOSE"; playerId: string; term: number; policy: CityPolicy; district?: ColorGroup }
  | { type: "CITY_VOTE"; playerId: string; term: number }
  | { type: "CITY_LOAN"; playerId: string; round: number }
  | { type: "CITY_CONTRACT"; playerId: string; contract: CityContract }
  | { type: "CITY_EXPRESS"; playerId: string }
  | { type: "CITY_LOCK_PERMITS"; playerId: string; term: number; propertyIds: readonly number[] }
  | { type: "CITY_GRANT_LOAN"; playerId: string; term: number; targetId: string }
  | { type: "CITY_MOVE_RIVALS"; playerId: string; term: number }
  | { type: "CITY_SPIN"; playerId: string; wheelId: number; section?: number; prizeRoll?: number }
  | { type: "CITY_SCRATCH" | "CITY_SKIP_WHEEL"; playerId: string; wheelId: number };

export function startCity(players: Player[], firstId: string, mayorOffice?: true): CityDesk {
  return {
    mayorId: firstId, firstId, term: 1, termStart: 1, round: 1, treasury: 400, council: true,
    ...(mayorOffice ? { office: {} } : {}),
    seats: Object.fromEntries(players.map(player => [player.id, { turns: 0, rent: 0, bills: [] }]))
  };
}

export function updateCitySeat(state: GameState, id: string, update: (seat: CitySeat) => CitySeat): GameState {
  const desk = state.mayor;
  const seat = desk?.seats[id];
  if (!desk || !seat) return state;
  return { ...state, mayor: { ...desk, seats: { ...desk.seats, [id]: update(seat) } } };
}

function accrueRentTax(seat: CitySeat, round: number, addedRent: number): CitySeat {
  const prevTax = cityTax(seat.taxedRent ?? 0);
  const rent = seat.rent + addedRent;
  const delta = cityTax(rent) - prevTax;
  if (delta <= 0) return { ...seat, rent, taxedRent: rent };
  const index = seat.bills.findIndex(bill => bill.round === round && bill.status === "open");
  if (index >= 0) {
    const current = seat.bills[index]!;
    const bills = seat.bills.map((bill, i) => i === index ? { ...current, amount: current.amount + delta } : bill);
    return { ...seat, rent, taxedRent: rent, bills };
  }
  // A new bill stays payable even when the player deferred an earlier one this round.
  const bill: TaxBill = { id: seat.rent, round, amount: delta, dueTurn: seat.turns + 2, status: "open" };
  return { ...seat, rent, taxedRent: rent, bills: [...seat.bills, bill] };
}

export const recordRent = (state: GameState, id: string, amount: number) =>
  state.mayor && amount > 0 && !state.players.find(p => p.id === id)?.bankrupt
    ? updateCitySeat(state, id, seat => accrueRentTax(seat, state.mayor!.round, amount))
    : state;

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
  const free = !desk.office && desk.policy?.kind === "transit" && seat?.freeRideRound !== desk.round && desk.treasury >= TRAIN_FARE;
  return { to: stations.find(position => position > player.position) ?? stations[0]!, fare: free ? 0 : TRAIN_FARE };
}

const unpostedTax = (seat?: CitySeat) =>
  seat?.bills.reduce((sum, bill) => sum + (bill.status === "paid" ? bill.amount : 0), 0) ?? 0;

export function cityLoanAvailable(state: GameState, playerId: string) {
  const desk = state.mayor;
  const player = state.players.find(candidate => candidate.id === playerId);
  return cityStable(state) && state.activePlayerId === playerId && !!player && !player.bankrupt &&
    !!desk && !desk.office && player.cash + unpostedTax(desk.seats[playerId]) <= LOAN_CASH_LIMIT && desk.policy?.kind === "loans" &&
    desk.treasury >= LOAN_AMOUNT && !desk.seats[playerId]?.borrowed;
}

export function cityLoanReason(state: GameState, playerId: string): string | undefined {
  const desk = state.mayor;
  const player = state.players.find(candidate => candidate.id === playerId);
  if (!desk || desk.office || desk.policy?.kind !== "loans" || !player || player.bankrupt || cityLoanAvailable(state, playerId)) return;
  if (desk.seats[playerId]?.borrowed) return "You already used your 1 city loan this match.";
  if (desk.treasury < LOAN_AMOUNT) return "City Funds needs at least ₹200 to issue an emergency loan.";
  if (player.cash + unpostedTax(desk.seats[playerId]) > LOAN_CASH_LIMIT) return "Emergency loans are for players with ₹1,000 or less in posted cash.";
  if (state.activePlayerId !== playerId) return "Borrowing opens on your turn (₹200 loan · repay ₹225).";
  return "Finish the current board decision to borrow ₹200.";
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
  return {
    ...desk, mayorId, term: desk.term + 1, termStart: desk.round,
    auditUsed: undefined, tip: undefined, proposalUsed: undefined, proposal: undefined,
    ...(desk.office && mayorId !== desk.mayorId ? { office: {} } : {})
  };
}

export const cityTax = (rent: number) =>
  rent <= 0 ? 0 : Math.min(200, Math.max(1, Math.floor((
    Math.min(200, rent) +
    Math.max(0, Math.min(300, rent) - 200) * 2 +
    Math.max(0, rent - 300) * 4
  ) / 10)));

export function advanceCityRound(state: GameState): GameState {
  const desk = state.mayor;
  if (!desk) return state;
  const round = desk.round + 1;
  const seats = { ...desk.seats };
  for (const player of state.players) {
    const seat = seats[player.id]!;
    const bill = Math.max(0, cityTax(seat.rent) - cityTax(seat.taxedRent ?? 0));
    seats[player.id] = {
      ...seat, rent: 0, taxedRent: undefined,
      bills: bill && !player.bankrupt ? [...seat.bills, { round: desk.round, amount: bill, dueTurn: seat.turns + 2, status: "open" }] : seat.bills
    };
  }
  const active = state.players.filter(player => !player.bankrupt);
  const proposal = active.some(player => player.id === desk.proposal?.sponsorId) ? desk.proposal : undefined;
  const switchPolicy = proposal && active.filter(player => proposal.votes.includes(player.id)).length > active.length / 2;
  let policy: CityProject | undefined;
  if (proposal && (!switchPolicy || proposal.kind === "loans" || proposal.kind === "transit")) {
    policy = {
      kind: switchPolicy ? proposal.kind === "loans" ? "transit" : "loans" : proposal.kind,
      sponsorId: proposal.sponsorId,
      district: proposal.district
    };
  }
  const advanced: CityDesk = { ...desk, round, seats, proposal: undefined, policy, pendingRoundAdvance: undefined };
  return { ...state, mayor: round - desk.termStart >= 2 ? newTerm(advanced, nextMayor(state, desk.mayorId)) : advanced };
}

export function nextCityTurn(state: GameState, actor: string, nextId: string): GameState {
  let desk = state.mayor;
  if (!desk) return state;
  state = updateCitySeat(state, actor, seat => ({ ...seat, turns: seat.turns + 1 }));
  desk = state.mayor!;
  const start = state.players.findIndex(player => player.id === desk!.firstId);
  const index = (id: string) => (state.players.findIndex(player => player.id === id) - start + state.players.length) % state.players.length;
  if (index(nextId) > index(actor)) return state;
  if (state.bankAuctionQueue?.length) {
    return { ...state, mayor: { ...desk, pendingRoundAdvance: true } };
  }
  return advanceCityRound(state);
}

export function councilSpeaker(state: GameState) {
  const desk = state.mayor;
  if (!desk?.council || state.players.filter(player => !player.bankrupt).length < 3) return;
  return nextMayor(state, desk.mayorId);
}

export function canChallengeCityProject(state: GameState, playerId: string) {
  const desk = state.mayor;
  const proposal = desk?.proposal;
  if (!desk || !proposal || !state.players.some(p => p.id === playerId && !p.bankrupt) ||
      state.players.filter(p => !p.bankrupt).length < 3 || proposal.sponsorId === playerId || proposal.votes.includes(playerId)) return false;
  return proposal.votes.length > 0 || !desk.voteUsed ||
    (desk.speakerUsedTerm !== desk.term && councilSpeaker(state) === playerId);
}

export function reserveLevy(state: GameState) {
  const solvent = state.players.filter(player => !player.bankrupt).map(player => ({
    id: player.id, cash: Math.max(0, player.cash + unpostedTax(state.mayor?.seats[player.id]))
  }));
  const totalCash = solvent.reduce((sum, player) => sum + player.cash, 0);
  const assessed = solvent.find(player => player.cash >= 2000 && player.cash * 2 > totalCash);
  if (!assessed) return;
  return { playerId: assessed.id, amount: Math.min(300, Math.floor((assessed.cash - 1500) / 5)) };
}

export function districtName(state: GameState, district: ColorGroup) {
  const sample = getBoard(state.boardSize, state.city).filter(tile => tile.kind === "property" && tile.group === district);
  const colour = district.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return sample[0] ? `${sample[0].name} · ${colour}` : colour;
}

export function cityPolicyAvailable(state: GameState, kind: CityPolicy, district?: ColorGroup) {
  const desk = state.mayor;
  if (!desk || typeof kind !== "string" || !Object.prototype.hasOwnProperty.call(CITY_POLICIES, kind)) return false;
  if (desk.office && !OFFICE_PROJECTS.some(project => project === kind)) return false;
  if (kind === "loans" || kind === "transit") return district === undefined;
  if (!desk.council) return false;
  if (kind === "rent-relief" || kind === "permits") {
    return colorGroupTiles(district!, state.boardSize).length > 0;
  }
  if (district !== undefined) return false;
  return kind === "wealth" ? (!!desk.office || !desk.reserveLevyUsed) && !!reserveLevy(state) : desk.treasury > 0;
}

export function rentRelief(state: GameState, playerId: string, tile: Tile, rent: number) {
  const desk = state.mayor;
  if (tile.kind !== "property" || desk?.policy?.kind !== "rent-relief" || desk.policy.district !== tile.group ||
    desk.seats[playerId]?.rentReliefRound === desk.round) return 0;
  return Math.min(250, Math.floor(rent / 2));
}

export const propertyPermitLocked = (state: GameState, propertyId: number) =>
  state.mayor?.office?.permitPropertyIds?.includes(propertyId) === true;

export function mayorCanGrantLoan(state: GameState, targetId: string) {
  const desk = state.mayor;
  return !!desk?.office && cityStable(state) && desk.treasury >= LOAN_AMOUNT &&
    state.players.some(player => player.id === targetId && !player.bankrupt && player.cash >= 0) &&
    !!desk.seats[targetId] && desk.seats[targetId].loanDue === undefined;
}

export const permitPaused = (state: GameState, district: ColorGroup) =>
  state.mayor?.policy?.kind === "permits" && state.mayor.policy.district === district;

export function cityAuctionBacking(state: GameState) {
  const desk = state.mayor, auction = state.auction;
  if (!desk || !auction || auction.kind === "house" || auction.kind === "hotel" ||
      desk.policy?.kind !== "credit" || desk.policy.used || desk.treasury <= 0) return;
  const limit = Math.min(desk.treasury, LOAN_AMOUNT);
  const playerIds = state.players.filter(player => auction.eligiblePlayerIds.includes(player.id) &&
    !player.bankrupt && player.cash >= 0 && player.cash + unpostedTax(desk.seats[player.id]) <= AUCTION_CREDIT_CASH_LIMIT &&
    (desk.office ? desk.seats[player.id]?.loanDue === undefined : !desk.seats[player.id]?.borrowed)).map(p => p.id);
  if (playerIds.length) return { limit, playerIds };
}

export function auctionCredit(auction: AuctionState, playerId: string) {
  return auction.cityBacking?.playerIds.includes(playerId) ? auction.cityBacking.limit : 0;
}

export const cityLoanTotal = (principal: number) => Math.ceil(principal * 9 / 8);

export function cityContractReady(state: GameState, playerId: string, contract: CityContract) {
  const asset = (position: number) => {
    const deed = state.properties[position];
    return deed?.ownerId === playerId && !deed.mortgaged ? deed : undefined;
  };
  if (contract === "transit") {
    return (!!state.mayor?.office || !!state.mayor?.seats[playerId]?.completedExpress) &&
      railroadPositions(state.boardSize).filter(position => asset(position)).length >= 2;
  }
  const groups = new Map<ColorGroup, number[]>();
  for (const tile of getBoard(state.boardSize)) {
    if (tile.kind !== "property") continue;
    const levels = groups.get(tile.group) ?? [];
    levels.push(asset(tile.position)?.houses ?? -1);
    groups.set(tile.group, levels);
  }
  return [...groups.values()].some(levels => levels.every(level => level >= 0) && levels.reduce((sum, level) => sum + level, 0) >= 4);
}

export function projectCityState(state: GameState, seatId?: string): GameState {
  const desk = state.mayor;
  if (!desk) return state;
  const seats: CityDesk["seats"] = {};
  for (const [id, seat] of Object.entries(desk.seats)) {
    seats[id] = id === seatId ? seat : { ...seat, rent: 0, taxedRent: undefined, bills: [], contract: seat.contractPaid ? seat.contract : undefined };
  }
  const players = state.players.map(player => {
    if (player.id === seatId) return player;
    const unposted = unpostedTax(desk.seats[player.id]);
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
