import {expect,it} from 'vitest';
import {createInitialState,reduceGame} from './reducer';
import {nextBotAction} from './bots';
import {makeStartAction} from '../network/startAction';
import {makeCardDraws} from '../network/cardDraws';
import type {GameAction} from './types';

it.each(['expanding','classic','classic-2025'].flatMap(mode=>[2,6].map(count=>({mode,count}))))(
  'audits sustained $mode play with $count seats across three fresh dice/deck seeds',({mode,count})=>{
    for(const initial of [7,73,2048]){
      let seed=initial;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
      let s=createInitialState('LONG');
      s=reduceGame(s,{type:'JOIN',player:{id:'host',name:'Host',color:'red'}});
      for(let i=1;i<count;i++)s=reduceGame(s,{type:'ADD_BOT',playerId:'host'});
      s=reduceGame(s,{type:'SET_MODE',playerId:'host',mode:mode==='expanding'?'expanding':'classic',rulesEdition:mode==='classic-2025'?'hasbro-2025':undefined});
      s=reduceGame(s,makeStartAction(s,'host',random));s.players[0]!.bot=true;
      const totalHouses=s.bankHouses,totalHotels=s.bankHotels;
      for(let step=0;step<2000&&s.phase!=='gameOver';step++){
        let action:GameAction|undefined=nextBotAction(s,[1+Math.floor(random()*6),1+Math.floor(random()*6)]);
        const context=`${mode}/${count}/${initial}/${step}/${s.phase}`;
        expect(action,context).toBeDefined();
        if(action?.type==='MOVE_RESULT'){
          const playerId=action.playerId;
          action={...action,cardDraws:makeCardDraws(s,s.players.find(p=>p.id===playerId)!,n=>Math.floor(random()*n))};
        }
        const next=reduceGame(s,action!);expect(next.notice,context).toBeUndefined();s=next;
        expect(s.bankHouses+Object.values(s.properties).reduce((n,p)=>n+(p.houses===5?0:p.houses),0),context).toBe(totalHouses);
        expect(s.bankHotels+Object.values(s.properties).filter(p=>p.houses===5).length,context).toBe(totalHotels);
        expect(s.players.every(p=>Number.isSafeInteger(Math.round(p.cash*100))&&p.position>=0&&p.position<s.boardSize),context).toBe(true);
        expect(Object.values(s.properties).every(p=>!p.ownerId||!s.players.find(player=>player.id===p.ownerId)?.bankrupt),context).toBe(true);
        if(s.phase!=='gameOver'){
          expect(s.players.find(p=>p.id===s.activePlayerId)?.bankrupt,context).toBe(false);
          if(s.players.some(p=>!p.bankrupt&&p.cash<0))expect(['awaitingDebt','awaitingTradeResponse'],context).toContain(s.phase);
        }
        if(s.auction?.highestBidderId)expect(s.players.find(p=>p.id===s.auction!.highestBidderId)?.bankrupt,context).toBe(false);
      }
      expect(s.nextEventId).toBeGreaterThan(100);
    }
  },120000);
