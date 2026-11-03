import {colorGroupTiles,getBoard,getPurchasableTile,isPurchasableTile} from './board';
import {classicSpendableCash} from './classic';
import {canTradeProperty,decisionPlayerId,reduceGame} from './reducer';
import type {Dice,GameAction,GameState,Player,TradeOffer} from './types';

const STYLES=[
  {name:'Balanced',reserve:150,bid:1.1,buildReserve:250,trade:1.35},
  {name:'Deal maker',reserve:120,bid:1.15,buildReserve:220,trade:1.55},
  {name:'Builder',reserve:180,bid:1.05,buildReserve:180,trade:1.4},
  {name:'Bold bidder',reserve:80,bid:1.4,buildReserve:200,trade:1.5},
  {name:'Cautious',reserve:280,bid:0.95,buildReserve:350,trade:1.2},
  {name:'Opportunist',reserve:140,bid:1.2,buildReserve:230,trade:1.3}
] as const;
export const botStyle=(p:Player)=>STYLES[Math.max(0,Number(p.id.replace('ai-',''))-1)%STYLES.length]??STYLES[0];
const spendable=(s:GameState,p:Player)=>s.mode==='classic'?classicSpendableCash(s,p.id):p.cash;
const deeds=(s:GameState,p:Player)=>getBoard(s.boardSize).filter(isPurchasableTile).filter(t=>s.properties[t.position]?.ownerId===p.id);
const portfolio=(s:GameState,id:string)=>getBoard(s.boardSize).filter(isPurchasableTile).reduce((value,t)=>{
  const d=s.properties[t.position];if(d?.ownerId!==id)return value;
  const complete=t.kind==='property'&&colorGroupTiles(t.group,s.boardSize).every(m=>s.properties[m.position]?.ownerId===id);
  return value+t.price*(complete?1.7:1)-(d.mortgaged?t.mortgageValue:0);
},0);

function tradeDelta(s:GameState,t:TradeOffer,p:Player) {
  const properties={...s.properties};
  for(const id of t.offeredPropertyIds)properties[id]={...properties[id]!,ownerId:t.toPlayerId};
  for(const id of t.requestedPropertyIds)properties[id]={...properties[id]!,ownerId:t.fromPlayerId};
  return t.offeredCash-t.requestedCash+portfolio({...s,properties},p.id)-portfolio(s,p.id)+25*((t.offeredJailCards?.length??0)-(t.requestedJailCards?.length??0));
}

