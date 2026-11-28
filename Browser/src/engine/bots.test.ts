import {describe,it,expect} from 'vitest';
import {createInitialState,reduceGame} from './reducer';
import {nextBotAction,botStyle} from './bots';
import {TRAINED_PRO} from './proStrategy';
import {PLAYER_COLORS} from './playerColors';
import {boardSizeForPlayers} from './board';
import {makeStartAction} from '../network/startAction';
import {makeCardDraws} from '../network/cardDraws';
import type {GameAction,GameState} from './types';

const apply=(s:GameState,a:GameAction)=>{const copy=structuredClone(s),next=reduceGame(s,a);expect(s).toEqual(copy);expect(next.notice,JSON.stringify(a)).toBeUndefined();return next;};
function lobby(humans=1,bots=1){let s=createInitialState('BOTS');for(let i=0;i<humans;i++)s=apply(s,{type:'JOIN',player:{id:`p${i}`,name:`Human ${i}`,color:PLAYER_COLORS[i]!}});for(let i=0;i<bots;i++)s=apply(s,{type:'ADD_BOT',playerId:'p0'});return s;}
function started(mode:'classic'|'expanding'='expanding',edition?:'hasbro-2025'){
  let s=lobby();s=apply(s,{type:'SET_MODE',playerId:'p0',mode,rulesEdition:edition});
  const order=Array.from({length:16},(_,i)=>i);
  return apply(s,{type:'START',playerId:'p0',firstPlayerId:'ai-1',...(mode==='classic'?{deckOrder:{chance:order,community:order},setupRolls:[[{playerId:'p0',dice:[1,2] as const},{playerId:'ai-1',dice:[6,6] as const}]]}:{})});
}
const bot=(s:GameState)=>s.players.find(p=>p.bot)!;
const decision=(s:GameState)=>{const action=nextBotAction(s,[1,2]);expect(action,JSON.stringify({phase:s.phase,notice:s.notice})).toBeDefined();return action!;};

describe('mixed human and AI lobby',()=>{
  const mixes=Array.from({length:5},(_,i)=>i+2).flatMap(total=>Array.from({length:total},(_,i)=>({total,humans:i+1,bots:total-i-1})));
  it.each(mixes)('$humans humans + $bots AI can start a $total-seat game',({humans,bots,total})=>{
    const s=lobby(humans,bots);expect(s.players.filter(p=>p.bot)).toHaveLength(bots);expect(new Set(s.players.map(p=>p.color)).size).toBe(total);
    expect(s.boardSize).toBe(boardSizeForPlayers(total));expect(apply(s,{type:'START',playerId:'p0',firstPlayerId:s.players.at(-1)!.id}).phase).toBe('awaitingRoll');
  });
  it('restricts bot management to the human host and lobby, and caps at six',()=>{
    let s=lobby(2,4);for(const a of [{type:'ADD_BOT',playerId:'p0'},{type:'REMOVE_BOT',playerId:'p1',botId:'ai-1'},{type:'REMOVE_BOT',playerId:'p0',botId:'p1'}] as GameAction[])expect(reduceGame(s,a).players).toEqual(s.players);
    s=apply(s,{type:'REMOVE_BOT',playerId:'p0',botId:'ai-1'});expect(s.boardSize).toBe(56);s=apply(s,{type:'ADD_BOT',playerId:'p0'});expect(s.players).toHaveLength(6);
    s=apply(s,{type:'START',playerId:'p0',firstPlayerId:'p0'});expect(reduceGame(s,{type:'REMOVE_BOT',playerId:'p0',botId:'ai-1'}).players).toEqual(s.players);
    expect(reduceGame(createInitialState(),{type:'ADD_BOT',playerId:'nobody'}).players).toHaveLength(0);
  });
  it('adds a Pro AI seat alongside standard bots and preserves the choice after starting',()=>{
    let state=apply(lobby(),{type:'ADD_BOT',playerId:'p0',level:'pro'});
    state=apply(state,{type:'SET_MODE',playerId:'p0',mode:'mayor',mayorOffice:true});
    state=apply(state,{type:'START',playerId:'p0',firstPlayerId:'ai-2'});
    expect(botStyle(state.players.find(p=>p.id==='ai-2')!).name).toBe('Pro');
    expect(botStyle(state.players.find(p=>p.id==='ai-1')!).name).toBe('Balanced');
  });

  it('keeps Classic at forty spaces and old human-only saves idle',()=>{
    const s=apply(lobby(1,5),{type:'SET_MODE',playerId:'p0',mode:'classic'});expect(s.boardSize).toBe(40);
    expect(nextBotAction(lobby())).toBeUndefined();expect(nextBotAction({...started(),players:started().players.map(p=>({...p,bot:undefined}))})).toBeUndefined();
  });
});

