import { describe, expect, it } from "vitest";
import { BOARD, colorGroupTiles, isPurchasableTile } from "./board";
import { classicSpendableCash } from "./classic";
import { jailCardIndex } from "./classicCards";
import { createInitialState, reduceGame } from "./reducer";
import type { GameAction } from "./types";

const rng = (seed: number) => () => { seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/2**32; };
describe("complete Classic matches through public actions",()=>{
  it.each([2,3,4,5,6])("finishes seeded %i-player games while preserving cash, decks and building stock",count=>{
    for(const seed of [17,193,722]) {
      const random=rng(seed), colours=["red","blue","green","yellow","purple","pink"];
      const shuffled=()=>Array.from({length:16},(_,i)=>i).map(i=>({i,k:random()})).sort((a,b)=>a.k-b.k).map(e=>e.i);
      let s=createInitialState("CLQA"), steps=0, tradesThisTurn=0;
      const apply=(action:GameAction)=>{
        const before=JSON.stringify([s,action]), next=reduceGame(s,action);
        expect(JSON.stringify([s,action])).toBe(before);expect(next.notice,`${seed}/${count}/${steps} ${JSON.stringify(action)}`).toBeUndefined();
        expect(reduceGame(s,action)).toEqual(next);s=next;steps++;
        if(s.mode!=="classic")return;
        const properties=Object.values(s.properties);
        expect(s.boardSize).toBe(40);expect(s.bankHouses+properties.reduce((n,p)=>n+(p.houses===5?0:p.houses),0)).toBe(32);
        expect(s.bankHotels+properties.filter(p=>p.houses===5).length).toBe(12);expect(s.bankHouses).toBeGreaterThanOrEqual(0);expect(s.bankHotels).toBeGreaterThanOrEqual(0);
        expect(s.players.every(p=>Number.isSafeInteger(p.cash*100) && p.position>=0 && p.position<40)).toBe(true);
        if(s.phase!=="lobby" && s.phase!=="gameOver")expect(s.players.find(p=>p.id===s.activePlayerId)?.bankrupt).toBe(false);
        if(s.phase!=="gameOver" && s.players.some(p=>!p.bankrupt && p.cash<0))expect(["awaitingDebt","awaitingTradeResponse"]).toContain(s.phase);
        for(const p of properties) {
          if(p.ownerId)expect(s.players.find(player=>player.id===p.ownerId)?.bankrupt).toBe(false);
          if(p.buildingCosts)expect(p.buildingCosts).toHaveLength(p.houses);
        }
        if(s.decks)for(const deck of ["chance","community"] as const) {
          const held=s.players.filter(p=>p.jailCardDecks?.includes(deck)).length, cards=s.decks[deck];
          expect(new Set(cards).size).toBe(cards.length);expect(cards.length+held).toBe(16);
          expect(cards.filter(i=>i===jailCardIndex(deck)).length+held).toBe(1);
        }
        if(s.phase!=="gameOver")for(const p of s.players.filter(p=>!p.bankrupt))expect((s.debts??[]).filter(d=>d.playerId===p.id).reduce((n,d)=>n+(d.amount??0),0)).toBe(Math.max(0,-p.cash));
      };
      for(let i=0;i<count;i++)apply({type:"JOIN",player:{id:"p"+i,name:"QA "+i,color:colours[i]!}});
      apply({type:"SET_MODE",playerId:"p0",mode:"classic"});
      apply({type:"START",playerId:"p0",firstPlayerId:"p0",deckOrder:{chance:shuffled(),community:shuffled()},setupRolls:[s.players.map((p,i)=>({playerId:p.id,dice:i===0?[6,6]:[1,2]}))]});
      while(s.phase!=="gameOver" && steps<20000) {
        const id=s.activePlayerId!, player=s.players.find(p=>p.id===id)!;
        if(s.phase==="awaitingEndTurn") {
          const redeem=BOARD.find(t=>isPurchasableTile(t) && s.properties[t.position]!.ownerId===id && s.properties[t.position]!.mortgaged && classicSpendableCash(s,id)>=t.mortgageValue+Math.ceil(t.mortgageValue/10)+100);
          if(redeem){apply({type:"MORTGAGE",playerId:id,propertyId:redeem.position,mortgage:false});continue;}
          const build=BOARD.find(t=>t.kind==="property" && s.properties[t.position]!.ownerId===id &&
            colorGroupTiles(t.group,40).every(m=>s.properties[m.position]!.ownerId===id && !s.properties[m.position]!.mortgaged) &&
            s.properties[t.position]!.houses<5 && classicSpendableCash(s,id)>=t.houseCost+70 &&
            s.properties[t.position]!.houses===Math.min(...colorGroupTiles(t.group,40).map(m=>s.properties[m.position]!.houses)) &&
            (s.properties[t.position]!.houses===4?s.bankHotels>0:s.bankHouses>0));
          if(build){apply({type:"BUILD",playerId:id,propertyId:build.position,operation:"build"});continue;}
          // Cooperative agents consolidate districts so tests reach hotels and elimination.
          const districtBuyer=(group:string)=>s.players.filter(p=>!p.bankrupt).map(p=>({id:p.id,count:BOARD.filter(t=>t.kind==="property" && t.group===group && s.properties[t.position]!.ownerId===p.id).length})).sort((a,b)=>b.count-a.count)[0]!.id;
          const deed=BOARD.find(t=>t.kind==="property" && s.properties[t.position]!.ownerId===id && !s.properties[t.position]!.mortgaged &&
            colorGroupTiles(t.group,40).every(m=>!s.properties[m.position]!.houses) &&
            districtBuyer(t.group)!==id);
          if(deed?.kind==="property" && tradesThisTurn<1) {
            const to=districtBuyer(deed.group);
            if(classicSpendableCash(s,to)>=40){tradesThisTurn++;apply({type:"TRADE_OFFER",playerId:id,offerId:"qa-"+steps,toPlayerId:to,offeredCash:0,requestedCash:40,offeredPropertyIds:[deed.position],requestedPropertyIds:[]});continue;}
          }
        }
        switch(s.phase) {
          case "awaitingRoll": case "awaitingUtilityRoll": apply({type:"ROLL",playerId:id,dice:[1+Math.floor(random()*6),1+Math.floor(random()*6)]});break;
          case "awaitingMove":apply({type:"MOVE_RESULT",playerId:id});break;
          case "awaitingBuy":{const t=BOARD[s.pendingPurchase!.propertyId]!;apply(isPurchasableTile(t) && classicSpendableCash(s,id)>=t.price+50?{type:"BUY",playerId:id,propertyId:t.position}:{type:"DECLINE_BUY",playerId:id});break;}
          case "awaitingAuction":{
            const a=s.auction!, candidate=a.eligiblePlayerIds.find(p=>p!==a.highestBidderId && !a.passedPlayerIds.includes(p))!;
            const bid=Math.max(10,a.currentBid+10), available=s.players.find(p=>p.id===candidate)!.cash-(s.suspendedAuction?.highestBidderId===candidate?s.suspendedAuction.currentBid:0);
            apply({type:"AUCTION_BID",playerId:candidate,...(available>=bid+50 && bid<150?{amount:bid,propertyId:a.buildTargets?.[candidate]?.[0]}:{pass:true})});break;
          }
          case "awaitingTradeResponse":apply({type:"TRADE_ACCEPT",playerId:s.pendingTrade!.toPlayerId,offerId:s.pendingTrade!.id});break;
          case "awaitingMortgageDecision":apply({type:"RESOLVE_MORTGAGES",playerId:s.mortgageTransfers![0]!.playerId,redeemPropertyIds:[]});break;
          case "awaitingJailPayment":apply({type:"PAY",playerId:id,kind:"jailFine"});break;
          case "awaitingDebt":{
            const debtor=s.debts![0]!.playerId, improved=BOARD.find(t=>t.kind==="property" && s.properties[t.position]!.ownerId===debtor && s.properties[t.position]!.houses), mortgage=BOARD.find(t=>isPurchasableTile(t) && s.properties[t.position]!.ownerId===debtor && !s.properties[t.position]!.mortgaged);
            apply(improved?{type:"BUILD",playerId:debtor,propertyId:improved.position,operation:"sellGroup"}:mortgage?{type:"MORTGAGE",playerId:debtor,propertyId:mortgage.position,mortgage:true}:{type:"BANKRUPT",playerId:debtor});break;
          }
          case "awaitingEndTurn":tradesThisTurn=0;apply({type:"END_TURN",playerId:id});break;
          default:throw new Error("Unplayable Classic phase "+s.phase);
        }
      }
      expect(s.phase,`${seed}/${count} after ${steps} actions`).toBe("gameOver");expect(s.players.filter(p=>!p.bankrupt)).toHaveLength(1);expect(s.winnerId).toBe(s.players.find(p=>!p.bankrupt)!.id);
    }
  },120000);
});