// Candidates pass through the real rules engine, including scarce-building and debt rules.
export function nextBotAction(s:GameState,dice:Dice=[1,2]):GameAction|undefined {
  if(s.phase==='lobby'||s.phase==='gameOver')return;
  const bot=(id?:string)=>s.players.find(p=>p.id===id&&p.bot&&!p.bankrupt);
  const legal=(action:GameAction)=>{const next=reduceGame(s,action);return !next.notice&&JSON.stringify(next)!==JSON.stringify(s);};
  const first=(actions:GameAction[])=>actions.find(legal);
  if(s.rentClaim&&bot(s.rentClaim.ownerId)){
    const claim={type:'CLAIM_RENT',playerId:s.rentClaim.ownerId,claimId:s.rentClaim.id} as const;
    if(legal(claim))return claim;
  }
  if(s.phase==='awaitingTradeResponse'&&s.pendingTrade){
    const t=s.pendingTrade,p=bot(t.toPlayerId);if(!p)return;
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
    const style=botStyle(p),tile=getPurchasableTile(a.propertyId,s.boardSize),building=a.kind==='house'||a.kind==='hotel';
    const target=building?a.buildTargets?.[p.id]?.[0]:undefined;
    const complete=tile?.kind==='property'&&colorGroupTiles(tile.group,s.boardSize).every(t=>t.position===tile.position||s.properties[t.position]?.ownerId===p.id);
    const limit=Math.min(Math.max(0,p.cash-style.reserve),tile?(building&&tile.kind==='property'?tile.houseCost*1.5:tile.price*(complete?1.7:style.bid)):0);
    const increment=style.bid>1.2&&limit-a.currentBid>60?20:10,amount=Math.max(10,a.currentBid+increment);
    const bid:GameAction={type:'AUCTION_BID',playerId:p.id,amount,propertyId:target};
    return amount<=limit&&legal(bid)?bid:{type:'AUCTION_BID',playerId:p.id,pass:true};
  }
  const p=bot(decisionPlayerId(s));if(!p)return;
  const playerId=p.id,owned=deeds(s,p),cash=spendable(s,p),style=botStyle(p);
  if(s.phase==='awaitingDebt'){
    const improved=owned.filter(t=>s.properties[t.position]!.houses>0).sort((a,b)=>s.properties[b.position]!.houses-s.properties[a.position]!.houses);
    return first([
      ...improved.map(t=>({type:'BUILD',playerId,propertyId:t.position,operation:'sell'} as const)),
      ...improved.map(t=>({type:'BUILD',playerId,propertyId:t.position,operation:'sellGroup'} as const)),
      ...owned.filter(t=>!s.properties[t.position]!.mortgaged).map(t=>({type:'MORTGAGE',playerId,propertyId:t.position,mortgage:true} as const)),
      {type:'BANKRUPT',playerId}
    ]);
  }
  if(s.phase==='awaitingMortgageDecision')return {type:'RESOLVE_MORTGAGES',playerId,redeemPropertyIds:[]};
  if(s.phase==='awaitingJailPayment')return first([{type:'PAY',playerId,kind:'jailCard'},{type:'PAY',playerId,kind:'jailFine'}]);
  if(s.phase==='awaitingUtilityRoll')return {type:'ROLL',playerId,dice};
  if(s.phase==='awaitingRoll'){
    if(p.inJail){
      const release=first([{type:'PAY',playerId,kind:'jailCard'},...(cash>=250?[{type:'PAY',playerId,kind:'jailFine'} as const]:[])]);
      if(release)return release;
    }
    return {type:'ROLL',playerId,dice};
  }
  if(s.phase==='awaitingMove')return {type:'MOVE_RESULT',playerId};
  if(s.phase==='awaitingBuy'&&s.pendingPurchase){
    const propertyId=s.pendingPurchase.propertyId,tile=getPurchasableTile(propertyId,s.boardSize);
    const buy={type:'BUY',playerId,propertyId} as const;
    const complete=tile?.kind==='property'&&colorGroupTiles(tile.group,s.boardSize).every(t=>t.position===tile.position||s.properties[t.position]?.ownerId===p.id);
    return tile&&cash>=tile.price+(complete?50:style.reserve)&&legal(buy)?buy:{type:'DECLINE_BUY',playerId};
  }
  if(s.phase==='awaitingEndTurn'){
    const finance=first([
      ...owned.filter(t=>s.properties[t.position]!.mortgaged&&cash>=t.mortgageValue*1.1+style.buildReserve).map(t=>({type:'MORTGAGE',playerId,propertyId:t.position,mortgage:false} as const)),
      ...owned.filter(t=>t.kind==='property'&&s.properties[t.position]!.houses<5&&cash>=t.houseCost+style.buildReserve).sort((a,b)=>s.properties[a.position]!.houses-s.properties[b.position]!.houses).map(t=>({type:'BUILD',playerId,propertyId:t.position,operation:'build'} as const))
    ]);
    if(finance)return finance;
    if(!p.botTradeOffered&&cash>=400){
      for(const t of getBoard(s.boardSize)){
        if(t.kind!=='property'||!s.properties[t.position]?.ownerId||s.properties[t.position]?.ownerId===playerId)continue;
        const group=colorGroupTiles(t.group,s.boardSize),partner=s.properties[t.position]!.ownerId!;
        if(!group.every(m=>m.position===t.position||s.properties[m.position]?.ownerId===playerId)||!canTradeProperty(s,t.position,partner))continue;
        const offeredCash=Math.ceil(t.price*style.trade);
        const offer:GameAction={type:'TRADE_OFFER',playerId,offerId:`ai-offer-${s.nextEventId}`,toPlayerId:partner,offeredCash,requestedCash:0,offeredPropertyIds:[],requestedPropertyIds:[t.position]};
        if(cash>=offeredCash+200&&legal(offer))return offer;
      }
    }
    return {type:'END_TURN',playerId};
  }
}