describe('AI decisions obey ordinary rules',()=>{
  it('rolls, moves, buys and ends a turn without mutating or inventing cash',()=>{
    let s=started();for(const type of ['ROLL','MOVE_RESULT','BUY','END_TURN']){const a=decision(s);expect(a.type).toBe(type);expect(nextBotAction(s,[1,2])).toEqual(a);s=apply(s,a);}
    expect(bot(s).cash).toBe(1440);expect(s.properties[3]?.ownerId).toBe('ai-1');expect(s.activePlayerId).toBe('p0');expect(nextBotAction(s)).toBeUndefined();
  });
  it('uses different reserves and bidding personalities',()=>{
    const s=started();s.phase='awaitingBuy';s.pendingPurchase={playerId:'ai-1',propertyId:39};bot(s).cash=600;
    expect(decision(s).type).toBe('BUY');bot(s).id='ai-5';s.activePlayerId='ai-5';s.pendingPurchase.playerId='ai-5';expect(decision(s).type).toBe('DECLINE_BUY');expect(botStyle(bot(s)).name).toBe('Cautious');
  });
  it('makes Pro ask for a premium before handing a rival their final deed of a set',()=>{
    let state=started();
    state={...state,activePlayerId:'p0',properties:{...state.properties,
      1:{ownerId:'p0',houses:0,mortgaged:false},3:{ownerId:'ai-1',houses:0,mortgaged:false}}};
    state=apply(state,{type:'TRADE_OFFER',playerId:'p0',toPlayerId:'ai-1',offerId:'complete-set',
      offeredCash:100,requestedCash:0,offeredPropertyIds:[],requestedPropertyIds:[3]});
    expect(decision(state).type).toBe('TRADE_ACCEPT');
    const pro={...state,players:state.players.map(p=>p.bot?{...p,botLevel:'pro' as const}:p)};
    const first = decision(pro);
    expect(first).toMatchObject({type:'TRADE_COUNTER',botNote:'set-premium'});
    if (first.type !== 'TRADE_COUNTER') throw new Error('Expected the Pro counter');
    expect(first.requestedCash).toBeGreaterThan(150);
    let next = apply(pro, first);
    next = apply(next, {type:'TRADE_COUNTER',playerId:'p0',previousOfferId:first.offerId,offerId:'second-price',
      offeredCash:first.requestedCash-35,requestedCash:0,offeredPropertyIds:[],requestedPropertyIds:[3]});
    const second = decision(next);
    expect(second).toMatchObject({type:'TRADE_COUNTER',botNote:'concession'});
    if (second.type !== 'TRADE_COUNTER') throw new Error('Expected a second Pro counter');
    expect(second.requestedCash).toBeLessThan(first.requestedCash);
    expect(second.requestedCash).toBeGreaterThan(first.requestedCash-35);
    next = apply(next, second);
    const agreed = apply(next, {type:'TRADE_ACCEPT',playerId:'p0',offerId:second.offerId});
    expect(agreed.properties[3]?.ownerId).toBe('p0');
    expect(bot(agreed).cash).toBe(bot(pro).cash+second.requestedCash);
  });

  it('protects cash from a nearby hotel even when the same purchase would be affordable on a quiet board', () => {
    const s = started('classic');
    s.phase = 'awaitingBuy';
    s.pendingPurchase = { playerId: 'ai-1', propertyId: 8 };
    bot(s).botLevel = 'pro';
    bot(s).position = 8;
    bot(s).cash = 340;
    expect(decision(s).type).toBe('BUY');
    s.properties[16] = {ownerId:'p0', houses:5, mortgaged:false};
    expect(decision(s).type).toBe('DECLINE_BUY');
  });

  it('can finance the final deed of a district with a low-value mortgage', () => {
    let s = started('classic');
    s.phase = 'awaitingBuy';
    s.pendingPurchase = { playerId: 'ai-1', propertyId: 3 };
    bot(s).botLevel = 'pro';
    bot(s).position = 3;
    bot(s).cash = 55;
    for (const id of [1,12]) s.properties[id]!.ownerId = 'ai-1';
    expect(decision(s)).toMatchObject({type:'MORTGAGE',propertyId:12,mortgage:true});
    s = apply(s, decision(s));
    expect(decision(s)).toMatchObject({type:'BUY',propertyId:3});
  });

  it('prefers a third house over redeeming a low-yield mortgage', () => {
    const s = started('classic');
    s.phase = 'awaitingEndTurn';
    bot(s).botLevel = 'pro';
    s.properties[12] = {ownerId:'ai-1',houses:0,mortgaged:true};
    for (const id of [1,3]) s.properties[id] = {ownerId:'ai-1',houses:2,mortgaged:false};
    expect(decision(s)).toMatchObject({type:'BUILD',operation:'build'});
  });

  it('reinvests a low-yield deed in a third house when opponents are approaching', () => {
    let s = started('classic');
    s.phase = 'awaitingEndTurn';
    bot(s).botLevel = 'pro';
    bot(s).position = 20;
    bot(s).cash = 80;
    s.players[0]!.position = 36;
    for (const id of [1,3]) s.properties[id] = {ownerId:'ai-1',houses:2,mortgaged:false};
    s.properties[12] = {ownerId:'ai-1',houses:0,mortgaged:false};
    const profile = () => ({...TRAINED_PRO, financeBuilds:true});
    const action = nextBotAction(s,[1,2],profile);
    expect(action).toMatchObject({type:'MORTGAGE',propertyId:12,mortgage:true});
    s = apply(s, action!);
    expect(nextBotAction(s,[1,2],profile)).toMatchObject({type:'BUILD',operation:'build'});
  });

  it('bids or passes but waits when a human is the only remaining responder',()=>{
    let s=started();s.phase='awaitingBuy';s.pendingPurchase={playerId:'ai-1',propertyId:3};s=apply(s,{type:'DECLINE_BUY',playerId:'ai-1'});
    s=apply(s,decision(s));expect(s.auction?.highestBidderId).toBe('ai-1');expect(nextBotAction(s)).toBeUndefined();
    s=apply(s,{type:'AUCTION_BID',playerId:'p0',amount:500});expect(decision(s)).toMatchObject({type:'AUCTION_BID',pass:true});s=apply(s,decision(s));expect(s.phase).toBe('awaitingEndTurn');
  });
  it('mortgages to clear debt and declares bankruptcy only after legal liquidation',()=>{
    let s=started('classic','hasbro-2025');s.properties[3]!.ownerId='ai-1';bot(s).cash=-20;s.debts=[{playerId:'ai-1',creditorId:'bank',reason:'tax',amount:20}];s.phase='awaitingDebt';s.debtResumePhase='awaitingEndTurn';
    expect(decision(s).type).toBe('MORTGAGE');s=apply(s,decision(s));expect(s.phase).toBe('awaitingEndTurn');expect(bot(s).cash).toBe(10);
    bot(s).cash=-500;s.debts=[{playerId:'ai-1',creditorId:'bank',reason:'tax',amount:500}];s.phase='awaitingDebt';expect(decision(s).type).toBe('BANKRUPT');s=apply(s,decision(s));expect(s.phase).toBe('gameOver');
  });
  it('sells buildings evenly, including a hotel when replacement houses are unavailable',()=>{
    let s=started('classic');for(const id of [1,3]){s.properties[id]!.ownerId='ai-1';s.properties[id]!.houses=5;}
    s.bankHouses=0;s.phase='awaitingDebt';bot(s).cash=-100;s.debts=[{playerId:'ai-1',creditorId:'bank',reason:'tax',amount:100}];
    expect(decision(s)).toMatchObject({type:'BUILD',operation:'sellGroup'});s=apply(s,decision(s));expect(bot(s).cash).toBeGreaterThanOrEqual(0);
  });
  it('builds evenly and honours scarce-building auctions',()=>{
    let s=started('classic');s.phase='awaitingEndTurn';for(const id of [1,3])s.properties[id]!.ownerId='ai-1';
    s=apply(s,decision(s));expect(s.properties[1]!.houses).toBe(1);s=apply(s,decision(s));expect(s.properties[3]!.houses).toBe(1);
    for(const id of [6,8,9])s.properties[id]!.ownerId='p0';s.bankHouses=1;
    s=apply(s,decision(s));expect(s.phase).toBe('awaitingAuction');expect(s.auction?.kind).toBe('house');
    expect(decision(s).type).toBe('AUCTION_BID');s=apply(s,decision(s));expect(s.auction?.highestBidderId).toBe('ai-1');
  });
  it('uses jail cards, handles the compulsory fine, utilities and mortgage transfers',()=>{
    let s=started('classic');bot(s).inJail=true;bot(s).getOutOfJailCards=1;bot(s).jailCardDecks=['chance'];expect(decision(s)).toMatchObject({type:'PAY',kind:'jailCard'});s=apply(s,decision(s));
    s.phase='awaitingMortgageDecision';s.mortgageTransfers=[{playerId:'ai-1',propertyIds:[3]}];s.properties[3]!.ownerId='ai-1';s.properties[3]!.mortgaged=true;expect(decision(s).type).toBe('RESOLVE_MORTGAGES');s=apply(s,decision(s));
    s.phase='awaitingUtilityRoll';s.pendingUtility={playerId:'ai-1',propertyId:12,multiplier:10};s.properties[12]!.ownerId='p0';expect(decision(s).type).toBe('ROLL');apply(s,decision(s));
    s.phase='awaitingJailPayment';bot(s).inJail=true;s.pendingRoll={playerId:'ai-1',dice:[1,2],total:3,doubles:false,grantsExtraRoll:false};expect(decision(s)).toMatchObject({type:'PAY',kind:'jailFine'});apply(s,decision(s));
  });
  it('claims rent without waiting for its own turn',()=>{
    let s=started('classic','hasbro-2025');s.activePlayerId='p0';s.phase='awaitingEndTurn';s.rentClaim={id:99,ownerId:'ai-1',payerId:'p0',propertyId:3,amount:4};expect(decision(s).type).toBe('CLAIM_RENT');s=apply(s,decision(s));expect(bot(s).cash).toBe(1504);
  });
  it('accepts fair trades, counters unfair ones once, then declines instead of looping',()=>{
    let s=started('classic');s.activePlayerId='p0';s.phase='awaitingEndTurn';s.properties[3]!.ownerId='p0';
    s=apply(s,{type:'TRADE_OFFER',playerId:'p0',offerId:'gift',toPlayerId:'ai-1',offeredCash:0,requestedCash:0,offeredPropertyIds:[3],requestedPropertyIds:[]});expect(decision(s).type).toBe('TRADE_ACCEPT');s=apply(s,decision(s));
    s=apply(s,{type:'TRADE_OFFER',playerId:'p0',offerId:'bad',toPlayerId:'ai-1',offeredCash:1,requestedCash:0,offeredPropertyIds:[],requestedPropertyIds:[3]});expect(decision(s).type).toBe('TRADE_COUNTER');s=apply(s,decision(s));expect(nextBotAction(s)).toBeUndefined();
    s=apply(s,{type:'TRADE_COUNTER',playerId:'p0',previousOfferId:s.pendingTrade!.id,offerId:'still-bad',offeredCash:1,requestedCash:0,offeredPropertyIds:[],requestedPropertyIds:[3]});expect(decision(s).type).toBe('TRADE_DECLINE');apply(s,decision(s));
  });
  it('offers a deed swap when cash alone cannot buy the missing property, then gives the recipient space', () => {
    let s = started('classic');
    s.phase = 'awaitingEndTurn';
    bot(s).botLevel = 'pro';
    bot(s).cash = 250;
    for (const id of [6, 16, 18]) s.properties[id]!.ownerId = 'ai-1';
    s.properties[19]!.ownerId = 'p0';
    const trade = decision(s);
    expect(trade).toMatchObject({type:'TRADE_OFFER',offeredPropertyIds:[6],requestedPropertyIds:[19],botNote:'swap'});
    s = apply(s, trade);
    s = apply(s, {type:'TRADE_DECLINE',playerId:'p0',offerId:s.pendingTrade!.id});
    bot(s).botTradeOffered = false;
    expect(decision(s)).toMatchObject({type:'END_TURN'});
  });

  it('stops countering a human negotiation once the offer chain reaches four rounds', () => {
    let s = started('classic');
    s.activePlayerId = 'p0';
    s.properties[3]!.ownerId = 'ai-1';
    bot(s).botLevel = 'pro';
    s = apply(s, {type:'TRADE_OFFER',playerId:'p0',toPlayerId:'ai-1',offerId:'impasse',
      offeredCash:1,requestedCash:0,offeredPropertyIds:[],requestedPropertyIds:[3]});
    s.pendingTrade!.counterRound = 4;
    expect(decision(s)).toMatchObject({type:'TRADE_DECLINE',offerId:'impasse'});
  });

  it('offers a set-completing deal at most once during the same turn',()=>{
    let s=started();s.phase='awaitingEndTurn';s.properties[1]!.ownerId='ai-1';s.properties[3]!.ownerId='p0';expect(decision(s).type).toBe('TRADE_OFFER');s=apply(s,decision(s));
    s=apply(s,{type:'TRADE_DECLINE',playerId:'p0',offerId:s.pendingTrade!.id});expect(decision(s).type).toBe('END_TURN');
  });
  it.each(['expanding','classic','classic-2025'])('runs 1500 varied %s decisions without a rejected move or stalled bot phase',mode=>{
    let seed=193;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};
    let s=lobby(1,5);s=apply(s,{type:'SET_MODE',playerId:'p0',mode:mode==='expanding'?'expanding':'classic',rulesEdition:mode==='classic-2025'?'hasbro-2025':undefined});s=apply(s,makeStartAction(s,'p0',random));s.players[0]!.bot=true;
    for(let i=0;i<1500&&s.phase!=='gameOver';i++){
      let a=nextBotAction(s,[1+Math.floor(random()*6),1+Math.floor(random()*6)]);expect(a,`${mode}, step ${i}, ${s.phase}, ${s.notice}`).toBeDefined();
      if(a?.type==='MOVE_RESULT'){const actor=a.playerId;a={...a,cardDraws:makeCardDraws(s,s.players.find(p=>p.id===actor)!,size=>Math.floor(random()*size))};}
      s=apply(s,a!);
    }
    expect(s.nextEventId).toBeGreaterThan(100);
  },20000);
});
