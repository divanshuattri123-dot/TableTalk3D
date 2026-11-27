import { usesClassicRules } from "./rules";
import {colorGroupTiles,getBoard,getPurchasableTile,isPurchasableTile} from './board';
import {classicSpendableCash} from './classic';
import {calculateRent,canTradeProperty,decisionPlayerId,reduceGame} from './reducer';
import {DUEL_VETO_COST,auctionCredit,canChallengeCityProject,cityLoanAvailable,cityLoanBalance,cityPolicyAvailable,citySeizedOwner,cityStable,propertyPermitLocked,LOAN_AMOUNT,MAYOR_MOVE_SPACES,mayorCanGrantLoan,mayorCanReleaseJail,PERMIT_LOCK_COUNT,nextAuditMiss,reserveLevy,trainOffer} from './mayor';
import type {Dice,GameAction,GameState,Player,TradeOffer} from './types';

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
  const rivalSet=t.requestedPropertyIds.some(id=>{
    const deed=getPurchasableTile(id,s.boardSize);
    return deed?.kind==='property' && colorGroupTiles(deed.group,s.boardSize).every(member=>properties[member.position]?.ownerId===t.fromPlayerId);
  });
  const premium=p.botLevel==='pro'&&rivalSet?160:0;
  return t.offeredCash-t.requestedCash+portfolio({...s,properties},p.id)-portfolio(s,p.id)+25*((t.offeredJailCards?.length??0)-(t.requestedJailCards?.length??0))-premium;
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
  const desk=s.mayor;
  const actingMayor=bot(desk?.mayorId);
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
      return !tightCash&&!opportunistic&&candidate.cash>=openBill.amount+style.reserve
        ? {type:'CITY_PAY_TAX',playerId:candidate.id,round:openBill.round,billId:openBill.id??null}
        : {type:'CITY_DEFER_TAX',playerId:candidate.id,round:openBill.round,billId:openBill.id??null};
    }
    const mayor=bot(desk.mayorId),active=bot(s.activePlayerId),term=desk.term;
    if(mayor && s.players.filter(p=>!p.bankrupt).length>=3 && !desk.auditUsed){
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
            if(mayorCanReleaseJail(s,playerId) && (mayor.botLevel!=='pro' || upcomingRent(s,mayor)<200))
        return {type:'CITY_RELEASE_JAIL',playerId,term,targetId:playerId};
      const amount=Math.min(desk.treasury,mayor.botLevel==='pro'?Math.max(LOAN_AMOUNT,proReserve(s,mayor)-mayor.cash):LOAN_AMOUNT);
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
      if(!desk.office.permitPropertyIds){
        const streets=getBoard(s.boardSize).filter(tile=>{
          const owned=s.properties[tile.position];
          if(tile.kind!=='property'||!owned?.ownerId||owned.ownerId===playerId||owned.houses>=5)return false;
          return colorGroupTiles(tile.group,s.boardSize).every(deed=>s.properties[deed.position]?.ownerId===owned.ownerId);
        }).sort((a,b)=>calculateRent(s,b.position,7)-calculateRent(s,a.position,7)).slice(0,PERMIT_LOCK_COUNT);
        if(streets.length===PERMIT_LOCK_COUNT)return {type:'CITY_LOCK_PERMITS',playerId,term,propertyIds:streets.map(tile=>tile.position)};
      }
      if(desk.office.rivalMoveTerm!==term && s.players.some(rival=>{
        if(rival.id===playerId||rival.bankrupt||rival.inJail||rival.position+MAYOR_MOVE_SPACES>=s.boardSize)return false;
        const before=(rival.position+7)%s.boardSize, after=(before+MAYOR_MOVE_SPACES)%s.boardSize;
        return s.properties[after]?.ownerId===playerId &&
          calculateRent(s,after,7)>=150 && s.properties[before]?.ownerId!==playerId;
      }))return {type:'CITY_MOVE_RIVALS',playerId,term};
    }
    if(mayor && active===mayor && (desk.office || !desk.proposalUsed) && !desk.proposal && desk.round>=2){
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
    if(active && proposal && canChallengeCityProject(s,active.id)){
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
        if(risk>cost+25||(train.fare===0&&!owner&&active.cash>=400))return {type:'CITY_EXPRESS',playerId};
      }
    }
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
    const style=botStyle(p),building=a.kind==='house'||a.kind==='hotel';
    const targets=a.buildTargets?.[p.id]??[];
    const target=p.botLevel==="pro"
      ? [...targets].sort((x,y)=>buildReturn(s,p,y)-buildReturn(s,p,x))[0]
      : targets[0];
    const tile=getPurchasableTile(target??a.propertyId,s.boardSize);
    const complete=tile?.kind==='property'&&colorGroupTiles(tile.group,s.boardSize).every(t=>t.position===tile.position||s.properties[t.position]?.ownerId===p.id);
    const credit=auctionCredit(a,p.id);
    const reserve=p.botLevel==='pro'?proReserve(s,p):style.reserve;
    const cash=spendable(s,p);
    const liquid=credit ? cash+credit : Math.max(0,cash-reserve);
    const limit=Math.floor(Math.min(liquid,tile?(building&&tile.kind==='property'?tile.houseCost*(p.botLevel==="pro" ? Math.min(2.4, 1.2+buildReturn(s,p,tile.position)*2.5) : 1.5):
      p.botLevel==='pro'?proDeedValue(s,p,tile.position):tile.price*(complete?1.7:style.bid)):0));
    const increment = p.botLevel === "pro" && a.currentBid
      ? Math.max(10, Math.floor((limit - a.currentBid) / 50) * 5)
      : style.bid > 1.2 && limit - a.currentBid > 60 ? 20 : 10;
    const minBid=Math.max(usesClassicRules(s)?10:1,a.currentBid+1);
    const amount=p.botLevel==='pro'?Math.max(minBid,Math.min(limit,a.currentBid+increment)):Math.max(10,a.currentBid+increment);
    const bid:GameAction={type:'AUCTION_BID',playerId:p.id,amount,propertyId:target};
    return amount<=limit&&legal(bid)?bid:{type:'AUCTION_BID',playerId:p.id,pass:true};
  }
  const p=bot(decisionPlayerId(s));if(!p)return;
  const playerId=p.id,owned=deeds(s,p),cash=spendable(s,p),style=botStyle(p);
  if(s.phase==='awaitingDebt'){
    const improved=owned.filter(t=>s.properties[t.position]!.houses>0).sort((a,b)=>
      p.botLevel==="pro" ? calculateRent(s,a.position,7)-calculateRent(s,b.position,7) : s.properties[b.position]!.houses-s.properties[a.position]!.houses);
    const mortgages=owned.filter(t=>!s.properties[t.position]!.mortgaged);
    if (p.botLevel==="pro") mortgages.sort((a,b)=>proDeedValue(s,p,a.position)/a.mortgageValue-proDeedValue(s,p,b.position)/b.mortgageValue);
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
    let budget = cash - proReserve(s,p);
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
      const holdInJail = p.botLevel==="pro" && upcomingRent(s,{...p,position:s.boardSize/4}) > Math.max(125,cash*.25);
      const release=holdInJail ? undefined : first([{type:'PAY',playerId,kind:'jailCard'},...(cash>=250?[{type:'PAY',playerId,kind:'jailFine'} as const]:[])]);
      if(release)return release;
    }
    return {type:'ROLL',playerId,dice};
  }
  if(s.phase==='awaitingMove')return {type:'MOVE_RESULT',playerId};
  if(s.phase==='awaitingBuy'&&s.pendingPurchase){
    const propertyId=s.pendingPurchase.propertyId,tile=getPurchasableTile(propertyId,s.boardSize);
    const buy={type:'BUY',playerId,propertyId} as const;
    const complete=tile?.kind==='property'&&colorGroupTiles(tile.group,s.boardSize).every(t=>t.position===tile.position||s.properties[t.position]?.ownerId===p.id);
    const reserve=p.botLevel==='pro'?proReserve(s,p):style.reserve;
    const remaining=complete?(p.botLevel==='pro'?Math.max(75,reserve-150):50):reserve;
    return tile&&cash>=tile.price+remaining&&legal(buy)?buy:{type:'DECLINE_BUY',playerId};
  }
  if(s.phase==='awaitingEndTurn'){
    const usableReserve=p.botLevel==='pro'?proReserve(s,p):style.buildReserve;
    const upgrades=owned.filter(t=>t.kind==='property' && !propertyPermitLocked(s,t.position) && s.properties[t.position]!.houses<5&&cash>=t.houseCost+usableReserve);
    upgrades.sort((a,b)=>p.botLevel==="pro"
      ? buildReturn(s,p,b.position)-buildReturn(s,p,a.position)
      : s.properties[a.position]!.houses-s.properties[b.position]!.houses);
    const finance=first([
      ...owned.filter(t=>s.properties[t.position]!.mortgaged&&cash>=t.mortgageValue*1.1+usableReserve).map(t=>({type:'MORTGAGE',playerId,propertyId:t.position,mortgage:false} as const)),
      ...upgrades.map(t=>({type:'BUILD',playerId,propertyId:t.position,operation:'build'} as const))
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
