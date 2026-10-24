import { BOARD, colorGroupTiles, getPurchasableTile, isPurchasableTile, railroadPositions, utilityPositions } from "./board";
import { CLASSIC_CARDS, jailCardIndex } from "./classicCards";
import { formatRupees as money } from "./currency";
import type { AuctionState, CardDeck, DebtResumePhase, Dice, GameAction, GameEvent, GameState, Player, StreetTile, TradeOffer } from "./types";

class RuleViolation extends Error {}
function requireRule(ok: unknown, text: string): asserts ok { if (!ok) throw new RuleViolation(text); }
const whole = (n: number) => Number.isSafeInteger(n) && n >= 0;
const validDice = (dice: Dice) => dice.length === 2 && dice.every(n => Number.isInteger(n) && n >= 1 && n <= 6);
const cashAmount = (n: number) => Number.isFinite(n) && n >= 0 && Number.isSafeInteger(Math.round(n * 100)) && Math.abs(n * 100 - Math.round(n * 100)) < .00001;
const cents = (n: number) => Math.round(n*100)/100;
const owner = (s: GameState, id: string) => s.players.find(p => p.id === id)!;
const group = (tile: StreetTile) => colorGroupTiles(tile.group, 40);
const held = (p: Player) => p.jailCardDecks ?? [];
const levels = (s: GameState, tile: StreetTile) => group(tile).map(t => s.properties[t.position]!.houses);
const fullSet = (s: GameState, id: string, tile: StreetTile) => group(tile).every(t => s.properties[t.position]!.ownerId === id && !s.properties[t.position]!.mortgaged);
const live = (s: GameState) => s.players.filter(p => !p.bankrupt);
const buildingValue = (s: GameState, tile: StreetTile) => (s.properties[tile.position]!.buildingCosts ?? Array(s.properties[tile.position]!.houses).fill(tile.houseCost)).reduce((n,cost)=>n+cost,0);
const normalPhases = ["awaitingRoll", "awaitingEndTurn", "awaitingBuy", "awaitingJailPayment", "awaitingUtilityRoll", "awaitingAuction"];

export const classicSpendableCash = (s: GameState, id: string) => (owner(s, id)?.cash ?? 0) -
  [s.auction, s.suspendedAuction].reduce((n, a) => n + (a?.highestBidderId === id ? a.currentBid : 0), 0);
export const classicLiquidationValue = (s: GameState, id: string) => BOARD.reduce((n, tile) => {
  const p = s.properties[tile.position];
  return !isPurchasableTile(tile) || p?.ownerId !== id ? n : n + (p.mortgaged ? 0 : tile.mortgageValue) +
    (tile.kind === "property" ? buildingValue(s,tile) / 2 : 0);
}, owner(s, id)?.cash ?? 0);
export const canClassicManage = (s: GameState, id: string) => Boolean(owner(s, id) && !owner(s, id).bankrupt &&
  (s.phase === "awaitingDebt" ? s.debts?.[0]?.playerId === id : normalPhases.includes(s.phase)));
export const classicBuildingGroupLocked = (s: GameState, propertyId: number, id: string) => {
  const tile=BOARD[propertyId];
  return tile?.kind==="property" && [s.auction,s.suspendedAuction].some(a=> {
    const target=BOARD[a?.winningTarget??a?.propertyId??-1];
    return a?.highestBidderId===id && (a.kind==="house" || a.kind==="hotel") && target?.kind==="property" && target.group===tile.group;
  });
};
export const canClassicTradeProperty = (s: GameState, propertyId: number, id: string) => {
  const tile = getPurchasableTile(propertyId, 40), p = s.properties[propertyId];
  if (!tile || p?.ownerId !== id || p.houses || tile.kind === "property" && levels(s, tile).some(Boolean)) return false;
  if (s.mortgageTransfers?.some(t => t.propertyIds.includes(propertyId))) return false;
  return ![s.auction, s.suspendedAuction].some(a => {
    if (!a || a.kind !== "house" && a.kind !== "hotel" || a.highestBidderId !== id) return false;
    const target = BOARD[a.winningTarget ?? a.propertyId];
    return target?.kind === "property" && tile.kind === "property" && target.group === tile.group;
  });
};
const buildable = (s: GameState, id: string, propertyId: number, hotel = false) => {
  const tile = BOARD[propertyId], p = s.properties[propertyId];
  return Boolean(tile?.kind === "property" && p?.ownerId === id && !p.mortgaged && fullSet(s, id, tile) &&
    p.houses === Math.min(...levels(s, tile)) && (hotel ? p.houses === 4 : p.houses < 4));
};

