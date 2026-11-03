import {cardAt,classicPosition,getTile,railroadPositions} from '../engine/board';
import type {CardDraw,GameState,Player} from '../engine/types';
import {randomIndex} from './random';

export function makeCardDraws(state:GameState,player:Player,pick=(size:number)=>randomIndex(size)):CardDraw[]{
  if(state.mode==='classic'||!state.pendingRoll)return [];
  const draws:CardDraw[]=[];let position=(player.position+state.pendingRoll.total)%state.boardSize;
  for(let depth=0;depth<4;depth++){
    const tile=getTile(position,state.boardSize);if(tile.kind!=='chance'&&tile.kind!=='community')break;
    const draw:CardDraw={deck:tile.kind,index:pick(8)};draws.push(draw);
    const effect=cardAt(draw.deck,draw.index)?.effect;if(!effect)break;
    if(effect.kind==='moveTo')position=classicPosition(effect.position,state.boardSize);
    else if(effect.kind==='moveRelative')position=(position+effect.spaces+state.boardSize)%state.boardSize;
    else if(effect.kind==='nearestRailroad')position=railroadPositions(state.boardSize).find(id=>id>position)??railroadPositions(state.boardSize)[0]!;
    else break;
  }
  return draws;
}
