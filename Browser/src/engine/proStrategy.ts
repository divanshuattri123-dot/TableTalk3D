import { colorGroupTiles, getBoard, getPurchasableTile, isPurchasableTile } from "./board";
import { classicSpendableCash } from "./classic";
import { cityLoanBalance, cityPublicCash, permitPaused, propertyPermitLocked, rentRelief } from "./mayor";
import { calculateRent } from "./reducer";
import { usesClassicRules } from "./rules";
import type { GameState, Player, PurchasableTile } from "./types";

export interface ProStrategy {
  openingReserve: number;
  developedReserve: number;
  riskWeight: number;
  developmentWeight: number;
  denialWeight: number;
  financeBuilds?: boolean;
  taxReserveWeight?: number;
  investmentOnly?: boolean;
  reserveBlend?: number;
  thirdHouseBridgeOnly?: boolean;
}

// The training harness uses the current rules engine, including bankruptcy and City Hall.
export const TRAINED_PRO: ProStrategy = {
  openingReserve: 35,
  developedReserve: 140,
  riskWeight: 1.05,
  developmentWeight: 1.32,
  denialWeight: 1.03,
  financeBuilds: true,
  taxReserveWeight: 0.45
};

export const TRAINED_MAYOR_PRO: ProStrategy = {
  ...TRAINED_PRO,
  investmentOnly: true,
  reserveBlend: 0,
  thirdHouseBridgeOnly: true,
  taxReserveWeight: undefined
};

const rollWeights = [0, 0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1];
const twoRollWeights = Array<number>(25).fill(0);
for (let a = 2; a <= 12; a++) {
  for (let b = 2; b <= 12; b++) twoRollWeights[a + b]! += rollWeights[a]! * rollWeights[b]!;
}

const cash = (state: GameState, player: Player) => usesClassicRules(state)
  ? classicSpendableCash(state, player.id) : player.cash;

export function proRisk(state: GameState, player: Player, position = player.position) {
  const board = getBoard(state.boardSize);
  let expected = 0, worst = 0, chanceToBuy = 0;
  for (let roll = 2; roll <= 12; roll++) {
    const dest = (position + roll) % state.boardSize;
    const tile = board[dest]!, owner = state.properties[dest]?.ownerId;
    const chance = rollWeights[roll]! / 36;
    const rent = owner && owner !== player.id ? calculateRent(state, dest, roll) : 0;
    const cost = tile.kind === "tax" ? tile.amount : rent - rentRelief(state, player.id, tile, rent);
    expected += chance * cost;
    if (chance >= 2 / 36) worst = Math.max(worst, cost);
    if (isPurchasableTile(tile) && !owner) chanceToBuy += chance;
  }
  return { expected, worst, chanceToBuy };
}

export function strategicReserve(state: GameState, player: Player, strategy: ProStrategy) {
  const developed = Object.values(state.properties).some(deed => deed.ownerId && deed.ownerId !== player.id && deed.houses >= 2);
  const account = state.mayor?.seats[player.id];
  const loanDue = account?.loanDue !== undefined && account.loanDue <= account.turns + 1
    ? cityLoanBalance(state, player.id) : 0;
  const taxDue = account?.bills.reduce((sum, bill) =>
    sum + (bill.dueTurn <= account.turns + 1 && bill.status !== "paid" ? bill.amount : 0), 0) ?? 0;
  const claim = state.rentClaim?.payerId === player.id ? state.rentClaim.amount : 0;
  const hazard = proRisk(state, player);
  const floor = developed ? strategy.developedReserve : strategy.openingReserve;
  // A rare hotel matters more than ordinary rent once a rival can eliminate us in a single roll.
  const buffer = Math.min(650, hazard.expected * 1.8 + Math.max(0, hazard.worst - 120) * 0.22);
  return Math.ceil(floor + buffer * strategy.riskWeight + loanDue + taxDue + claim);
}

function traffic(state: GameState, ownerId: string, position: number) {
  return state.players.reduce((sum, rival) => {
    if (rival.id === ownerId || rival.bankrupt) return sum;
    const distance = (position - rival.position + state.boardSize) % state.boardSize;
    const first = (rollWeights[distance] ?? 0) / 36;
    const second = (twoRollWeights[distance] ?? 0) / 1296;
    return sum + 0.047 + (first * 0.85 + second * 0.55) * (rival.inJail ? 0.35 : 1);
  }, 0);
}

export function completesDistrict(state: GameState, tile: PurchasableTile, id: string) {
  return tile.kind === "property" && colorGroupTiles(tile.group, state.boardSize)
    .every(member => member.position === tile.position || state.properties[member.position]?.ownerId === id);
}