class Table {
  constructor(readonly s: GameState) {}
  player(id: string) { const p = owner(this.s, id); requireRule(p && !p.bankrupt, "That player is not playing."); return p; }
  event(text: string, kind: GameEvent["kind"] = "info", detail: Partial<GameEvent> = {}) {
    this.s.eventLog.unshift({ ...detail, id: this.s.nextEventId++, kind, text });
    this.s.eventLog.length = Math.min(60, this.s.eventLog.length);
  }
  credit(id: string, amount: number) {
    if (amount <= 0 || id === "bank") return;
    const p = this.player(id); p.cash = cents(p.cash+amount);
    // Repay each real creditor before any remainder becomes spendable.
    for (const debt of this.s.debts ?? []) {
      if (debt.playerId !== id || !debt.amount || amount <= 0) continue;
      const paid = Math.min(amount, debt.amount); debt.amount = cents(debt.amount-paid); amount = cents(amount-paid);
      if (debt.creditorId !== "bank" && !owner(this.s, debt.creditorId)?.bankrupt) this.credit(debt.creditorId, paid);
    }
  }
  pay(id: string, target: string, amount: number, reason: string) {
    if (!amount) return;
    const p = this.player(id), paid = Math.min(Math.max(0, p.cash), amount);
    p.cash = cents(p.cash-amount); if (target !== "bank") this.credit(target, paid);
    if (paid < amount) (this.s.debts ??= []).push({ playerId: id, creditorId: target, reason, amount: cents(amount - paid) });
    this.event(`${p.name} ${paid < amount ? "owes" : "paid"} ${money(amount)} ${reason}.`, "money", { playerId: id, recipientId: target, amount });
  }
  active(id: string, phase: GameState["phase"]) { requireRule(this.s.activePlayerId === id && this.s.phase === phase, "That decision is not available on your turn."); return this.player(id); }
  manage(id: string) { requireRule(canClassicManage(this.s, id), "Finish the outstanding decision before managing property."); return this.player(id); }
  spend(id: string, amount: number) { requireRule(classicSpendableCash(this.s, id) >= amount, "Not enough unreserved cash."); this.player(id).cash = cents(this.player(id).cash-amount); }
  endLanding() { this.s.phase = "awaitingEndTurn"; this.s.pendingRoll = undefined; }
  move(id: string, to: number, collect: boolean) {
    const p = this.player(id); p.position = to;
    this.event(`${p.name} moved to ${BOARD[to]!.name}.`, "turn", { playerId: id, position: to });
    if (collect) { this.credit(id, 200); this.event(`${p.name} passed GO and collected ₹200.`, "money", { playerId: id, amount: 200 }); }
  }
  jail(id: string) {
    const p = this.player(id); p.position = 10; p.inJail = true; p.jailTurns = 0;
    this.s.consecutiveDoubles = 0; this.s.pendingRoll = undefined; this.s.phase = "awaitingEndTurn";
    this.event(`${p.name} went to Jail (direct instruction).`, "turn", { playerId: id, position: 10 });
  }
  rent(id: number, total: number) {
    const tile = getPurchasableTile(id, 40)!, p = this.s.properties[id]!;
    if (!p.ownerId || p.mortgaged) return 0;
    if (tile.kind === "railroad") return [0,25,50,100,200][railroadPositions(40).filter(i => this.s.properties[i]!.ownerId === p.ownerId).length]!;
    if (tile.kind === "utility") return total * (utilityPositions(40).every(i => this.s.properties[i]!.ownerId === p.ownerId) ? 10 : 4);
    return tile.rent[p.houses] * (p.houses === 0 && group(tile).every(t => this.s.properties[t.position]!.ownerId === p.ownerId) ? 2 : 1);
  }
  land(id: string, depth = 0, multiplier?: number) {
    requireRule(depth < 8, "Card movement did not terminate.");
    const p = this.player(id), tile = BOARD[p.position]!;
    if (isPurchasableTile(tile)) {
      const deed = this.s.properties[p.position]!;
      if (!deed.ownerId) { this.s.phase = "awaitingBuy"; this.s.pendingPurchase = { playerId: id, propertyId: p.position }; return; }
      if (deed.ownerId === id || deed.mortgaged) { this.endLanding(); return; }
      if (tile.kind === "utility") {
        this.s.pendingUtility = { playerId: id, propertyId: p.position, multiplier: multiplier ?? (utilityPositions(40).every(i => this.s.properties[i]!.ownerId === deed.ownerId) ? 10 : 4) };
        this.s.phase = "awaitingUtilityRoll"; return;
      }
      this.pay(id, deed.ownerId, this.rent(p.position, this.s.lastRoll!.total) * (multiplier ?? 1), `rent for ${tile.name}`);
      this.endLanding(); return;
    }
    if (tile.kind === "goToJail") { this.jail(id); return; }
    if (tile.kind === "tax") { this.pay(id, "bank", tile.amount, `for ${tile.name}`); this.endLanding(); return; }
    if (tile.kind !== "chance" && tile.kind !== "community") { this.endLanding(); return; }
    const deck = tile.kind, cards = this.s.decks![deck], index = cards.shift()!;
    const card = CLASSIC_CARDS[deck][index]!;
    requireRule(card, "The saved card deck is incomplete.");
    if (card.effect.kind !== "jailCard") cards.push(index);
    this.s.card = { deck, index, text: card.text, playerId: id };
    this.event(`${p.name} drew: ${card.text}`, "card", { playerId: id, deck, cardIndex: index });
    const effect = card.effect;
    switch (effect.kind) {
      case "money": if (effect.amount >= 0) { this.credit(id, effect.amount); this.event(`${p.name} received ${money(effect.amount)}.`, "money", { playerId: id, amount: effect.amount }); } else this.pay(id, "bank", -effect.amount, "for a card"); break;
      case "goToJail": this.jail(id); return;
      case "jailCard": (p.jailCardDecks ??= []).push(deck); p.getOutOfJailCards = held(p).length; break;
      case "collectFromEach": for (const other of live(this.s)) if (other.id !== id) this.pay(other.id, id, effect.amount, `to ${p.name}`); break;
      case "payEach": for (const other of live(this.s)) if (other.id !== id) this.pay(id, other.id, effect.amount, `to ${other.name}`); break;
      case "repairs": {
        const amount = BOARD.reduce((n,t) => { const d = this.s.properties[t.position]; return t.kind !== "property" || d?.ownerId !== id ? n : n + (d.houses === 5 ? effect.hotel : d.houses * effect.house); },0);
        this.pay(id, "bank", amount, "for building repairs"); break;
      }
      case "moveRelative": this.move(id, (p.position + effect.spaces + 40) % 40, effect.spaces > 0 && p.position + effect.spaces >= 40); this.land(id, depth + 1); return;
      case "moveTo": this.move(id, effect.position, effect.awardGo === true || effect.position < p.position); this.land(id, depth + 1); return;
      case "nearestRailroad":
      case "nearestUtility": {
        const positions = effect.kind === "nearestRailroad" ? railroadPositions(40) : utilityPositions(40);
        const destination = positions.find(i => i > p.position) ?? positions[0]!;
        this.move(id, destination, destination < p.position); this.land(id, depth + 1, effect.kind === "nearestRailroad" ? 2 : 10); return;
      }
    }
    this.endLanding();
  }
  roll(id: string, dice: Dice) {
    requireRule(validDice(dice), "Use two valid dice.");
    if (this.s.phase === "awaitingUtilityRoll") {
      this.active(id,"awaitingUtilityRoll"); const rent = this.s.pendingUtility!;
      this.s.lastUtilityRoll = { playerId: id, dice: [...dice] as Dice, eventId: this.s.nextEventId };
      this.event(`${this.player(id).name} rolled ${dice.join(" + ")} for utility rent.`, "turn", { playerId: id });
      this.pay(id,this.s.properties[rent.propertyId]!.ownerId!,(dice[0]+dice[1])*rent.multiplier,`rent for ${BOARD[rent.propertyId]!.name}`);
      this.s.pendingUtility = undefined; this.endLanding(); return;
    }
    const p = this.active(id,"awaitingRoll"), doubles = dice[0] === dice[1];
    const roll = { playerId: id, dice: [...dice] as Dice, total: dice[0]+dice[1], doubles, grantsExtraRoll: doubles && !p.inJail };
    this.s.card = undefined; this.s.lastRoll = roll;
    this.event(`${p.name} rolled ${dice.join(" + ")}.`, "turn", { playerId: id });
    if (p.inJail) {
      this.s.consecutiveDoubles = 0;
      if (doubles) { p.inJail = false; p.jailTurns = 0; this.event(`${p.name} rolled doubles and left Jail.`, "turn", { playerId: id }); }
      else { p.jailTurns++; this.s.phase = p.jailTurns >= 3 ? "awaitingJailPayment" : "awaitingEndTurn"; this.s.pendingRoll = p.jailTurns >= 3 ? roll : undefined; return; }
    } else {
      this.s.consecutiveDoubles = doubles ? this.s.consecutiveDoubles + 1 : 0;
      if (this.s.consecutiveDoubles === 3) { this.jail(id); return; }
    }
    this.s.pendingRoll = roll; this.s.phase = "awaitingMove";
  }
  nextTurn(id: string) {
    const index = this.s.players.findIndex(p => p.id === id);
    const next = Array.from({length:this.s.players.length},(_,i)=>this.s.players[(index+i+1)%this.s.players.length]!).find(p => !p.bankrupt)!;
    this.s.activePlayerId = next.id; this.s.phase = "awaitingRoll"; this.s.consecutiveDoubles = 0;
    this.s.card = undefined; this.s.pendingRoll = undefined; this.s.pendingPurchase = undefined; this.s.pendingUtility = undefined;
    this.event(`${next.name}'s turn.`, "turn", { playerId: next.id });
  }
  queueMortgages(id: string, ids: number[]) {
    const propertyIds = ids.filter(i => this.s.properties[i]!.mortgaged);
    if (propertyIds.length) (this.s.mortgageTransfers ??= []).push({playerId:id, propertyIds});
  }
  bankrupt(id: string) {
    const p = this.player(id), debt = this.s.debts?.find(d=>d.playerId===id);
    requireRule(this.s.phase === "awaitingDebt" && this.s.debts?.[0]?.playerId === id && p.cash < 0 && classicLiquidationValue(this.s,id) < 0, "Raise available mortgage and building-sale funds before declaring bankruptcy.");
    const creditor = debt!.creditorId === "bank" ? undefined : owner(this.s,debt!.creditorId);
    const ids: number[] = []; let proceeds = 0;
    for (const t of BOARD) {
      if (!isPurchasableTile(t) || this.s.properties[t.position]!.ownerId !== id) continue;
      const d = this.s.properties[t.position]!; ids.push(t.position);
      if (t.kind === "property") { proceeds += buildingValue(this.s,t)/2; if (d.houses===5) this.s.bankHotels++; else this.s.bankHouses += d.houses; }
      d.houses=0; d.buildingCosts=[]; d.ownerId=creditor?.id; if (!creditor) d.mortgaged=false;
    }
    if (creditor) {
      this.credit(creditor.id,proceeds); creditor.jailCardDecks=[...held(creditor),...held(p)]; creditor.getOutOfJailCards=held(creditor).length; this.queueMortgages(creditor.id,ids);
    } else {
      for (const deck of held(p)) this.s.decks![deck].push(jailCardIndex(deck));
      (this.s.bankAuctionQueue ??= []).push(...ids);
    }
    p.bankrupt=true; p.cash=0; p.inJail=false; p.getOutOfJailCards=0; p.jailCardDecks=[];
    this.s.debts=this.s.debts?.filter(d=>d.playerId!==id); this.s.pendingTrade=undefined;
    this.event(`${p.name} is bankrupt. Their assets go to ${creditor?.name ?? "the bank"}.`,"money",{playerId:id});
    if (this.s.activePlayerId===id) { this.nextTurn(id); this.s.debtResumePhase="awaitingRoll"; if (this.s.mortgageResumePhase) this.s.mortgageResumePhase="awaitingRoll"; }
  }
  auction(propertyId: number, kind: AuctionState["kind"] = "property", targets?: Record<string,number[]>) {
    this.s.auction={ propertyId, kind, currentBid:0, landingPlayerId:this.s.activePlayerId!, eligiblePlayerIds:targets?Object.keys(targets):live(this.s).map(p=>p.id), passedPlayerIds:[], buildTargets:targets };
    this.s.phase="awaitingAuction";
    this.event(`${kind === "property" ? BOARD[propertyId]!.name : "The last available "+kind} is up for auction.`);
  }
  finishAuction() {
    const a=this.s.auction!, winner=a.highestBidderId;
    if (winner) {
      const id=a.winningTarget ?? a.propertyId, tile=getPurchasableTile(id,40)!;
      this.s.auction=undefined;
      this.spend(winner,a.currentBid);
      if (a.kind==="house" || a.kind==="hotel") {
        requireRule(buildable(this.s,winner,id,a.kind==="hotel"),"The winning building target is no longer legal.");
        this.addBuilding(id,a.currentBid);
      } else this.s.properties[id]!.ownerId=winner;
      this.event(`${this.player(winner).name} won ${a.kind==="house"||a.kind==="hotel"?a.kind+" on ":""}${tile.name} for ${money(a.currentBid)}.`,"money",{playerId:winner,position:id,amount:a.currentBid});
    } else { this.s.auction=undefined; this.event("No bids; the item stays with the bank."); }
    this.s.phase=this.s.auctionResumePhase ?? "awaitingEndTurn"; this.s.auctionResumePhase=undefined;
    if (this.s.suspendedAuction) { this.s.auction=this.s.suspendedAuction; this.s.suspendedAuction=undefined; this.s.phase="awaitingAuction"; }
  }
  bid(action: Extract<GameAction,{type:"AUCTION_BID"}>) {
    const a=this.s.auction!, p=this.player(action.playerId);
    requireRule(this.s.phase==="awaitingAuction" && a && a.eligiblePlayerIds.includes(p.id),"You are not eligible for this auction.");
    requireRule(a.highestBidderId!==p.id,"You already hold the highest bid.");
    if (action.pass) { if (!a.passedPlayerIds.includes(p.id)) a.passedPlayerIds.push(p.id); this.event(`${p.name} passed the auction.`,"info",{playerId:p.id}); }
    else {
      const amount=action.amount ?? -1, available=p.cash-(this.s.suspendedAuction?.highestBidderId===p.id?this.s.suspendedAuction.currentBid:0);
      requireRule(whole(amount) && amount>=Math.max(10,a.currentBid+1) && amount<=available,"Bids must open at ₹10, increase and be affordable.");
      const target=action.propertyId ?? a.buildTargets?.[p.id]?.[0] ?? a.propertyId;
      if (a.buildTargets) requireRule(a.buildTargets[p.id]?.includes(target) && buildable(this.s,p.id,target,a.kind==="hotel"),"Choose a legal building target.");
      a.currentBid=amount; a.highestBidderId=p.id; a.winningTarget=target; a.passedPlayerIds=[];
      this.event(`${p.name} bid ${money(amount)}.`,"info",{playerId:p.id,position:target});
    }
    if (a.eligiblePlayerIds.filter(id=>id!==a.highestBidderId).every(id=>a.passedPlayerIds.includes(id))) this.finishAuction();
  }
  addBuilding(id: number, cost: number) {
    const d=this.s.properties[id]!;
    d.buildingCosts ??= Array(d.houses).fill((BOARD[id] as StreetTile).houseCost);
    d.buildingCosts.push(cost);
    if (d.houses===4) { requireRule(this.s.bankHotels>0,"No hotels remain."); this.s.bankHotels--; this.s.bankHouses+=4; }
    else { requireRule(this.s.bankHouses>0,"No houses remain."); this.s.bankHouses--; }
    d.houses++;
  }
  build(action: Extract<GameAction,{type:"BUILD"}>) {
    const p=this.manage(action.playerId), tile=BOARD[action.propertyId], d=this.s.properties[action.propertyId];
    requireRule(tile?.kind==="property" && d?.ownerId===p.id && fullSet(this.s,p.id,tile),"You need an unmortgaged complete colour set.");
    requireRule(!classicBuildingGroupLocked(this.s,tile.position,p.id),"Finish the winning building auction before changing that colour set.");
    if (action.operation==="build") {
      requireRule(buildable(this.s,p.id,tile.position,d.houses===4) && classicSpendableCash(this.s,p.id)>=tile.houseCost,"Build evenly with available cash.");
      requireRule(this.s.auction?.kind!=="house" && this.s.auction?.kind!=="hotel","Finish the building auction first.");
      const kind=d.houses===4?"hotel":"house", stock=kind==="hotel"?this.s.bankHotels:this.s.bankHouses;
      requireRule(stock>0,"The bank has no buildings of that type.");
      if (stock===1) {
        const targets: Record<string,number[]>={};
        for (const other of live(this.s)) {
          const ids=BOARD.filter(t=>buildable(this.s,other.id,t.position,kind==="hotel")).map(t=>t.position);
          if (ids.length && classicSpendableCash(this.s,other.id)>=10) targets[other.id]=ids;
        }
        if (Object.keys(targets).length>1) {
          if (this.s.auction) this.s.suspendedAuction=this.s.auction;
          this.s.auctionResumePhase=this.s.phase as DebtResumePhase; this.auction(tile.position,kind,targets); return;
        }
      }
      this.spend(p.id,tile.houseCost); this.addBuilding(tile.position,tile.houseCost);
      this.event(`${p.name} improved ${tile.name}.`,"money",{playerId:p.id,position:tile.position,amount:tile.houseCost}); return;
    }
    requireRule(d.houses>0,"There are no buildings to sell.");
    if (action.operation==="sellGroup") {
      let value=0;
      for (const member of group(tile)) { const owned=this.s.properties[member.position]!; value+=buildingValue(this.s,member)/2; if (owned.houses===5) this.s.bankHotels++; else this.s.bankHouses+=owned.houses; owned.houses=0; owned.buildingCosts=[]; }
      this.credit(p.id,value); this.event(`${p.name} sold all district buildings near ${tile.name} for ${money(value)}.`,"money",{playerId:p.id,position:tile.position,amount:value}); return;
    }
    requireRule(d.houses===Math.max(...levels(this.s,tile)),"Sell buildings evenly.");
    if (d.houses===5) { requireRule(this.s.bankHouses>=4,"Use district liquidation when replacement houses are unavailable."); this.s.bankHouses-=4; this.s.bankHotels++; }
    else this.s.bankHouses++;
    d.buildingCosts ??= Array(d.houses).fill(tile.houseCost);
    const refund=d.buildingCosts.pop()!/2;
    d.houses--; this.credit(p.id,refund); this.event(`${p.name} sold one improvement on ${tile.name}.`,"money",{playerId:p.id,position:tile.position,amount:refund});
  }
  mortgage(action: Extract<GameAction,{type:"MORTGAGE"}>) {
    const p=this.manage(action.playerId), tile=getPurchasableTile(action.propertyId,40), d=this.s.properties[action.propertyId];
    requireRule(tile && d?.ownerId===p.id && d.mortgaged!==action.mortgage,"That mortgage cannot be changed.");
    if (action.mortgage) {
      requireRule(tile.kind!=="property" || levels(this.s,tile).every(n=>n===0),"Sell every building in the colour set first.");
      requireRule(canClassicTradeProperty(this.s,tile.position,p.id),"Finish the winning building auction before mortgaging that colour set.");
      d.mortgaged=true; this.credit(p.id,tile.mortgageValue);
    } else { this.spend(p.id,tile.mortgageValue+Math.ceil(tile.mortgageValue/10)); d.mortgaged=false; }
    this.event(`${p.name} ${action.mortgage?"mortgaged":"unmortgaged"} ${tile.name}.`,"money",{playerId:p.id,position:tile.position});
  }
  trade(action: Extract<GameAction,{type:"TRADE_OFFER"}>) {
    this.manage(action.playerId);
    requireRule(action.toPlayerId!==action.playerId && action.offerId && this.player(action.toPlayerId),"Choose another player and an offer ID.");
    const offer: TradeOffer={ id:action.offerId, fromPlayerId:action.playerId, toPlayerId:action.toPlayerId, offeredCash:action.offeredCash, requestedCash:action.requestedCash,
      offeredPropertyIds:[...action.offeredPropertyIds], requestedPropertyIds:[...action.requestedPropertyIds], offeredJailCards:[...(action.offeredJailCards??[])], requestedJailCards:[...(action.requestedJailCards??[])], resumePhase:this.s.phase as TradeOffer["resumePhase"] };
    this.checkTrade(offer); this.s.pendingTrade=offer; this.s.phase="awaitingTradeResponse";
    this.event(`${this.player(action.playerId).name} offered a trade to ${this.player(action.toPlayerId).name}.`,"info",{playerId:action.playerId});
  }
  checkTrade(t: TradeOffer) {
    requireRule(t.offeredPropertyIds.length+t.requestedPropertyIds.length+(t.offeredJailCards?.length??0)+(t.requestedJailCards?.length??0)>0,"Classic trades must include a deed or release card, not an unsecured cash transfer.");
    for (const [id,cash,ids,cards,incoming,received] of [
      [t.fromPlayerId,t.offeredCash,t.offeredPropertyIds,t.offeredJailCards??[],t.requestedCash,t.requestedPropertyIds],
      [t.toPlayerId,t.requestedCash,t.requestedPropertyIds,t.requestedJailCards??[],t.offeredCash,t.offeredPropertyIds]
    ] as const) {
      const p=this.player(id);
      requireRule(cashAmount(cash) && cash<=Math.max(0,classicSpendableCash(this.s,id)) && new Set(ids).size===ids.length && ids.every(i=>canClassicTradeProperty(this.s,i,id)),"Trade cash or deeds are no longer available.");
      requireRule(new Set(cards).size===cards.length && cards.every(deck=>held(p).includes(deck)),"That release card is not available.");
      const fees=received.reduce((n,i)=>n+(this.s.properties[i]?.mortgaged?Math.ceil(getPurchasableTile(i,40)!.mortgageValue/10):0),0);
      requireRule(!fees || classicSpendableCash(this.s,id)-cash+incoming>=fees,"Include enough unreserved cash for the receiver's mortgage interest.");
    }
  }
  accept(action: Extract<GameAction,{type:"TRADE_ACCEPT"}>) {
    const t=this.s.pendingTrade!;
    requireRule(this.s.phase==="awaitingTradeResponse" && t && t.id===action.offerId && t.toPlayerId===action.playerId,"No matching trade to accept.");
    this.checkTrade(t);
    this.player(t.fromPlayerId).cash=cents(this.player(t.fromPlayerId).cash-t.offeredCash); this.player(t.toPlayerId).cash=cents(this.player(t.toPlayerId).cash-t.requestedCash);
    this.credit(t.fromPlayerId,t.requestedCash); this.credit(t.toPlayerId,t.offeredCash);
    for (const [from,to,ids,cards] of [[t.fromPlayerId,t.toPlayerId,t.offeredPropertyIds,t.offeredJailCards??[]],[t.toPlayerId,t.fromPlayerId,t.requestedPropertyIds,t.requestedJailCards??[]]] as const) {
      for (const id of ids) this.s.properties[id]!.ownerId=to;
      this.player(from).jailCardDecks=held(this.player(from)).filter(deck=>!cards.includes(deck)); this.player(to).jailCardDecks=[...held(this.player(to)),...cards];
      this.player(from).getOutOfJailCards=held(this.player(from)).length; this.player(to).getOutOfJailCards=held(this.player(to)).length; this.queueMortgages(to,ids);
    }
    this.s.pendingTrade=undefined; this.s.phase=t.resumePhase;
    this.event(`${this.player(action.playerId).name} accepted the trade.`,"money",{playerId:action.playerId});
  }
  resolveMortgages(action: Extract<GameAction,{type:"RESOLVE_MORTGAGES"}>) {
    const t=this.s.mortgageTransfers?.[0];
    requireRule(this.s.phase==="awaitingMortgageDecision" && t?.playerId===action.playerId,"No mortgage decision is waiting for you.");
    requireRule(new Set(action.redeemPropertyIds).size===action.redeemPropertyIds.length && action.redeemPropertyIds.every(i=>t.propertyIds.includes(i)),"Choose only the received mortgaged deeds.");
    let cost=0;
    for (const id of t.propertyIds) { const tile=getPurchasableTile(id,40)!; cost+=Math.ceil(tile.mortgageValue/10)+(action.redeemPropertyIds.includes(id)?tile.mortgageValue:0); }
    if (action.redeemPropertyIds.length) requireRule(classicSpendableCash(this.s,action.playerId)>=cost,"Choose retention interest if immediate redemption is unaffordable.");
    for (const id of action.redeemPropertyIds) this.s.properties[id]!.mortgaged=false;
    this.s.mortgageTransfers!.shift(); this.pay(action.playerId,"bank",cost,"for received mortgage interest and redemption");
  }
  settle() {
    this.s.debts=this.s.debts?.filter(d=>(d.amount??0)>0 && !owner(this.s,d.playerId)?.bankrupt);
    if (!this.s.debts?.length) { this.s.debts=undefined; if (this.s.phase==="awaitingDebt") this.s.phase=this.s.debtResumePhase??"awaitingEndTurn"; this.s.debtResumePhase=undefined; }
    else if (this.s.phase!=="awaitingDebt" && this.s.phase!=="awaitingTradeResponse") { this.s.debtResumePhase=this.s.phase as DebtResumePhase; this.s.phase="awaitingDebt"; }
    if (live(this.s).length===1) {
      this.s.phase="gameOver"; this.s.winnerId=live(this.s)[0]!.id; this.s.activePlayerId=this.s.winnerId;
      this.s.debts=undefined; this.s.pendingTrade=undefined; this.s.auction=undefined; this.s.suspendedAuction=undefined;
      this.s.bankAuctionQueue=undefined; this.s.mortgageTransfers=undefined; this.s.pendingUtility=undefined; return;
    }
    if (this.s.debts || this.s.pendingTrade) return;
    this.s.mortgageTransfers=this.s.mortgageTransfers?.filter(t=>!owner(this.s,t.playerId)?.bankrupt && t.propertyIds.length);
    if (this.s.mortgageTransfers?.length) {
      if (this.s.phase!=="awaitingMortgageDecision") { this.s.mortgageResumePhase=this.s.phase as DebtResumePhase; this.s.phase="awaitingMortgageDecision"; } return;
    }
    this.s.mortgageTransfers=undefined;
    if (this.s.phase==="awaitingMortgageDecision") { this.s.phase=this.s.mortgageResumePhase??"awaitingEndTurn"; this.s.mortgageResumePhase=undefined; }
    if (!this.s.auction && this.s.bankAuctionQueue?.length) {
      const id=this.s.bankAuctionQueue.shift()!; this.s.auctionResumePhase=this.s.phase as DebtResumePhase;
      if (!this.s.bankAuctionQueue.length) this.s.bankAuctionQueue=undefined;
      this.auction(id);
    }
  }
  apply(action: GameAction) {
    if (action.type==="JOIN") { requireRule(this.s.players.some(p=>p.id===action.player.id),"The game has already started."); return; }
    if (action.type==="SET_APPEARANCE") {
      const p=this.player(action.playerId); requireRule(action.color===undefined,"Token colours are locked after starting.");
      p.tokenId=action.tokenId??p.tokenId; p.diceId=action.diceId??p.diceId; return;
    }
    requireRule(this.s.phase!=="gameOver","This match is complete.");
    if (this.s.phase==="awaitingTradeResponse") requireRule(["TRADE_ACCEPT","TRADE_DECLINE"].includes(action.type),"Reply to or withdraw the trade first.");
    if (this.s.phase==="awaitingMortgageDecision") requireRule(action.type==="RESOLVE_MORTGAGES","Resolve the received mortgages first.");
    if (this.s.phase==="awaitingDebt") requireRule("playerId" in action && this.s.debts?.[0]?.playerId===action.playerId &&
      (action.type==="BANKRUPT" || action.type==="TRADE_OFFER" || action.type==="BUILD" && action.operation!=="build" || action.type==="MORTGAGE" && action.mortgage),"Settle the outstanding debt first.");
    switch (action.type) {
      case "ROLL": this.roll(action.playerId,action.dice); break;
      case "MOVE_RESULT": { const p=this.active(action.playerId,"awaitingMove"), roll=this.s.pendingRoll!; this.move(p.id,(p.position+roll.total)%40,p.position+roll.total>=40); this.s.pendingRoll=undefined; this.land(p.id); break; }
      case "BUY": { const p=this.active(action.playerId,"awaitingBuy"), pending=this.s.pendingPurchase; requireRule(pending?.propertyId===action.propertyId && !this.s.properties[action.propertyId]!.ownerId,"No matching property purchase."); const tile=getPurchasableTile(action.propertyId,40)!; this.spend(p.id,tile.price); this.s.properties[action.propertyId]!.ownerId=p.id; this.s.pendingPurchase=undefined; this.endLanding(); this.event(`${p.name} bought ${tile.name} for ${money(tile.price)}.`,"money",{playerId:p.id,position:tile.position,amount:tile.price}); break; }
      case "DECLINE_BUY": { this.active(action.playerId,"awaitingBuy"); const id=this.s.pendingPurchase!.propertyId; this.s.pendingPurchase=undefined; this.auction(id); break; }
      case "AUCTION_BID": this.bid(action); break;
      case "BUILD": this.build(action); break;
      case "MORTGAGE": this.mortgage(action); break;
      case "TRADE_OFFER": this.trade(action); break;
      case "TRADE_ACCEPT": this.accept(action); break;
      case "TRADE_DECLINE": { const t=this.s.pendingTrade; requireRule(this.s.phase==="awaitingTradeResponse" && t?.id===action.offerId && [t.fromPlayerId,t.toPlayerId].includes(action.playerId),"No matching trade to decline."); this.s.phase=t.resumePhase; this.s.pendingTrade=undefined; this.event(`${this.player(action.playerId).name} ${action.playerId===t.fromPlayerId?"withdrew":"declined"} the trade.`,"info",{playerId:action.playerId}); break; }
      case "RESOLVE_MORTGAGES": this.resolveMortgages(action); break;
      case "BANKRUPT": this.bankrupt(action.playerId); break;
      case "PAY": {
        requireRule(this.s.phase==="awaitingRoll" || this.s.phase==="awaitingJailPayment","No jail payment is waiting.");
        const p=this.player(action.playerId); requireRule(this.s.activePlayerId===p.id && p.inJail,"Only the jailed active player may pay.");
        const pending=this.s.phase==="awaitingJailPayment";
        if (action.kind==="jailCard") { requireRule(!pending && held(p).length,"Use a release card before attempting the third roll."); const deck=action.deck??held(p)[0]!; requireRule(held(p).includes(deck),"That release card is not held."); p.jailCardDecks=held(p).filter(d=>d!==deck); p.getOutOfJailCards=held(p).length; this.s.decks![deck].push(jailCardIndex(deck)); }
        else this.pay(p.id,"bank",50,"to leave Jail");
        p.inJail=false; p.jailTurns=0; this.s.phase=pending?"awaitingMove":"awaitingRoll"; this.event(`${p.name} left Jail.`,"turn",{playerId:p.id}); break;
      }
      case "END_TURN": {
        const p=this.active(action.playerId,"awaitingEndTurn");
        if (this.s.lastRoll?.playerId===p.id && this.s.lastRoll.grantsExtraRoll && !p.inJail) { this.s.phase="awaitingRoll"; this.s.card=undefined; this.event(`${p.name} rolled doubles and goes again.`,"turn",{playerId:p.id}); }
        else this.nextTurn(p.id); break;
      }
      default: throw new RuleViolation("That action is not available in a running Classic match.");
    }
    this.settle();
  }
}

