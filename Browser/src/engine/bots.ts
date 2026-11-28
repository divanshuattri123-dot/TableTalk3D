import { usesClassicRules, usesCityDecrees } from "./rules";
import {colorGroupTiles,getBoard,getPurchasableTile,isPurchasableTile} from './board';
import {classicSpendableCash} from './classic';
import {calculateRent,canTradeProperty,decisionPlayerId,reduceGame} from './reducer';
import {DUEL_VETO_COST,auctionCredit,canChallengeCityProject,cityLoanAvailable,cityLoanBalance,cityPolicyAvailable,cityPublicCash,citySeizedOwner,cityStable,propertyPermitLocked,LOAN_AMOUNT,MAYOR_MOVE_SPACES,mayorCanGrantLoan,mayorCanReleaseJail,PERMIT_LOCK_COUNT,nextAuditFine,nextAuditMiss,projectCityState,RENT_RELIEF_PERCENT,rentRelief,reserveLevy,trainOffer} from './mayor';
import type {BotTradeNote,ColorGroup,Dice,GameAction,GameState,Player,TradeOffer} from './types';
import { buildingPriority, completesDistrict, mortgagePriority, proRisk, propertyCeiling, strategicReserve, TRAINED_MAYOR_PRO, TRAINED_PRO } from "./proStrategy";
import type { ProStrategy } from "./proStrategy";

const STYLES=[
  {name:'Balanced',reserve:150,bid:1.1,buildReserve:250,trade:1.35},
  {name:'Deal maker',reserve:120,bid:1.15,buildReserve:220,trade:1.55},
  {name:'Builder',reserve:180,bid:1.05,buildReserve:180,trade:1.4},
  {name:'Bold bidder',reserve:80,bid:1.4,buildReserve:200,trade:1.5},
  {name:'Cautious',reserve:280,bid:0.95,buildReserve:350,trade:1.2},
  {name:'Opportunist',reserve:140,bid:1.2,buildReserve:230,trade:1.3}
] as const;
const PRO={name:'Pro',reserve:150,bid:1.12,buildReserve:175,trade:1.4} as const;
export const botStyle=(p:Player)=>p.botLevel==='pro'?PRO:STYLES[Math.max(0,Number(p.id.replace('ai-',''))-1)%STYLES.length]??STYLES[0];
const spendable=(s:GameState,p:Player)=>usesClassicRules(s)?classicSpendableCash(s,p.id):p.cash;
const deeds=(s:GameState,p:Player)=>getBoard(s.boardSize).filter(isPurchasableTile).filter(t=>s.properties[t.position]?.ownerId===p.id);
const portfolio=(s:GameState,id:string)=>getBoard(s.boardSize).filter(isPurchasableTile).reduce((value,t)=>{
  const d=s.properties[t.position];if(d?.ownerId!==id)return value;
  const complete=t.kind==='property'&&colorGroupTiles(t.group,s.boardSize).every(m=>s.properties[m.position]?.ownerId===id);
  return value+t.price*(complete?1.7:1)-(d.mortgaged?t.mortgageValue:0);
},0);

function upcomingRent(s:GameState,p:Player,offset=0) {
  const costs: number[]=[];
  const board=getBoard(s.boardSize);
  for(let a=1;a<=6;a++)for(let b=1;b<=6;b++){
    const position=(p.position+offset+a+b)%s.boardSize;
    const tile=board[position]!;
    const owner=s.properties[position]?.ownerId;
    costs.push(owner && owner!==p.id?calculateRent(s,position,a+b):tile.kind==='tax'?tile.amount:0);
  }
  costs.sort((a,b)=>a-b);
  return costs[28]??0;
}

function landingPressure(s: GameState, id: string, position: number) {
  let pressure = 0;
  for (const rival of s.players) {
    if (rival.id === id || rival.bankrupt || rival.inJail) continue;
    const distance = (position - rival.position + s.boardSize) % s.boardSize;
    if (distance >= 2 && distance <= 12) pressure += (6 - Math.abs(7 - distance)) / 36;
  }
  return pressure;
}

function buildReturn(s: GameState, p: Player, propertyId: number) {
  const tile = getPurchasableTile(propertyId, s.boardSize);
  const deed = s.properties[propertyId];
  if (tile?.kind !== "property" || !deed || deed.houses >= 5) return 0;
  const rentGain = tile.rent[deed.houses + 1]! - tile.rent[deed.houses]! * (deed.houses ? 1 : 2);
  return rentGain * (0.15 + landingPressure(s, p.id, propertyId)) / tile.houseCost;
}

function proReserve(s:GameState,p:Player) {
  const account=s.mayor?.seats[p.id];
  const due=account?.loanDue!==undefined && account.loanDue<=account.turns+1 ? cityLoanBalance(s,p.id) : 0;
  const claim = s.rentClaim?.payerId === p.id ? s.rentClaim.amount : 0;
  const taxes = account?.bills.reduce((sum, bill) =>
    sum + (bill.dueTurn <= account.turns + 1 && bill.status !== "paid" ? bill.amount : 0), 0) ?? 0;
  const risk = upcomingRent(s,p);
  return Math.min(550, Math.max(PRO.reserve, risk)) + due + claim + taxes;
}

function proDeedValue(s:GameState,p:Player,position:number) {
  const tile=getPurchasableTile(position,s.boardSize);
  if(!tile)return 0;
  if(tile.kind==='railroad'){
    const connected=deeds(s,p).filter(deed=>deed.kind==='railroad').length;
    return tile.price*(1.05+connected*.18);
  }
  if (tile.kind === "utility") {
    return tile.price * (deeds(s, p).some(deed => deed.kind === "utility") ? 1.5 : 1.05);
  }
  const pressure = Math.min(1, landingPressure(s, p.id, position));
  const other=colorGroupTiles(tile.group,s.boardSize).filter(deed=>deed.position!==position);
  const owners=other.map(deed=>s.properties[deed.position]?.ownerId);
  const mine=owners.filter(id=>id===p.id).length;
  if(mine===other.length)return tile.price*(2.1+pressure*.25);
  const rival=owners[0];
  if(rival && rival!==p.id && owners.every(id=>id===rival))return tile.price*1.55;
  return tile.price*(1.12+mine*.2+pressure*.2);
}

