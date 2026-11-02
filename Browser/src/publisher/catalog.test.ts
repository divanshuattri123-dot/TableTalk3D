import {it,expect} from 'vitest';
import {emptyWallet,reducePreviewWallet,readPreviewWallet,owns} from './catalog';
it('never equips a locked cosmetic or treats ad removal as a token',()=>{
  const start=emptyWallet();expect(reducePreviewWallet(start,{type:'EQUIP',productId:'brass_dragon'})).toEqual(start);
  const paid=reducePreviewWallet(start,{type:'GRANT_TEST',productId:'remove_ads',receiptId:'test-a'});
  expect(owns(paid,'remove_ads')).toBe(true);expect(reducePreviewWallet(paid,{type:'EQUIP',productId:'remove_ads'}).equipped).toBeUndefined();
});
it('grants test receipts once, remains pure, and equips only the bought token',()=>{
  const start=emptyWallet(),next=reducePreviewWallet(start,{type:'GRANT_TEST',productId:'brass_dragon',receiptId:'test-b'});
  expect(start.receipts).toEqual([]);expect(next.receipts).toHaveLength(1);
  expect(reducePreviewWallet(next,{type:'GRANT_TEST',productId:'brass_dragon',receiptId:'test-c'})).toEqual(next);
  const equipped=reducePreviewWallet(next,{type:'EQUIP',productId:'brass_dragon'});expect(equipped.equipped).toBe('brass_dragon');expect(reducePreviewWallet(equipped,{type:'CLASSIC'}).equipped).toBeUndefined();
});
it('restores only preview receipts and rejects malformed or unrelated purchase data',()=>{
  expect(readPreviewWallet('{')).toEqual(emptyWallet());expect(readPreviewWallet(JSON.stringify({receipts:[{productId:'brass_dragon',receiptId:'real',mode:'production'}],equipped:'brass_dragon'}))).toEqual(emptyWallet());
  const saved={receipts:[{productId:'samurai_red',receiptId:'test-d',mode:'preview'}],equipped:'samurai_red'};
  expect(readPreviewWallet(JSON.stringify(saved))).toEqual(saved);
});
