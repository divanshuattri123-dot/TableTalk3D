import { describe, expect, it } from "vitest";
import { createInitialState, reduceGame } from "./reducer";
import { CLASSIC_CARDS, jailCardIndex } from "./classicCards";
import { classicLiquidationValue } from "./classic";
import type { CardDeck, GameAction, GameState } from "./types";

const order = (top=0) => [top,...Array.from({length:16},(_,i)=>i).filter(i=>i!==top)];
export function classicGame(count=3): GameState {
  let s=createInitialState("CLSC");
  for(let i=1;i<=count;i++) s=reduceGame(s,{type:"JOIN",player:{id:"p"+i,name:"Classic "+i,color:["red","blue","green","yellow","purple","pink"][i-1]!}});
  s=reduceGame(s,{type:"SET_MODE",playerId:"p1",mode:"classic"});
  return reduceGame(s,{type:"START",playerId:"p1",firstPlayerId:"p1",deckOrder:{chance:order(),community:order()},setupRolls:[s.players.map((p,i)=>({playerId:p.id,dice:i===0?[6,6]:[1,2]}))]});
}
const p=(s:GameState,id="p1")=>s.players.find(p=>p.id===id)!;
const own=(s:GameState,id:string,ids:number[],houses=0,mortgaged=false)=>{ for(const i of ids)s.properties[i]={ownerId:id,houses:houses as 0|1|2|3|4|5,mortgaged}; return s; };
const apply=(s:GameState,action:GameAction)=>{const before=JSON.stringify([s,action]), next=reduceGame(s,action);expect(JSON.stringify([s,action])).toBe(before);expect(reduceGame(s,action)).toEqual(next);expect(next.notice).toBeUndefined();return next;};
const land=(s:GameState,from:number,dice:readonly[number,number]=[3,4])=>{p(s).position=from; s.phase="awaitingRoll";s.activePlayerId="p1"; s=apply(s,{type:"ROLL",playerId:"p1",dice});return apply(s,{type:"MOVE_RESULT",playerId:"p1"});};
const draw=(s:GameState,deck:CardDeck,index:number)=>{s.decks![deck]=order(index);return land(s,0,deck==="chance"?[3,4]:[1,1]);};
const offer=(s:GameState,patch:Partial<Extract<GameAction,{type:"TRADE_OFFER"}>>={})=>apply(s,{type:"TRADE_OFFER",playerId:"p1",offerId:"deal",toPlayerId:"p2",offeredCash:0,requestedCash:0,offeredPropertyIds:[1],requestedPropertyIds:[],...patch});