export function startClassic(state: GameState, action: Extract<GameAction,{type:"START"}>): GameState {
  const next=structuredClone(state);
  try {
    const table=new Table(next), rounds=action.setupRolls??[];
    let candidates=next.players.map(p=>p.id), winner="";
    requireRule(rounds.length>0,"Supply the starting dice contest.");
    for (const rolls of rounds) {
      requireRule(!winner && rolls.length===candidates.length && new Set(rolls.map(r=>r.playerId)).size===rolls.length && rolls.every(r=>candidates.includes(r.playerId)&&validDice(r.dice)),"Starting dice must include exactly the tied players.");
      const high=Math.max(...rolls.map(r=>r.dice[0]+r.dice[1]));
      for (const r of rolls) table.event(`${owner(next,r.playerId).name} rolled ${r.dice.join(" + ")} to start.`,"info",{playerId:r.playerId});
      candidates=rolls.filter(r=>r.dice[0]+r.dice[1]===high).map(r=>r.playerId);
      if (candidates.length===1) winner=candidates[0]!;
    }
    requireRule(winner && winner===action.firstPlayerId,"Reroll tied highest players before starting.");
    const decks=action.deckOrder!;
    for (const deck of ["chance","community"] as const) requireRule(decks?.[deck]?.length===16 && new Set(decks[deck]).size===16 && decks[deck].every(i=>whole(i)&&i<16),"Supply a shuffled 16-card order for each deck.");
    next.decks=structuredClone(decks); next.setupRolls=structuredClone(rounds);
    for (const p of next.players) { p.jailCardDecks=[]; p.getOutOfJailCards=0; }
    next.phase="awaitingRoll"; next.activePlayerId=winner; next.notice=undefined; table.event(`${owner(next,winner).name} goes first.`,"turn",{playerId:winner});
    return next;
  } catch (error) { if (!(error instanceof RuleViolation)) throw error; return classicReject(state,error.message); }
}
const classicReject = (state: GameState, message: string) => {
  const next=structuredClone(state); next.notice=message; new Table(next).event(message,"error"); return next;
};
export function reduceClassic(state: GameState, action: GameAction): GameState {
  try { const table=new Table(structuredClone(state)); table.s.notice=undefined; table.apply(action); return table.s; }
  catch (error) { if (!(error instanceof RuleViolation)) throw error; return classicReject(state,error.message); }
}
