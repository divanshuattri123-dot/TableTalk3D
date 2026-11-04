import {expect,it} from 'vitest';
import {createInitialState,reduceGame} from './reducer';
import {recoverClassicAuction} from './classic';
import type {GameAction,GameState} from './types';

function apply(s:GameState,a:GameAction){const next=reduceGame(s,a);expect(next.notice,JSON.stringify(a)).toBeUndefined();return next;}
function winningHouseBid(rent:number){
  let s=createInitialState('PAYB');
  for(const [id,color] of [['a','red'],['b','blue'],['c','green']])s=apply(s,{type:'JOIN',player:{id:id!,name:id!,color:color!}});
  s=apply(s,{type:'SET_MODE',playerId:'a',mode:'classic',rulesEdition:'hasbro-2025'});
  const deck=Array.from({length:16},(_,i)=>i);
  s=apply(s,{type:'START',playerId:'a',firstPlayerId:'a',deckOrder:{chance:deck,community:deck},setupRolls:[s.players.map((p,i)=>({playerId:p.id,dice:i?[1,2]:[6,6]}))]});
  for(const id of [6,8,9])s.properties[id]!.ownerId='a';
  for(const id of [1,3]){s.properties[id]!.ownerId='b';s.properties[id]!.houses=3;}
  for(const id of [21,23,24]){s.properties[id]!.ownerId='b';s.properties[id]!.houses=2;}
  for(const id of [16,18,19]){s.properties[id]!.ownerId='c';s.properties[id]!.houses=3;}
  for(const [id,houses] of [[26,4],[27,3],[29,3]]){s.properties[id!]!.ownerId='c';s.properties[id!]!.houses=houses! as 3|4;}
  s.properties[12]!.ownerId='b';
  s.players[0]!.cash=100;s.bankHouses=1;s.phase='awaitingEndTurn';
  s.rentClaim={id:99,ownerId:'b',payerId:'a',propertyId:rent===40?12:rent===300?24:3,amount:rent};
  s=apply(s,{type:'BUILD',playerId:'a',propertyId:6,operation:'build'});
  expect(s.auction?.kind).toBe('house');
  return apply(s,{type:'AUCTION_BID',playerId:'a',propertyId:6,amount:80});
}

it('reopens an auction when a compulsory rent payment makes its winning bid unaffordable',()=>{
  let s=apply(winningHouseBid(40),{type:'CLAIM_RENT',playerId:'b',claimId:99});
  expect(s.players[0]!.cash).toBe(60);
  expect(s.auction?.highestBidderId).toBeUndefined();
  s=apply(s,{type:'AUCTION_BID',playerId:'b',propertyId:1,amount:50});
  for(const id of s.auction!.eligiblePlayerIds.filter(id=>id!=='b'))s=apply(s,{type:'AUCTION_BID',playerId:id,pass:true});
  expect(s.phase).toBe('awaitingEndTurn');expect(s.auction).toBeUndefined();
  expect(s.players[1]!.cash).toBe(1490);expect(s.properties[1]!.houses).toBe(4);expect(s.bankHouses).toBe(0);
});

it('unlocks a winning building district to raise money for compulsory debt',()=>{
  let s=apply(winningHouseBid(180),{type:'CLAIM_RENT',playerId:'b',claimId:99});
  expect(s.phase).toBe('awaitingDebt');
  s=apply(s,{type:'MORTGAGE',playerId:'a',propertyId:6,mortgage:true});
  s=apply(s,{type:'MORTGAGE',playerId:'a',propertyId:8,mortgage:true});
  expect(s.players[0]!.cash).toBe(20);expect(s.phase).toBe('awaitingAuction');
  for(const id of [...s.auction!.eligiblePlayerIds])s=apply(s,{type:'AUCTION_BID',playerId:id,pass:true});
  expect(s.phase).toBe('awaitingEndTurn');
});

it('finishes the open auction before the next turn after its active bidder goes bankrupt',()=>{
  let s=apply(winningHouseBid(300),{type:'CLAIM_RENT',playerId:'b',claimId:99});
  s=apply(s,{type:'BANKRUPT',playerId:'a'});
  expect(s.players[0]!.bankrupt).toBe(true);expect(s.phase).toBe('awaitingAuction');
  expect(s.auction!.eligiblePlayerIds).not.toContain('a');
  for(const id of [...s.auction!.eligiblePlayerIds])s=apply(s,{type:'AUCTION_BID',playerId:id,pass:true});
  expect(s.phase).toBe('awaitingRoll');expect(s.activePlayerId).toBe('b');
});

it('repairs a saved orphaned auction when an existing player reconnects',()=>{
  let s=winningHouseBid(300);
  s.players[0]!.bankrupt=true;s.players[0]!.cash=0;s.activePlayerId='b';s.phase='awaitingRoll';
  for(const d of Object.values(s.properties))if(d.ownerId==='a')d.ownerId='b';
  s=apply(s,{type:'JOIN',player:s.players[1]!});
  expect(s.phase).toBe('awaitingAuction');expect(s.auction?.highestBidderId).toBeUndefined();
  for(const id of [...s.auction!.eligiblePlayerIds])s=apply(s,{type:'AUCTION_BID',playerId:id,pass:true});
  expect(s.phase).toBe('awaitingRoll');expect(s.activePlayerId).toBe('b');
});

it('closes an older orphaned building auction whose sites are no longer eligible',()=>{
  const s=winningHouseBid(40);s.phase='awaitingRoll';
  for(const d of Object.values(s.properties))d.houses=0;
  s.bankHouses=32;
  for(const id of [6,1,21,16,26])s.properties[id]!.mortgaged=true;
  const repaired=recoverClassicAuction(s);
  expect(repaired.auction).toBeUndefined();expect(repaired.phase).toBe('awaitingRoll');
  expect(repaired.players).toEqual(s.players);expect(repaired.properties).toEqual(s.properties);
  expect(recoverClassicAuction(repaired)).toBe(repaired);
});