describe("separate Classic rules",()=>{
  it.each([2,3,4,5,6])("keeps %i-player Classic on 40 spaces with classic stock",count=>{
    const s=classicGame(count);expect(s.mode).toBe("classic");expect(s.boardSize).toBe(40);expect(s.bankHouses).toBe(32);expect(s.bankHotels).toBe(12);expect(s.activePlayerId).toBe("p1");expect(s.decks!.chance).toHaveLength(16);
  });
  it("never changes an existing Expanding save and restricts mode selection to the lobby host",()=>{
    let s=createInitialState("OLD");for(let i=1;i<=4;i++)s=reduceGame(s,{type:"JOIN",player:{id:"p"+i,name:"P"+i,color:["red","blue","green","yellow"][i-1]!}});
    expect(s.mode).toBeUndefined();expect(s.boardSize).toBe(48);
    expect(reduceGame(s,{type:"SET_MODE",playerId:"p2",mode:"classic"}).boardSize).toBe(48);
    s=apply(s,{type:"START",playerId:"p1",firstPlayerId:"p1"});const old=JSON.stringify(s);
    expect(reduceGame(s,{type:"SET_MODE",playerId:"p1",mode:"classic"}).boardSize).toBe(48);expect(JSON.stringify(s)).toBe(old);
  });
  it("rerolls only tied highest starting players and rejects incomplete decks",()=>{
    let s=createInitialState("TIES");
    for(let i=1;i<=3;i++)s=reduceGame(s,{type:"JOIN",player:{id:"p"+i,name:"P"+i,color:["red","blue","green"][i-1]!}});
    s=apply(s,{type:"SET_MODE",playerId:"p1",mode:"classic"});
    const start:Extract<GameAction,{type:"START"}>={type:"START",playerId:"p1",firstPlayerId:"p2",deckOrder:{chance:order(),community:order()},setupRolls:[[{playerId:"p1",dice:[6,6]},{playerId:"p2",dice:[6,6]},{playerId:"p3",dice:[1,2]}],[{playerId:"p1",dice:[1,2]},{playerId:"p2",dice:[3,4]}]]};
    expect(apply(s,start).activePlayerId).toBe("p2");
    expect(reduceGame(s,{...start,deckOrder:{chance:[0,0],community:order()}}).phase).toBe("lobby");
    expect(reduceGame(s,{...start,setupRolls:start.setupRolls!.slice(0,1)}).phase).toBe("lobby");
  });
  it.each(["chance","community"] as const)("applies every one of the 16 %s effects deterministically",deck=>{
    CLASSIC_CARDS[deck].forEach((card,index)=>{const s=draw(classicGame(),deck,index);expect(s.eventLog.some(e=>e.kind==="card"&&e.cardIndex===index&&e.deck===deck)).toBe(true);expect(card.text.length).toBeGreaterThan(15);});
  });
  it("cycles drawn cards to the bottom but removes held release cards",()=>{
    let s=draw(classicGame(),"chance",7);expect(s.decks!.chance.at(-1)).toBe(7);expect(p(s).cash).toBe(1550);
    s=draw(classicGame(),"chance",8);expect(s.decks!.chance).not.toContain(8);expect(s.decks!.chance).toHaveLength(15);expect(p(s).jailCardDecks).toEqual(["chance"]);expect(p(s).getOutOfJailCards).toBe(1);
    p(s).inJail=true;s.phase="awaitingRoll";
    s=apply(s,{type:"PAY",playerId:"p1",kind:"jailCard",deck:"chance"});
    expect(s.decks!.chance.at(-1)).toBe(8);expect(s.decks!.chance).toHaveLength(16);expect(p(s).getOutOfJailCards).toBe(0);
  });
  it("trades real release cards and returns them to the correct deck when used",()=>{
    let s=draw(classicGame(),"community",4);s.phase="awaitingRoll";
    s=offer(s,{offeredPropertyIds:[],offeredJailCards:["community"],requestedCash:20});
    s=apply(s,{type:"TRADE_ACCEPT",playerId:"p2",offerId:"deal"});expect(p(s,"p2").jailCardDecks).toEqual(["community"]);expect(p(s).getOutOfJailCards).toBe(0);
    s.activePlayerId="p2";p(s,"p2").inJail=true;
    s=apply(s,{type:"PAY",playerId:"p2",kind:"jailCard"});expect(s.decks!.community.at(-1)).toBe(4);expect(p(s,"p2").cash).toBe(1480);
  });
  it("uses fresh utility dice without changing movement dice or granting extra movement",()=>{
    let s=land(own(classicGame(),"p2",[12]),9,[1,2]);expect(s.phase).toBe("awaitingUtilityRoll");expect(p(s).cash).toBe(1500);
    s=apply(s,{type:"ROLL",playerId:"p1",dice:[5,5]});expect(p(s).position).toBe(12);expect(p(s).cash).toBe(1460);expect(s.lastRoll!.dice).toEqual([1,2]);
    s=apply(s,{type:"END_TURN",playerId:"p1"});expect(s.activePlayerId).toBe("p2");
  });
  it("preserves a movement double through the separate utility roll",()=>{
    let s=land(own(classicGame(),"p2",[12]),10,[1,1]);s=apply(s,{type:"ROLL",playerId:"p1",dice:[1,2]});s=apply(s,{type:"END_TURN",playerId:"p1"});expect(s.activePlayerId).toBe("p1");expect(s.phase).toBe("awaitingRoll");
  });
  it("uses the nearest-utility card's 10x fresh roll, never 4x or the movement roll",()=>{
    let s=draw(own(classicGame(),"p2",[12]),"chance",6);expect(s.pendingUtility?.multiplier).toBe(10);
    s=apply(s,{type:"ROLL",playerId:"p1",dice:[1,2]});expect(p(s).cash).toBe(1470);
    expect(draw(classicGame(),"chance",6).phase).toBe("awaitingBuy");
  });
  it.each([4,5])("charges double railway rent for Chance railroad card %i",index=>{
    const s=draw(own(classicGame(),"p2",[5,15,25,35]),"chance",index);expect(p(s).cash).toBe(1100);expect(p(s).position).toBe(15);
  });
  it("chains back-three into the actual next Community card and pays GO once",()=>{
    let s=classicGame();s.decks!.chance=order(9);s.decks!.community=order(0);s=land(s,29);
    expect(p(s).position).toBe(0);expect(p(s).cash).toBe(1700);expect(s.eventLog.filter(e=>e.kind==="card")).toHaveLength(2);
  });
  it.each([["chance",11,175],["community",13,235]] as const)("counts a hotel as a hotel for %s repairs", (deck,index,cost)=>{
    const s=own(own(classicGame(),"p1",[1],5),"p1",[3],3);
    expect(p(draw(s,deck,index)).cash).toBe(1500-cost);
  });
  it("tracks multiple unpaid recipients separately and repays each exactly once",()=>{
    let s=own(classicGame(),"p1",[39]);p(s).cash=20;s=draw(s,"chance",14);
    expect(p(s).cash).toBe(-80);expect(s.debts?.map(d=>[d.creditorId,d.amount])).toEqual([["p2",30],["p3",50]]);expect(p(s,"p2").cash).toBe(1520);expect(p(s,"p3").cash).toBe(1500);
    s=apply(s,{type:"MORTGAGE",playerId:"p1",propertyId:39,mortgage:true});
    expect(p(s).cash).toBe(120);expect(p(s,"p2").cash).toBe(1550);expect(p(s,"p3").cash).toBe(1550);expect(s.debts).toBeUndefined();expect(s.phase).toBe("awaitingEndTurn");
  });
  it("collects the birthday amount from each other solvent player",()=>{
    const s=draw(classicGame(),"community",8);expect(p(s).cash).toBe(1520);expect(p(s,"p2").cash).toBe(1490);expect(p(s,"p3").cash).toBe(1490);
  });
  it("allows off-turn finances without losing an interrupted purchase",()=>{
    let s=own(classicGame(),"p2",[1,3]);s=land(s,0,[2,4]);const pending=structuredClone(s.pendingPurchase);
    s=apply(s,{type:"BUILD",playerId:"p2",propertyId:1,operation:"build"});
    expect(s.phase).toBe("awaitingBuy");expect(s.activePlayerId).toBe("p1");expect(s.pendingPurchase).toEqual(pending);expect(s.properties[1]!.houses).toBe(1);
  });
  it("reserves the leading auction bid against off-turn purchases and cash trades",()=>{
    let s=own(classicGame(),"p2",[1,3]);s=land(s,0,[2,4]);s=apply(s,{type:"DECLINE_BUY",playerId:"p1"});
    s=apply(s,{type:"AUCTION_BID",playerId:"p2",amount:1490});
    expect(reduceGame(s,{type:"BUILD",playerId:"p2",propertyId:1,operation:"build"}).properties[1]!.houses).toBe(0);
    expect(reduceGame(s,{type:"TRADE_OFFER",playerId:"p2",offerId:"bad",toPlayerId:"p3",offeredCash:20,requestedCash:0,offeredPropertyIds:[1],requestedPropertyIds:[]}).pendingTrade).toBeUndefined();
  });
  it("opens bidding at ten and lets previous passers re-enter a higher price round",()=>{
    let s=land(classicGame(),0,[1,2]);s=apply(s,{type:"DECLINE_BUY",playerId:"p1"});
    expect(reduceGame(s,{type:"AUCTION_BID",playerId:"p1",amount:1}).auction!.currentBid).toBe(0);
    s=apply(s,{type:"AUCTION_BID",playerId:"p1",amount:10});s=apply(s,{type:"AUCTION_BID",playerId:"p2",pass:true});
    s=apply(s,{type:"AUCTION_BID",playerId:"p3",amount:20});expect(s.auction!.passedPlayerIds).toEqual([]);
    s=apply(s,{type:"AUCTION_BID",playerId:"p2",amount:30});for(const id of ["p1","p3"])s=apply(s,{type:"AUCTION_BID",playerId:id,pass:true});
    expect(s.properties[3]!.ownerId).toBe("p2");expect(p(s,"p2").cash).toBe(1470);
  });
  it("auctions the last house among eligible owners and builds at the winner's chosen target",()=>{
    let s=own(own(classicGame(),"p1",[1,3]),"p2",[6,8,9]);s.bankHouses=1;
    s=apply(s,{type:"BUILD",playerId:"p1",propertyId:1,operation:"build"});expect(s.auction?.kind).toBe("house");
    s=apply(s,{type:"AUCTION_BID",playerId:"p2",amount:20,propertyId:9});s=apply(s,{type:"AUCTION_BID",playerId:"p1",pass:true});
    expect(s.bankHouses).toBe(0);expect(s.properties[9]!.houses).toBe(1);expect(s.properties[9]!.ownerId).toBe("p2");expect(p(s,"p2").cash).toBe(1480);expect(s.phase).toBe("awaitingRoll");
  });
  it("refunds half the actual auction building cost, including fifty paise",()=>{
    let s=own(own(classicGame(),"p1",[1,3]),"p2",[6,8,9]);s.bankHouses=1;
    s=apply(s,{type:"BUILD",playerId:"p1",propertyId:1,operation:"build"});
    s=apply(s,{type:"AUCTION_BID",playerId:"p2",amount:11,propertyId:9});
    expect(reduceGame(s,{type:"MORTGAGE",playerId:"p2",propertyId:6,mortgage:true}).properties[6]!.mortgaged).toBe(false);
    s=apply(s,{type:"AUCTION_BID",playerId:"p1",pass:true});
    expect(s.properties[9]!.buildingCosts).toEqual([11]);
    s=apply(s,{type:"BUILD",playerId:"p2",propertyId:9,operation:"sell"});expect(p(s,"p2").cash).toBe(1494.5);
    s=offer(s,{offeredPropertyIds:[1],requestedCash:0.5});
    s=apply(s,{type:"TRADE_ACCEPT",playerId:"p2",offerId:"deal"});expect(p(s).cash).toBe(1500.5);
  });
  it("keeps the four original house costs when selling a hotel back",()=>{
    let s=own(classicGame(),"p1",[1,3],4);s.bankHouses=24;
    s.properties[1]!.buildingCosts=[11,50,50,50];
    s=apply(s,{type:"BUILD",playerId:"p1",propertyId:1,operation:"build"});expect(s.properties[1]!.buildingCosts).toEqual([11,50,50,50,50]);
    s=apply(s,{type:"BUILD",playerId:"p1",propertyId:1,operation:"sell"});expect(s.properties[1]!.buildingCosts).toEqual([11,50,50,50]);expect(p(s).cash).toBe(1475);expect(s.bankHouses).toBe(24);
  });
  it("does not accumulate binary rounding dust across repeated fractional trades",()=>{
    let s=own(classicGame(),"p1",[1]);
    for(let i=0;i<10;i++)for(const [from,to,cash] of [["p1","p2",0.1],["p2","p1",0.2]] as const){
      s=apply(s,{type:"TRADE_OFFER",playerId:from,offerId:`cents-${i}-${from}`,toPlayerId:to,offeredCash:cash,requestedCash:0,offeredPropertyIds:[1],requestedPropertyIds:[]});
      s=apply(s,{type:"TRADE_ACCEPT",playerId:to,offerId:s.pendingTrade!.id});
    }
    expect(p(s).cash).toBe(1501);expect(p(s,"p2").cash).toBe(1499);
  });
  it("offers retention interest or immediate redemption on received mortgages",()=>{
    let s=offer(own(classicGame(),"p1",[1],0,true));s=apply(s,{type:"TRADE_ACCEPT",playerId:"p2",offerId:"deal"});
    expect(s.phase).toBe("awaitingMortgageDecision");expect(s.activePlayerId).toBe("p1");
    const redeemed=apply(s,{type:"RESOLVE_MORTGAGES",playerId:"p2",redeemPropertyIds:[1]});
    expect(p(redeemed,"p2").cash).toBe(1467);expect(redeemed.properties[1]!.mortgaged).toBe(false);expect(redeemed.phase).toBe("awaitingRoll");
    s=apply(s,{type:"RESOLVE_MORTGAGES",playerId:"p2",redeemPropertyIds:[]});expect(p(s,"p2").cash).toBe(1497);
    s=apply(s,{type:"MORTGAGE",playerId:"p2",propertyId:1,mortgage:false});expect(p(s,"p2").cash).toBe(1464);
  });
  it("settles both receivers' mortgage choices before the original turn resumes",()=>{
    let s=own(own(classicGame(),"p1",[1],0,true),"p2",[3],0,true);
    s=offer(s,{requestedPropertyIds:[3]});s=apply(s,{type:"TRADE_ACCEPT",playerId:"p2",offerId:"deal"});
    s=apply(s,{type:"RESOLVE_MORTGAGES",playerId:"p2",redeemPropertyIds:[]});expect(s.phase).toBe("awaitingMortgageDecision");
    s=apply(s,{type:"RESOLVE_MORTGAGES",playerId:"p1",redeemPropertyIds:[3]});expect(s.phase).toBe("awaitingRoll");expect(p(s).cash).toBe(1467);expect(p(s,"p2").cash).toBe(1497);
  });
  it("does not permit surrender while available liquidation can cover the debt",()=>{
    const s=own(classicGame(),"p1",[39]);s.phase="awaitingDebt";s.debtResumePhase="awaitingEndTurn";p(s).cash=-10;s.debts=[{playerId:"p1",creditorId:"bank",reason:"tax",amount:10}];
    expect(classicLiquidationValue(s,"p1")).toBe(190);
    expect(reduceGame(s,{type:"BANKRUPT",playerId:"p1"}).players[0]!.bankrupt).toBe(false);
  });
  it("preserves the third failed jail dice through fine settlement and disallows a late card",()=>{
    let s=own(classicGame(),"p1",[39]);p(s).inJail=true;p(s).position=10;p(s).jailTurns=2;p(s).cash=10;p(s).jailCardDecks=["chance"];p(s).getOutOfJailCards=1;s.decks!.chance=s.decks!.chance.filter(i=>i!==8);
    s=apply(s,{type:"ROLL",playerId:"p1",dice:[1,2]});expect(s.phase).toBe("awaitingJailPayment");
    expect(reduceGame(s,{type:"PAY",playerId:"p1",kind:"jailCard"}).phase).toBe("awaitingJailPayment");
    s=apply(s,{type:"PAY",playerId:"p1",kind:"jailFine"});expect(s.phase).toBe("awaitingDebt");expect(s.debtResumePhase).toBe("awaitingMove");
    s=apply(s,{type:"MORTGAGE",playerId:"p1",propertyId:39,mortgage:true});expect(s.pendingRoll?.total).toBe(3);expect(s.phase).toBe("awaitingMove");
    s=apply(s,{type:"MOVE_RESULT",playerId:"p1"});expect(p(s).position).toBe(13);expect(p(s).cash).toBe(160);
  });
  it("returns cards and auctions the bank's repossessed unmortgaged deeds",()=>{
    let s=own(classicGame(),"p1",[1],0,true);s.phase="awaitingDebt";s.debtResumePhase="awaitingEndTurn";p(s).cash=-100;p(s).jailCardDecks=["community"];p(s).getOutOfJailCards=1;s.decks!.community=s.decks!.community.filter(i=>i!==jailCardIndex("community"));s.debts=[{playerId:"p1",creditorId:"bank",reason:"tax",amount:100}];
    s=apply(s,{type:"BANKRUPT",playerId:"p1"});expect(s.auction?.propertyId).toBe(1);expect(s.properties[1]!.mortgaged).toBe(false);expect(s.decks!.community.at(-1)).toBe(4);expect(s.activePlayerId).toBe("p2");
  });
  it("handles a mortgage-interest bankruptcy chain without stopping the next turn",()=>{
    let s=own(classicGame(4),"p1",[1],0,true);s.phase="awaitingDebt";s.debtResumePhase="awaitingEndTurn";p(s).cash=-100;p(s,"p2").cash=0;s.debts=[{playerId:"p1",creditorId:"p2",reason:"rent",amount:100}];
    s=apply(s,{type:"BANKRUPT",playerId:"p1"});expect(s.phase).toBe("awaitingMortgageDecision");
    s=apply(s,{type:"RESOLVE_MORTGAGES",playerId:"p2",redeemPropertyIds:[]});expect(s.phase).toBe("awaitingDebt");expect(p(s,"p2").cash).toBe(-3);
    s=apply(s,{type:"BANKRUPT",playerId:"p2"});expect(s.phase).toBe("awaitingAuction");expect(s.auction?.propertyId).toBe(1);expect(s.activePlayerId).toBe("p3");
  });
});