function tradeDelta(s:GameState,t:TradeOffer,p:Player) {
  const properties={...s.properties};
  for(const id of t.offeredPropertyIds)properties[id]={...properties[id]!,ownerId:t.toPlayerId};
  for(const id of t.requestedPropertyIds)properties[id]={...properties[id]!,ownerId:t.fromPlayerId};
  return t.offeredCash-t.requestedCash+portfolio({...s,properties},p.id)-portfolio(s,p.id)+25*((t.offeredJailCards?.length??0)-(t.requestedJailCards?.length??0));
}

type TradeTerms = Pick<TradeOffer, "offeredCash" | "requestedCash" | "offeredPropertyIds" | "requestedPropertyIds" | "offeredJailCards" | "requestedJailCards">;

function strategicPortfolio(s: GameState, p: Player) {
  const groups = new Set<ColorGroup>();
  let value = 0, stations = 0, utilities = 0;
  for (const tile of deeds(s, p)) {
    const deed = s.properties[tile.position]!;
    value += tile.price - (deed.mortgaged ? Math.ceil(tile.mortgageValue * 1.1) : 0);
    if (tile.kind === "railroad") stations++;
    else if (tile.kind === "utility") utilities++;
    else {
      groups.add(tile.group);
      value += deed.houses * tile.houseCost * 0.6;
    }
  }
  for (const group of groups) {
    const district = colorGroupTiles(group, s.boardSize);
    const owned = district.filter(tile => s.properties[tile.position]?.ownerId === p.id);
    if (owned.length === 1 && district.length > 2) continue;
    const complete = owned.length === district.length;
    for (const tile of owned) {
      if (s.properties[tile.position]?.mortgaged) continue;
      const buildable = !propertyPermitLocked(s, tile.position);
      const development = buildable ? Math.min(1, Math.max(0.3, p.cash / (tile.houseCost * 3))) : 0.22;
      value += complete ? tile.price * 0.22 + tile.rent[3] * development * 0.48 : tile.price * 0.1;
    }
  }
  return value + [0, 0, 40, 110, 240][Math.min(stations, 4)]! + (utilities >= 2 ? 95 : 0);
}

function bargainingTable(s: GameState, p: Player, other: Player) {
  const myAssets = strategicPortfolio(s, p), theirAssets = strategicPortfolio(s, other);
  const reserve = Math.min(proReserve(s, p), Math.max(80, spendable(s, p) * 0.6));
  const theirReserve = Math.max(50, Math.min(200, spendable(s, other) * 0.15));
  return {
    reserve,
    theirReserve,
    evaluate(terms: TradeTerms) {
      const properties = { ...s.properties };
      for (const id of terms.offeredPropertyIds) properties[id] = { ...properties[id]!, ownerId: other.id };
      for (const id of terms.requestedPropertyIds) properties[id] = { ...properties[id]!, ownerId: p.id };
      const table = { ...s, properties };
      const cash = terms.requestedCash - terms.offeredCash;
      const cards = (terms.requestedJailCards?.length ?? 0) - (terms.offeredJailCards?.length ?? 0);
      const myGain = strategicPortfolio(table, p) - myAssets;
      const theirGain = strategicPortfolio(table, other) - theirAssets;
      const setGiven = terms.offeredPropertyIds.some(id => {
        const tile = getPurchasableTile(id, s.boardSize);
        return tile?.kind === "property" && colorGroupTiles(tile.group, s.boardSize)
          .every(t => properties[t.position]?.ownerId === other.id);
      });
      // Charge for creating an opponent who can develop immediately, especially in a duel.
      const threat = setGiven ? 0.42 + (s.players.filter(player => !player.bankrupt).length === 2 ? 0.18 : 0) : 0;
      const value = myGain + cash + 35 * cards - Math.max(0, theirGain) * threat;
      return { value, otherValue: theirGain - cash - 35 * cards, setGiven };
    }
  };
}

function proTradeResponse(s: GameState, p: Player, t: TradeOffer, legal: (action: GameAction) => boolean): GameAction {
  const accept = { type: "TRADE_ACCEPT", playerId: p.id, offerId: t.id } as const;
  const decline = { type: "TRADE_DECLINE", playerId: p.id, offerId: t.id } as const;
  const other = s.players.find(player => player.id === t.fromPlayerId && !player.bankrupt);
  if (!other) return decline;
  const round = t.counterRound ?? (t.counterOfId ? 1 : 0);
  const table = bargainingTable(s, p, other);
  const current: TradeTerms = {
    offeredCash: t.requestedCash, requestedCash: t.offeredCash,
    offeredPropertyIds: t.requestedPropertyIds, requestedPropertyIds: t.offeredPropertyIds,
    offeredJailCards: t.requestedJailCards, requestedJailCards: t.offeredJailCards
  };
  const roomToSpend = Math.max(0, spendable(s, p) - table.reserve);
  const incoming = table.evaluate(current);
  if (incoming.value >= 0 && current.offeredCash - current.requestedCash <= roomToSpend && legal(accept)) return accept;
  if (round >= (other.bot ? 2 : 4)) return decline;

  const otherBudget = Math.max(t.offeredCash, Math.floor(spendable(s, other) - table.theirReserve));
  const alternatives = [current, ...deeds(s, other).filter(tile =>
    !current.requestedPropertyIds.includes(tile.position) && canTradeProperty(s, tile.position, other.id)
  ).sort((a, b) => proDeedValue(s, p, b.position) - proDeedValue(s, p, a.position)).slice(0, 4).map(tile =>
    ({ ...current, requestedPropertyIds: [...current.requestedPropertyIds, tile.position] }))];
  const counters = alternatives.flatMap((terms, index) => {
    const assessment = table.evaluate(terms);
    const startingCash = terms.requestedCash - terms.offeredCash;
    const minimum = Math.max(0, 20 - round * 7);
    const net = Math.max(-Math.floor(roomToSpend), Math.ceil((startingCash + minimum - assessment.value) / 5) * 5);
    if (net > otherBudget) return [];
    const adjusted = { ...terms, offeredCash: Math.max(0, -net), requestedCash: Math.max(0, net) };
    const otherValue = assessment.otherValue + startingCash - net;
    if (assessment.value + net - startingCash < 0 || otherValue < (incoming.setGiven ? -5 : -30)) return [];
    const botNote: BotTradeNote = index > 0 ? "swap" : round > 0 ? "concession" : incoming.setGiven ? "set-premium" : "cash-reserve";
    const action: GameAction = { ...adjusted, type: "TRADE_COUNTER", playerId: p.id, previousOfferId: t.id,
      offerId: "ai-counter-" + s.nextEventId, botNote };
    return [{ action, score: otherValue - index * 12 }];
  });
  return counters.sort((a, b) => b.score - a.score).find(candidate => legal(candidate.action))?.action ?? decline;
}

