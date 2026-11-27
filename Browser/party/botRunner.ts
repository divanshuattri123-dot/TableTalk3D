import {nextBotAction} from '../src/engine/bots';
import type {GameState} from '../src/engine/types';
import {makeCardDraws} from '../src/network/cardDraws';
import {rollDice} from '../src/network/random';
import {planPresentation} from '../src/presentation/plan';

export const hasBotDecision=(state:GameState)=>Boolean(nextBotAction(state));
export function chooseBotAction(state:GameState){
  const action=nextBotAction(state,rollDice());
  return action?.type==='MOVE_RESULT'?{...action,rollId:state.pendingRoll?.id,cardDraws:makeCardDraws(state,state.players.find(p=>p.id===action.playerId)!)}:action;
}
export function botThinkDelay(previous:GameState|undefined,state:GameState,variation=0){
  const animation=previous?planPresentation(previous,state).reduce((sum,frame)=>sum+frame.duration,0):state.phase==='awaitingMove'?1900:0;
  const humanRentClaim = state.phase === "awaitingRoll" && state.rentClaim &&
    state.players.some(player => player.id === state.activePlayerId && player.bot && !player.bankrupt) &&
    state.players.some(player => player.id === state.rentClaim!.ownerId && !player.bot && !player.bankrupt);
  // An automatic roll can expire a human's claim before they can act on their phone.
  const consideringTrade = state.phase === "awaitingTradeResponse" && state.players.some(player =>
    player.id === state.pendingTrade?.toPlayerId && player.botLevel === "pro");
  const minimum = humanRentClaim ? 6000 : consideringTrade ? 1650 : 900;
  return Math.min(14000,Math.max(minimum,animation+450))+variation;
}
