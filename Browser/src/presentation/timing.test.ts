import {afterEach,expect,it,vi} from 'vitest';
import {frameTimeoutMs} from './timing';
import {PresentationTimeline} from './timeline';
import {createInitialState,reduceGame} from '../engine/reducer';

afterEach(()=>vi.useRealTimers());
it('a missing Unity callback cannot leave the dice result waiting eight extra seconds',()=>{
  vi.useFakeTimers();let s=createInitialState('ROLL');
  s=reduceGame(s,{type:'JOIN',player:{id:'a',name:'A',color:'red'}});s=reduceGame(s,{type:'JOIN',player:{id:'b',name:'B',color:'blue'}});s=reduceGame(s,{type:'START',playerId:'a',firstPlayerId:'a'});
  const timeline=new PresentationTimeline();timeline.receive(s);
  const rolled=reduceGame(s,{type:'ROLL',playerId:'a',dice:[6,5]});timeline.receive(rolled);const dice=timeline.snapshot().frame!;
  timeline.receive(reduceGame(rolled,{type:'MOVE_RESULT',playerId:'a'}));const deadline=frameTimeoutMs(dice,true)!;
  expect(deadline).toBeGreaterThan(dice.duration);expect(deadline).toBeLessThanOrEqual(3000);
  setTimeout(()=>timeline.complete(dice.id,'animation'),deadline);vi.advanceTimersByTime(deadline);
  expect(timeline.snapshot().frame?.kind).toBe('move');const move=timeline.snapshot().frame;
  expect(timeline.complete(dice.id,'animation')).toBe(false);expect(timeline.snapshot().frame).toBe(move);
});
it('never auto-dismisses readable cards and preserves time for long motion',()=>{
  expect(frameTimeoutMs({id:'card',kind:'card',text:'Pay the bank',duration:2900},true)).toBeUndefined();
  expect(frameTimeoutMs({id:'move',kind:'move',text:'Move',duration:6500},true)).toBe(9500);
});