function proTradeOffer(s: GameState, p: Player, legal: (action: GameAction) => boolean): GameAction | undefined {
  const cash = spendable(s, p);
  const board = getBoard(s.boardSize);
  const targets = board.filter(isPurchasableTile).flatMap(tile => {
    const other = s.players.find(player => player.id === s.properties[tile.position]?.ownerId && !player.bankrupt);
    if (!other || other.id === p.id || !canTradeProperty(s, tile.position, other.id)) return [];
    if (p.botTradeRebuff?.partnerId === other.id && s.nextEventId - p.botTradeRebuff.eventId < 26) return [];
    const isTarget = tile.kind === "property"
      ? colorGroupTiles(tile.group, s.boardSize).every(t => t.position === tile.position || s.properties[t.position]?.ownerId === p.id)
      : deeds(s, p).some(t => t.kind === tile.kind);
    return isTarget ? [{ tile, other }] : [];
  }).sort((a, b) => proDeedValue(s,p,b.tile.position) - proDeedValue(s,p,a.tile.position)).slice(0, 6);
  const offers = targets.flatMap(({ tile, other }) => {
    const table = bargainingTable(s, p, other);
    const credits = deeds(s, p).filter(offer => canTradeProperty(s, offer.position, p.id)).sort((a, b) =>
      proDeedValue(s, other, b.position) - proDeedValue(s, other, a.position)).slice(0, 5);
    return [[], ...credits.map(deed => [deed.position])].flatMap(offeredPropertyIds => {
      const terms: TradeTerms = { offeredCash: 0, requestedCash: 0, offeredPropertyIds, requestedPropertyIds: [tile.position] };
      const initial = table.evaluate(terms);
      const net = Math.max(-Math.floor(Math.max(0, cash - table.reserve)), Math.floor((initial.otherValue - 12) / 5) * 5);
      if (net > Math.max(0, spendable(s, other) - table.theirReserve)) return [];
      const adjusted = { ...terms, offeredCash: Math.max(0, -net), requestedCash: Math.max(0, net) };
      const value = initial.value + net, otherValue = initial.otherValue - net;
      if (value < 20 || otherValue < 0) return [];
      const action: GameAction = { ...adjusted, type: "TRADE_OFFER", playerId: p.id, offerId: "ai-offer-" + s.nextEventId,
        toPlayerId: other.id, botNote: offeredPropertyIds.length ? "swap" : "purchase" };
      return [{ action, score: value + Math.min(50, otherValue) * 0.25 }];
    });
  });
  return offers.sort((a, b) => b.score - a.score).find(candidate => legal(candidate.action))?.action;
}

function expectedLanding(s: GameState, position: number, value: (destination: number, total: number) => number) {
  let result = 0;
  for (let total = 2; total <= 12; total++) {
    result += value((position + total) % s.boardSize, total) * (6 - Math.abs(7 - total));
  }
  return result / 36;
}

function civicRisk(s: GameState, player: Player, position = player.position) {
  return expectedLanding(s, position, (destination, roll) => {
    const tile = getBoard(s.boardSize)[destination]!;
    if (tile.kind === "tax") return tile.amount;
    if (!s.properties[destination]?.ownerId || s.properties[destination]?.ownerId === player.id) return 0;
    const amount = calculateRent(s, destination, roll);
    return amount - rentRelief(s, player.id, tile, amount);
  });
}

function districtSwing(s: GameState, p: Player, district: ColorGroup) {
  let benefit = 0;
  for (const player of s.players) {
    if (player.bankrupt || player.inJail) continue;
    benefit += expectedLanding(s, player.position, (position, total) => {
      const tile = getBoard(s.boardSize)[position]!;
      const owner = s.properties[position]?.ownerId;
      if (tile.kind !== "property" || tile.group !== district || !owner || owner === player.id) return 0;
      const rent = calculateRent(s, position, total);
      const saving = rent * RENT_RELIEF_PERCENT / 100;
      if (player.id === p.id) return saving * (rent > p.cash ? 1.7 : 1);
      if (owner === p.id) return -saving;
      return -saving * 0.14;
    });
  }
  return benefit;
}

function proMayorProject(s: GameState, mayor: Player, term: number, legal: (action: GameAction) => boolean) {
  const desk = s.mayor!;
  const action = (policy: "rent-relief" | "wealth" | "credit", district?: ColorGroup) =>
    ({ type: "CITY_PROPOSE", playerId: mayor.id, term, policy, district } as const);
  const projects: { action: GameAction; score: number }[] = [];
  const levy = reserveLevy(s);
  if (levy && levy.playerId !== mayor.id && cityPolicyAvailable(s, "wealth")) {
    projects.push({ action: action("wealth"), score: levy.amount * 0.48 });
  }
  if (s.phase === "awaitingRoll" && !mayor.inJail) {
    const groups = new Set(getBoard(s.boardSize).flatMap(tile => tile.kind === "property" ? [tile.group] : []));
    for (const district of groups) {
      if (!cityPolicyAvailable(s, "rent-relief", district)) continue;
      if (desk.policy?.kind === "rent-relief" && desk.policy.district === district) continue;
      const prior = desk.policy?.kind === "rent-relief" && desk.policy.district ? Math.max(0, districtSwing(s, mayor, desk.policy.district)) : 0;
      projects.push({ action: action("rent-relief", district), score: districtSwing(s, mayor, district) - prior });
    }
  }
  if (mayor.cash < 400 && cityLoanBalance(s, mayor.id) === 0 && desk.policy?.kind !== "credit" && cityPolicyAvailable(s, "credit")) {
    const chanceOfAuction = expectedLanding(s, mayor.position, destination =>
      getPurchasableTile(destination, s.boardSize) && !s.properties[destination]?.ownerId ? 1 : 0);
    projects.push({ action: action("credit"), score: chanceOfAuction * Math.min(105, desk.treasury / 2) });
  }
  return projects.sort((a, b) => b.score - a.score).find(project => project.score >= 22 && legal(project.action))?.action;
}

function moveRivalsAdvantage(s: GameState, mayor: Player) {
  return s.players.reduce((total, rival) => {
    if (rival.bankrupt || rival.id === mayor.id) return total;
    const impactAt = (start: number) => expectedLanding(s, start, (destination, roll) => {
      const owner = s.properties[destination]?.ownerId;
      if (!owner || owner === rival.id) return 0;
      const tile = getBoard(s.boardSize)[destination]!;
      const rent = calculateRent(s, destination, roll);
      const effective = rent - rentRelief(s, rival.id, tile, rent);
      return owner === mayor.id ? effective : -effective * 0.12;
    });
    const moved = rival.position + MAYOR_MOVE_SPACES;
    return total + impactAt(moved % s.boardSize) - impactAt(rival.position)
      - (moved >= s.boardSize ? 110 : 0) - (rival.inJail ? 40 : 0);
  }, 0);
}