export function propertyCeiling(state: GameState, player: Player, tile: PurchasableTile, strategy: ProStrategy) {
  const board = getBoard(state.boardSize);
  if (tile.kind === "railroad") {
    const count = board.filter(member => member.kind === "railroad" && member.position !== tile.position &&
      state.properties[member.position]?.ownerId === player.id).length;
    return tile.price * [1.04, 1.2, 1.46, 1.68][Math.min(3, count)]!;
  }
  if (tile.kind === "utility") {
    const other = board.some(member => member.kind === "utility" && member.position !== tile.position &&
      state.properties[member.position]?.ownerId === player.id);
    return tile.price * (other ? 1.43 : 0.96);
  }
  const neighbors = colorGroupTiles(tile.group, state.boardSize).filter(member => member.position !== tile.position);
  const mine = neighbors.filter(member => state.properties[member.position]?.ownerId === player.id).length;
  const available = neighbors.filter(member => !state.properties[member.position]?.ownerId).length;
  const owner = state.properties[neighbors[0]!.position]?.ownerId;
  const rival = state.players.find(p => p.id === owner && p.id !== player.id && !p.bankrupt);
  const canBlock = rival && neighbors.every(member => state.properties[member.position]?.ownerId === rival.id);
  const rentPotential = tile.rent[3] / (tile.houseCost * 3);
  const complete = mine === neighbors.length;
  const blocked = propertyPermitLocked(state, tile.position) || permitPaused(state, tile.group, player.id);
  const reach = traffic(state, player.id, tile.position);
  const development = blocked ? 0.35 : Math.min(1, Math.max(0.35, cash(state, player) / (tile.houseCost * 4)));
  const setPremium = complete ? 0.58 + 0.8 * rentPotential * development * strategy.developmentWeight
    : mine * 0.21 + (available + mine === neighbors.length ? 0.1 : 0);
  const denial = canBlock ? strategy.denialWeight * (0.16 + Math.min(0.6, Math.max(0, cityPublicCash(state,rival)) / 2300) * rentPotential) : 0;
  return tile.price * (0.94 + setPremium + denial + Math.min(0.35, reach * 0.35));
}

export function buildingPriority(state: GameState, player: Player, tile: PurchasableTile, strategy: ProStrategy) {
  if (tile.kind !== "property" || !completesDistrict(state, tile, player.id)) return -Infinity;
  const deed = state.properties[tile.position];
  if (!deed || deed.houses === 5 || propertyPermitLocked(state, tile.position) || permitPaused(state, tile.group, player.id)) return -Infinity;
  const members = colorGroupTiles(tile.group, state.boardSize);
  if (members.some(member => state.properties[member.position]?.mortgaged || (state.properties[member.position]?.houses ?? 0) < deed.houses)) return -Infinity;
  const before = tile.rent[deed.houses] * (deed.houses ? 1 : 2);
  const immediate = tile.rent[deed.houses + 1]! - before;
  const towardThree = deed.houses < 2
    ? (tile.rent[3] - tile.rent[deed.houses + 1]!) / (3 - deed.houses) * 0.34 : 0;
  const nextStock = deed.houses === 4 ? state.bankHotels : state.bankHouses;
  if (nextStock <= 0) return -Infinity;
  const rivalCanBuild = state.bankHouses <= 6 && deed.houses === 4 && state.players.some(rival =>
    rival.id !== player.id && !rival.bankrupt && cityPublicCash(state, rival) >= 250 &&
    getBoard(state.boardSize).some(member => member.kind === "property" && state.properties[member.position]?.ownerId === rival.id &&
      !state.properties[member.position]?.mortgaged && completesDistrict(state, member, rival.id)));
  const scarcity = rivalCanBuild ? 0.38 : deed.houses < 4 && state.bankHouses <= 8 ? 1.25 : 1;
  return (immediate + towardThree) * traffic(state, player.id, tile.position) / tile.houseCost * strategy.developmentWeight * scarcity;
}

export function mortgagePriority(state: GameState, player: Player, tile: PurchasableTile) {
  const district = completesDistrict(state, tile, player.id);
  const simulated = { ...state, properties: { ...state.properties,
    [tile.position]: { ...state.properties[tile.position]!, mortgaged: false } } };
  const rent = calculateRent(simulated, tile.position, 7);
  const cost = tile.mortgageValue + Math.ceil(tile.mortgageValue / 10);
  const finalMortgage = tile.kind === "property" && district && colorGroupTiles(tile.group, state.boardSize)
    .every(member => member.position === tile.position || !state.properties[member.position]?.mortgaged);
  return (rent * traffic(state, player.id, tile.position) + (finalMortgage ? cost * 0.7 : 0)) / cost;
}