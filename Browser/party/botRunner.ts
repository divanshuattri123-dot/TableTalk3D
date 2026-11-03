import {nextBotAction} from '../src/engine/bots';
import type {GameState} from '../src/engine/types';
import {makeCardDraws} from '../src/network/cardDraws';
import {rollDice} from '../src/network/random';
import {planPresentation} from '../src/presentation/plan';

export const hasBotDecision=(state:GameState)=>Boolean(nextBotAction(state));
export function chooseBotAction(state:GameState){
  const action=nextBotAction(state,rollDice());
  return action?.type==='MOVE_RESULT'?{...action,cardDraws:makeCardDraws(state,state.players.find(p=>p.id===action.playerId)!)}:action;
}
export function botThinkDelay(previous:GameState|undefined,state:GameState,variation=0){
  const animation=previous?planPresentation(previous,state).reduce((sum,frame)=>sum+frame.duration,0):state.phase==='awaitingMove'?1900:0;
  return Math.min(14000,Math.max(900,animation+450))+variation;
}