function proAudit(s: GameState, mayor: Player, legal: (action: GameAction) => boolean): GameAction | undefined {
  const desk = s.mayor!;
  const visible = projectCityState(s, mayor.id);
  const rivals = visible.players.filter(player => !player.bankrupt && player.id !== mayor.id);
  const miss = desk.higherTax ? nextAuditMiss(desk.seats[mayor.id]).fine : 25;
  const suspects = rivals.filter(player => desk.tip?.includes(player.id));
  if (!desk.tip && !desk.office?.investigationUsed && s.phase === "awaitingEndTurn" && mayor.cash > miss + 70) {
    const investigate = { type: "CITY_TIP", playerId: mayor.id, term: desk.term } as const;
    if (legal(investigate)) return investigate;
  }
  const ranked = suspects.map(rival => {
    const pastCatches = desk.seats[rival.id]?.caughtCount ?? 0;
    return { rival, score: Math.min(3, pastCatches) * 20 + Math.min(50, nextAuditFine(desk.seats[rival.id]) / 2)
      + Math.max(0, 350 - rival.cash) / 8 + deeds(visible, rival).length * 3 };
  }).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (best && (suspects.length === 1 || mayor.cash >= miss + Math.max(125, civicRisk(s, mayor)) && best.score >= miss * 0.6)) {
    const audit = { type: "CITY_AUDIT", playerId: mayor.id, term: desk.term, targetId: best.rival.id } as const;
    if (legal(audit)) return audit;
  }
}

function shouldHoldJail(s: GameState, p: Player, strategy: ProStrategy) {
  const next = proRisk(s,p,s.boardSize / 4);
  return next.expected * strategy.riskWeight > Math.max(65, spendable(s,p) * 0.13) ||
    next.chanceToBuy < 0.18 && next.worst > Math.max(180, spendable(s,p) * 0.50);
}

function strategicPermits(s: GameState, mayor: Player) {
  const rivals = new Map(s.players.filter(p=>!p.bankrupt && p.id!==mayor.id).map(p=>[p.id,p]));
  return getBoard(s.boardSize).flatMap(tile=>{
    const deed = s.properties[tile.position];
    const rival = deed?.ownerId ? rivals.get(deed.ownerId) : undefined;
    if (tile.kind !== "property" || !deed || !rival || deed.houses >= 4 || deed.mortgaged || cityPublicCash(s,rival) < tile.houseCost * 1.5) return [];
    const district = colorGroupTiles(tile.group,s.boardSize);
    const count = district.filter(member=>s.properties[member.position]?.ownerId===rival.id).length;
    const soon = count === district.length ? 1 : count >= 2 ? 0.24 : 0;
    const score = soon * (tile.rent[3] - tile.rent[deed.houses]) / tile.houseCost;
    return score ? [{ position: tile.position, score }] : [];
  }).sort((a,b)=>b.score-a.score).slice(0,PERMIT_LOCK_COUNT).map(target=>target.position);
}

function developmentMortgage(s: GameState, p: Player, strategy: ProStrategy, reserve: number) {
  const cash = spendable(s,p), owned = deeds(s,p);
  const development = owned.flatMap(tile => {
    const level = s.properties[tile.position]?.houses;
    if (tile.kind !== "property" || level === 4 || cash >= tile.houseCost + reserve ||
        strategy.thirdHouseBridgeOnly && level !== 2) return [];
    const score = buildingPriority(s,p,tile,strategy);
    return score >= 0.15 ? [{ tile, score }] : [];
  }).sort((a,b)=>b.score-a.score)[0];
  if (!development) return [];
  const shortfall = development.tile.houseCost + reserve - cash;
  const collateral = owned.filter(tile => !s.properties[tile.position]?.mortgaged &&
    (tile.kind === "utility" || tile.kind === "property" && !completesDistrict(s,tile,p.id)) &&
    tile.mortgageValue >= shortfall && mortgagePriority(s,p,tile) < development.score * 0.5 &&
    (!strategy.thirdHouseBridgeOnly || cash < reserve + Math.ceil(tile.mortgageValue / 10)));
  collateral.sort((a,b)=>mortgagePriority(s,p,a)-mortgagePriority(s,p,b));
  return collateral.map(tile=>({type:"MORTGAGE",playerId:p.id,propertyId:tile.position,mortgage:true} as const));
}

// Candidates pass through the real rules engine, including scarce-building and debt rules.
export function nextBotAction(s: GameState, dice: Dice = [1, 2],
  strategyFor: (player: Player) => ProStrategy | undefined = () => s.mode === "mayor" ? TRAINED_MAYOR_PRO : TRAINED_PRO): GameAction | undefined {
  if(s.phase==='lobby'||s.phase==='gameOver')return;
  const bot=(id?:string)=>s.players.find(p=>p.id===id&&p.bot&&!p.bankrupt);
  const legal=(action:GameAction)=>{const next=reduceGame(s,action);return !next.notice&&JSON.stringify(next)!==JSON.stringify(s);};
  const first=(actions:GameAction[])=>actions.find(legal);
  if(s.rentClaim&&bot(s.rentClaim.ownerId)){
    const claim={type:'CLAIM_RENT',playerId:s.rentClaim.ownerId,claimId:s.rentClaim.id} as const;
    if(legal(claim))return claim;
  }
  const desk=s.mayor;
  const actingMayor=bot(desk?.mayorId);
  if (desk?.office && actingMayor?.botLevel === "pro" && s.debts?.[0]?.playerId === actingMayor.id && actingMayor.cash < 0) {
    const amount = Math.min(Math.ceil(-actingMayor.cash + 15), Math.floor(desk.treasury));
    if (mayorCanGrantLoan(s, actingMayor.id, amount)) {
      const loan = { type: "CITY_GRANT_LOAN", playerId: actingMayor.id, term: desk.term, targetId: actingMayor.id, amount } as const;
      if (legal(loan)) return loan;
    }
  }
  if(desk?.office && actingMayor && s.phase==='awaitingJailPayment' && mayorCanReleaseJail(s,actingMayor.id))
    return {type:'CITY_RELEASE_JAIL',playerId:actingMayor.id,term:desk.term,targetId:actingMayor.id};
  if(desk && cityStable(s)){
    for(const candidate of s.players){
      if(!candidate.bot || candidate.bankrupt)continue;
      const bSeat=desk.seats[candidate.id];
      const openBill=bSeat?.bills.find(entry=>entry.status==='open'&&entry.dueTurn<=bSeat.turns+2);
      if(!openBill)continue;
      const style=botStyle(candidate);
      const opportunistic=style.name==='Bold bidder'||style.name==='Opportunist'||(style.name==='Deal maker'&&desk.round%2===1);
      const tightCash=candidate.cash<openBill.amount+style.buildReserve+120;
      const policy = candidate.botLevel === "pro" ? strategyFor(candidate) : undefined;
      const risk = candidate.botLevel === "pro" ? civicRisk(s, candidate) : 0;
      const fine = nextAuditFine(bSeat);
      const taxMargin = policy?.taxReserveWeight === undefined ? 0
        : Math.max(0, (140 - fine) * policy.taxReserveWeight);
      const pay = candidate.botLevel === "pro"
        ? spendable(s, candidate) - openBill.amount >= Math.max(55, risk + 30 - fine) + taxMargin
        : !tightCash && !opportunistic && candidate.cash >= openBill.amount + style.reserve;
      return pay
        ? {type:'CITY_PAY_TAX',playerId:candidate.id,round:openBill.round,billId:openBill.id??null}
        : {type:'CITY_DEFER_TAX',playerId:candidate.id,round:openBill.round,billId:openBill.id??null};
    }
    const mayor=bot(desk.mayorId),active=bot(s.activePlayerId),term=desk.term;
    const profile = mayor?.botLevel === "pro" ? strategyFor(mayor) : undefined;
    const mayorStrategy = profile?.investmentOnly ? undefined : profile;
    if (mayor?.botLevel === "pro" && !desk.auditUsed) {
      const audit = proAudit(s, mayor, legal);
      if (audit) return audit;
    }
    if(mayor && mayor.botLevel!=="pro" && s.players.filter(p=>!p.bankrupt).length>=3 && !desk.auditUsed){
      if(!desk.tip && !desk.office?.investigationUsed && s.phase==='awaitingEndTurn')return {type:'CITY_TIP',playerId:mayor.id,term};
      const rivals=desk.tip?.map(id=>s.players.find(p=>p.id===id && !p.bankrupt)).filter(p=>p!==undefined);
            const missFine = desk.higherTax ? nextAuditMiss(desk.seats[mayor.id]).fine : 25;
      if(rivals?.length && mayor.cash>=Math.max(50, missFine * 2)){
        const target=[...rivals].sort((a,b)=>a.cash-b.cash)[0]!;
        return {type:'CITY_AUDIT',playerId:mayor.id,term,targetId:target.id};
      }
    }
    if(mayor && active===mayor && desk.office){
      const playerId=mayor.id;
            if(mayorCanReleaseJail(s,playerId) && (mayorStrategy ? !shouldHoldJail(s, mayor, mayorStrategy)
        : mayor.botLevel!=='pro' || upcomingRent(s,mayor)<200))
        return {type:'CITY_RELEASE_JAIL',playerId,term,targetId:playerId};
      const loan = Math.min(desk.treasury, mayor.botLevel === "pro"
        ? Math.max(LOAN_AMOUNT, (mayorStrategy ? strategicReserve(s, mayor, mayorStrategy) : proReserve(s, mayor)) - mayor.cash)
        : LOAN_AMOUNT);
      const amount = mayorStrategy ? Math.floor(loan) : loan;
      if(mayor.cash<250 && mayorCanGrantLoan(s,playerId,amount))return {type:'CITY_GRANT_LOAN',playerId,term,targetId:playerId,amount};
      if (mayor.botLevel === "pro" && desk.office.lastBotSeizureTurn !== desk.seats[playerId]!.turns) {
        const collateral = getBoard(s.boardSize).filter(isPurchasableTile).filter(tile => {
          const borrower = citySeizedOwner(s, tile.position);
          return borrower && borrower !== playerId && s.players.some(bidder =>
            bidder.id !== borrower && !bidder.bankrupt &&
            spendable(s, bidder) - (bidder.bot ? botStyle(bidder).reserve : 0) >= Math.max(10, tile.price / 2)
          );
        }).sort((a,b)=>proDeedValue(s,mayor,b.position)-proDeedValue(s,mayor,a.position))[0];
        if (collateral) return {type:'CITY_AUCTION_SEIZED',playerId,term,propertyId:collateral.position};
      }
      if (!desk.office.permitPropertyIds && mayorStrategy) {
        const targets = strategicPermits(s, mayor);
        if (targets.length === PERMIT_LOCK_COUNT) {
          const pause = { type: "CITY_LOCK_PERMITS", playerId, term, propertyIds: targets } as const;
          if (legal(pause)) return pause;
        }
      }
      if(!desk.office.permitPropertyIds && !mayorStrategy){
        const streets=getBoard(s.boardSize).filter(tile=>{
          const owned=s.properties[tile.position];
          if(tile.kind!=='property'||!owned?.ownerId||owned.ownerId===playerId||owned.houses>=5)return false;
          return colorGroupTiles(tile.group,s.boardSize).every(deed=>s.properties[deed.position]?.ownerId===owned.ownerId);
        }).sort((a,b)=>calculateRent(s,b.position,7)-calculateRent(s,a.position,7)).slice(0,PERMIT_LOCK_COUNT);
        if(streets.length===PERMIT_LOCK_COUNT)return {type:'CITY_LOCK_PERMITS',playerId,term,propertyIds:streets.map(tile=>tile.position)};
      }
      if(desk.office.rivalMoveTerm!==term && (mayor.botLevel === "pro" ? moveRivalsAdvantage(s, mayor) > 34 : s.players.some(rival=>{
        if(rival.id===playerId||rival.bankrupt||rival.inJail||rival.position+MAYOR_MOVE_SPACES>=s.boardSize)return false;
        const before=(rival.position+7)%s.boardSize, after=(before+MAYOR_MOVE_SPACES)%s.boardSize;
        return s.properties[after]?.ownerId===playerId &&
          calculateRent(s,after,7)>=150 && s.properties[before]?.ownerId!==playerId;
      })))return {type:'CITY_MOVE_RIVALS',playerId,term};
    }
    if (mayor?.botLevel === "pro" && active === mayor && desk.office && usesCityDecrees(s)) {
      // Let players answer a decree before replacing it or attempting it again.
      if (!desk.proposal && desk.office.lastBotProjectTurn !== desk.seats[mayor.id]?.turns) {
        const project = proMayorProject(s, mayor, term, legal);
        if (project) return project;
      }
    } else if(mayor && active===mayor && (desk.office || !desk.proposalUsed) && !desk.proposal && desk.round>=2){
      const playerId=mayor.id;
      const cashLeader=reserveLevy(s);
      if(desk.policy?.kind!=="wealth" && cashLeader && cashLeader.playerId!==playerId && cityPolicyAvailable(s,'wealth'))
        return {type:'CITY_PROPOSE',playerId,term,policy:'wealth'};
      const lowCash=s.players.filter(p=>!p.bankrupt&&p.cash<=400&&(desk.office?desk.seats[p.id]?.loanDue===undefined:!desk.seats[p.id]?.borrowed));
      if(lowCash.some(p=>p.id===playerId) && cityPolicyAvailable(s,'credit'))
        return {type:'CITY_PROPOSE',playerId,term,policy:'credit'};
      if(desk.council && s.phase==='awaitingRoll'){
        const ahead=[5,6,7,8,9].map(n=>getPurchasableTile((mayor.position+n)%s.boardSize,s.boardSize));
        const danger=ahead.find(tile=>{
          const owner=tile?.kind==='property'?s.properties[tile.position]?.ownerId:undefined;
          const rent=owner && owner!==playerId?calculateRent(s,tile!.position,7):0;
          return rent>0 && rent>=Math.min(500,mayor.cash*.6);
        });
        if(danger?.kind==='property' && cityPolicyAvailable(s,'rent-relief',danger.group))
          return {type:'CITY_PROPOSE',playerId,term,policy:'rent-relief',district:danger.group};
      }
      if(!desk.office){
        const policy=lowCash.filter(p=>p.id!==playerId).length>=2?'loans':'transit';
        return {type:'CITY_PROPOSE',playerId,term,policy};
      }
    }
    const proposal=desk.proposal;
    if (proposal?.kind === "rent-relief" && proposal.district && usesCityDecrees(s)) {
      const duel = s.players.filter(p => !p.bankrupt).length === 2;
      const challenger = s.players.find(player => player.botLevel === "pro" && player.bot && canChallengeCityProject(s, player.id) &&
        districtSwing(s, player, proposal.district!) < -(duel ? DUEL_VETO_COST + 25 : 28) &&
        (!duel || spendable(s, player) > DUEL_VETO_COST + proReserve(s, player)));
      if (challenger) {
        const vote = { type: "CITY_VOTE", playerId: challenger.id, term: proposal.term, proposalId: proposal.id } as const;
        if (legal(vote)) return vote;
      }
    }
    if(active && proposal && canChallengeCityProject(s,active.id) &&
        !(active.botLevel === "pro" && proposal.kind === "rent-relief" && usesCityDecrees(s))){
      const isDuel=s.players.filter(p=>!p.bankrupt).length===2;
      const needsLoan=active.cash<=350 && !desk.seats[active.id]?.borrowed;
      const usesTrain=trainOffer(s,active.id)!==undefined;
      const targeted=proposal.kind==='wealth' && reserveLevy(s)?.playerId===active.id;
      const portfolioAffected=proposal.district && colorGroupTiles(proposal.district,s.boardSize)
        .some(tile=>s.properties[tile.position]?.ownerId===active.id);
      if((!isDuel || active.cash>=DUEL_VETO_COST+400) && (targeted || portfolioAffected || (!isDuel && ((needsLoan && proposal.kind==='transit') ||
        (!needsLoan && usesTrain && proposal.kind==='loans')))))
        return {type:'CITY_VOTE',playerId:active.id,term:proposal.term,proposalId:proposal.id};
    }
    if(active){
      const playerId=active.id,seat=desk.seats[playerId]!;
      const balance=cityLoanBalance(s,playerId);
      if(desk.office && balance>0 && seat.loanStatus && active.cash>=balance)
        return {type:'CITY_REPAY_LOAN',playerId,amount:balance};
      if(desk.council && desk.round<=2 && !seat.contract){
        const transit=deeds(s,active).some(tile=>tile.kind==='railroad') || botStyle(active).name==='Opportunist';
        return {type:'CITY_CONTRACT',playerId,contract:transit?'transit':'build'};
      }
      const wheel=desk.wheel;
      if(wheel?.playerId===playerId&&s.phase==='awaitingEndTurn')return wheel.section===5
        ? {type:'CITY_SCRATCH',playerId,wheelId:wheel.id} : {type:'CITY_SPIN',playerId,wheelId:wheel.id};
      if(active.cash<250 && cityLoanAvailable(s,playerId))return {type:'CITY_LOAN',playerId,round:desk.round};
      const train=trainOffer(s,playerId);
      if(train && active.cash>=train.fare){
        const owner=s.properties[train.to]?.ownerId;
        const cost=train.fare+(owner&&owner!==playerId?calculateRent(s,train.to,0):0);
        const risk=[4,5,6,7,8,9,10].map(n=>(active.position+n)%s.boardSize)
          .reduce((sum,position)=>sum+(s.properties[position]?.ownerId&&s.properties[position]?.ownerId!==playerId?calculateRent(s,position,7):0),0)/7;
        const worthwhile = active.botLevel === "pro"
          ? civicRisk(s, active) - civicRisk(s, active, train.to) + (train.to < active.position ? 200 : 0) > cost + 20 ||
            train.fare === 0 && !owner && active.cash >= proReserve(s, active) + 180
          : risk > cost + 25 || train.fare === 0 && !owner && active.cash >= 400;
        if(worthwhile)return {type:"CITY_EXPRESS",playerId};
      }
    }
  }
  if(s.phase==='awaitingTradeResponse'&&s.pendingTrade){
    const t=s.pendingTrade,p=bot(t.toPlayerId);if(!p)return;
    if (p.botLevel === "pro") return proTradeResponse(projectCityState(s, p.id), p, t, legal);
    const delta=tradeDelta(s,t,p),accept={type:'TRADE_ACCEPT',playerId:p.id,offerId:t.id} as const;
    if(delta>=0&&(t.requestedCash<=t.offeredCash||spendable(s,p)+t.offeredCash-t.requestedCash>=100)&&legal(accept))return accept;
    const gap=Math.max(10,Math.ceil(-delta+10)),other=s.players.find(player=>player.id===t.fromPlayerId);
    if(!t.counterOfId&&other&&spendable(s,other)>=t.offeredCash+gap){
      const counter:GameAction={type:'TRADE_COUNTER',playerId:p.id,previousOfferId:t.id,offerId:`ai-counter-${s.nextEventId}`,offeredCash:t.requestedCash,requestedCash:t.offeredCash+gap,offeredPropertyIds:t.requestedPropertyIds,requestedPropertyIds:t.offeredPropertyIds,offeredJailCards:t.requestedJailCards,requestedJailCards:t.offeredJailCards};
      if(legal(counter))return counter;
    }
    return {type:'TRADE_DECLINE',playerId:p.id,offerId:t.id};
  }
  if(s.phase==='awaitingAuction'&&s.auction){
    const a=s.auction,p=s.players.find(p=>p.bot&&!p.bankrupt&&a.eligiblePlayerIds.includes(p.id)&&!a.passedPlayerIds.includes(p.id)&&a.highestBidderId!==p.id);
    if(!p)return;
    const style=botStyle(p),building=a.kind==='house'||a.kind==='hotel';
    const profile = p.botLevel === "pro" ? strategyFor(p) : undefined;
    const strategy = profile?.investmentOnly ? undefined : profile;
    const targets=a.buildTargets?.[p.id]??[];
    const buildValue = (id: number) => strategy ? buildingPriority(s,p,getPurchasableTile(id,s.boardSize)!,strategy) : buildReturn(s,p,id);
    const target=p.botLevel==="pro"
      ? [...targets].sort((x,y)=>buildValue(y)-buildValue(x))[0]
      : targets[0];
    const tile=getPurchasableTile(target??a.propertyId,s.boardSize);
    const complete=tile?.kind==='property'&&colorGroupTiles(tile.group,s.boardSize).every(t=>t.position===tile.position||s.properties[t.position]?.ownerId===p.id);
    const credit=auctionCredit(a,p.id);
    const reserve = strategy ? strategicReserve(s, p, strategy) : p.botLevel === "pro" ? proReserve(s,p) : style.reserve;
    const cash=spendable(s,p);
    const liquid = strategy ? Math.max(0, cash - reserve) + (cash < reserve ? credit : 0)
      : credit ? cash+credit : Math.max(0,cash-reserve);
    const limit=Math.floor(Math.min(liquid,tile?(building&&tile.kind==='property'?tile.houseCost*(p.botLevel==="pro" ? Math.min(2.4, 1.2+buildValue(tile.position)*2.5) : 1.5):
      strategy ? propertyCeiling(s,p,tile,strategy) : p.botLevel==='pro'?proDeedValue(s,p,tile.position):tile.price*(complete?1.7:style.bid)):0));
    const increment = p.botLevel === "pro" && a.currentBid
      ? Math.max(10, Math.floor((limit - a.currentBid) / 50) * 5)
      : style.bid > 1.2 && limit - a.currentBid > 60 ? 20 : 10;
    const minBid=Math.max(usesClassicRules(s)?10:1,a.currentBid+1);
    const amount = strategy ? Math.max(minBid, Math.min(limit, a.currentBid + (a.currentBid ? Math.min(15, increment) : 10)))
      : p.botLevel==='pro'?Math.max(minBid,Math.min(limit,a.currentBid+increment)):Math.max(10,a.currentBid+increment);
    const bid:GameAction={type:'AUCTION_BID',playerId:p.id,auctionId:a.id,amount,propertyId:target};
    return amount<=limit&&legal(bid)?bid:{type:'AUCTION_BID',playerId:p.id,auctionId:a.id,pass:true};
  }
  const p=bot(decisionPlayerId(s));if(!p)return;
  const playerId=p.id,owned=deeds(s,p),cash=spendable(s,p),style=botStyle(p);
  const profile = p.botLevel === "pro" ? strategyFor(p) : undefined;
  const strategy = profile?.investmentOnly ? undefined : profile;
  if(s.phase==='awaitingDebt'){
    const improved=owned.filter(t=>s.properties[t.position]!.houses>0).sort((a,b)=>
      p.botLevel==="pro" ? calculateRent(s,a.position,7)-calculateRent(s,b.position,7) : s.properties[b.position]!.houses-s.properties[a.position]!.houses);
    const mortgages=owned.filter(t=>!s.properties[t.position]!.mortgaged);
    if (p.botLevel==="pro") {
      const mortgageCost = (tile: (typeof mortgages)[number]) => (strategy ? propertyCeiling(s,p,tile,strategy)
        : proDeedValue(s,p,tile.position)) / tile.mortgageValue;
      mortgages.sort((a,b)=>mortgageCost(a)-mortgageCost(b));
    }
    const mortgageActions=mortgages.map(t=>({type:'MORTGAGE',playerId,propertyId:t.position,mortgage:true} as const));
    return first([
      ...(p.botLevel==="pro" ? mortgageActions : []),
      ...improved.map(t=>({type:'BUILD',playerId,propertyId:t.position,operation:'sell'} as const)),
      ...improved.map(t=>({type:'BUILD',playerId,propertyId:t.position,operation:'sellGroup'} as const)),
      ...(p.botLevel==="pro" ? [] : mortgageActions),
      {type:'BANKRUPT',playerId}
    ]);
  }
  if (s.phase==='awaitingMortgageDecision') {
    const received = s.mortgageTransfers?.[0]?.propertyIds ?? [];
    const worthwhile = received.flatMap(id => {
      const tile = getPurchasableTile(id,s.boardSize);
      if (tile?.kind !== "property" || !colorGroupTiles(tile.group,s.boardSize).every(member=>s.properties[member.position]?.ownerId===p.id)) return [];
      return [{id, cost: tile.mortgageValue + Math.ceil(tile.mortgageValue / 10)}];
    });
    let budget = cash - (strategy ? strategicReserve(s,p,strategy) : proReserve(s,p));
    const redeemPropertyIds = p.botLevel!=="pro" ? [] : worthwhile.filter(({cost})=>{
      if (cost > budget) return false;
      budget -= cost;
      return true;
    }).map(({id})=>id);
    return first([{type:'RESOLVE_MORTGAGES',playerId,redeemPropertyIds},{type:'RESOLVE_MORTGAGES',playerId,redeemPropertyIds:[]}]);
  }
  if(s.phase==='awaitingJailPayment')return first([{type:'PAY',playerId,kind:'jailCard'},{type:'PAY',playerId,kind:'jailFine'}]);
  if(s.phase==='awaitingUtilityRoll')return {type:'ROLL',playerId,dice};
  if(s.phase==='awaitingRoll'){
    if(p.inJail){
      const holdInJail = strategy ? shouldHoldJail(s,p,strategy) : p.botLevel==="pro" && upcomingRent(s,{...p,position:s.boardSize/4}) > Math.max(125,cash*.25);
      const canPay = strategy ? cash >= strategicReserve(s,p,strategy) + 50 : cash >= 250;
      const release=holdInJail ? undefined : first([{type:'PAY',playerId,kind:'jailCard'},...(canPay?[{type:'PAY',playerId,kind:'jailFine'} as const]:[])]);
      if(release)return release;
    }
    return {type:'ROLL',playerId,dice};
  }
  if(s.phase==='awaitingMove')return {type:'MOVE_RESULT',playerId};
  if(s.phase==='awaitingBuy'&&s.pendingPurchase){
    const propertyId=s.pendingPurchase.propertyId,tile=getPurchasableTile(propertyId,s.boardSize);
    const buy={type:'BUY',playerId,propertyId} as const;
    if (strategy && tile) {
      const reserve = strategicReserve(s, p, strategy);
      const ceiling = propertyCeiling(s, p, tile, strategy);
      const completes = completesDistrict(s, tile, p.id);
      const minCash = completes ? Math.floor(reserve * 0.72) : reserve;
      if (cash >= tile.price + minCash && (ceiling >= tile.price || cash >= tile.price + reserve + 300) && legal(buy)) return buy;
      // Bridge a small shortfall for the final deed with a low-value deed outside that district.
      if (tile.kind === "property" && completes && cash >= tile.price - 130 && cash < tile.price + minCash) {
        const spare = owned.filter(deed => !s.properties[deed.position]?.mortgaged &&
          (deed.kind === "utility" || deed.kind === "property" && deed.group !== tile.group && !completesDistrict(s,deed,p.id)) &&
          cash + deed.mortgageValue >= tile.price + minCash);
        spare.sort((a,b)=>mortgagePriority(s,p,a)-mortgagePriority(s,p,b));
        const funding = first(spare.map(deed=>({type:"MORTGAGE",playerId,propertyId:deed.position,mortgage:true})));
        if (funding) return funding;
      }
      return {type:"DECLINE_BUY",playerId};
    }
    const complete=tile?.kind==='property'&&colorGroupTiles(tile.group,s.boardSize).every(t=>t.position===tile.position||s.properties[t.position]?.ownerId===p.id);
    const reserve=p.botLevel==='pro'?proReserve(s,p):style.reserve;
    const remaining=complete?(p.botLevel==='pro'?Math.max(75,reserve-150):50):reserve;
    return tile&&cash>=tile.price+remaining&&legal(buy)?buy:{type:'DECLINE_BUY',playerId};
  }
  if(s.phase==='awaitingEndTurn'){
    if (profile && !profile.thirdHouseBridgeOnly) {
      const range = profile.reserveBlend ?? 1;
      const reserve = profile.investmentOnly
        ? Math.ceil(proReserve(s,p) * (1 - range) + strategicReserve(s,p,profile) * range)
        : strategicReserve(s,p,profile);
      const projects = owned.flatMap<{ score: number; action: GameAction }>(tile => {
        if (s.properties[tile.position]?.mortgaged) {
          const cost = tile.mortgageValue + Math.ceil(tile.mortgageValue / 10);
          const score = mortgagePriority(s,p,tile);
          const action = { type:"MORTGAGE",playerId,propertyId:tile.position,mortgage:false } as const;
          return cash >= cost + reserve && score >= 0.09 ? [{ score, action }] : [];
        }
        if (tile.kind !== "property" || cash < tile.houseCost + reserve) return [];
        const score = buildingPriority(s,p,tile,profile);
        const action = { type:"BUILD",playerId,propertyId:tile.position,operation:"build" } as const;
        return score >= 0.06 ? [{ score, action }] : [];
      });
      projects.sort((a,b)=>b.score-a.score);
      const invest = first(projects.map(item=>item.action));
      if (invest) return invest;
      if (profile.financeBuilds) {
        const loan = first(developmentMortgage(s,p,profile,reserve));
        if (loan) return loan;
      }
    }
    const usableReserve=p.botLevel==='pro'?proReserve(s,p):style.buildReserve;
    const upgrades=owned.filter(t=>t.kind==='property' && !propertyPermitLocked(s,t.position) && s.properties[t.position]!.houses<5&&cash>=t.houseCost+usableReserve);
    upgrades.sort((a,b)=>p.botLevel==="pro"
      ? buildReturn(s,p,b.position)-buildReturn(s,p,a.position)
      : s.properties[a.position]!.houses-s.properties[b.position]!.houses);
    const finance=profile && !profile.thirdHouseBridgeOnly ? undefined : first([
      ...owned.filter(t=>s.properties[t.position]!.mortgaged&&cash>=t.mortgageValue*1.1+usableReserve).map(t=>({type:'MORTGAGE',playerId,propertyId:t.position,mortgage:false} as const)),
      ...upgrades.map(t=>({type:'BUILD',playerId,propertyId:t.position,operation:'build'} as const))
    ]);
    if(finance)return finance;
    if (!p.botTradeOffered && p.botLevel === "pro") {
      const offer = proTradeOffer(projectCityState(s, p.id), p, legal);
      if (offer) return offer;
    }
    if(!p.botTradeOffered&&cash>=400&&p.botLevel!=="pro"){
      for(const t of getBoard(s.boardSize)){
        if(t.kind!=='property'||!s.properties[t.position]?.ownerId||s.properties[t.position]?.ownerId===playerId)continue;
        const group=colorGroupTiles(t.group,s.boardSize),partner=s.properties[t.position]!.ownerId!;
        if(!group.every(m=>m.position===t.position||s.properties[m.position]?.ownerId===playerId)||!canTradeProperty(s,t.position,partner))continue;
        const offeredCash=Math.ceil(t.price*style.trade);
        const offer:GameAction={type:'TRADE_OFFER',playerId,offerId:`ai-offer-${s.nextEventId}`,toPlayerId:partner,offeredCash,requestedCash:0,offeredPropertyIds:[],requestedPropertyIds:[t.position]};
        if(cash>=offeredCash+200&&legal(offer))return offer;
      }
    }
    if (profile?.thirdHouseBridgeOnly) {
      const loan = first(developmentMortgage(s,p,profile,usableReserve));
      if (loan) return loan;
    }
    return {type:'END_TURN',playerId};
  }
}
