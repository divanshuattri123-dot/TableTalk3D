import type { Dice, GameAction, GameState, SetupRoll } from "../engine/types";

// Randomness belongs at the action boundary, never in the shared reducer.
export function makeStartAction(game: GameState, playerId: string, random = Math.random): Extract<GameAction,{type:"START"}> {
  if(game.mode!=="classic")return {type:"START",playerId,firstPlayerId:game.players[Math.floor(random()*game.players.length)]!.id};
  let tied=game.players.map(p=>p.id);const rounds:SetupRoll[][]=[];
  while(tied.length>1) {
    const rolls=tied.map(id=>({playerId:id,dice:[1+Math.floor(random()*6),1+Math.floor(random()*6)] as Dice}));
    rounds.push(rolls);const high=Math.max(...rolls.map(r=>r.dice[0]+r.dice[1]));tied=rolls.filter(r=>r.dice[0]+r.dice[1]===high).map(r=>r.playerId);
  }
  const shuffle=()=>{const cards=Array.from({length:16},(_,i)=>i);for(let i=15;i>0;i--){const j=Math.floor(random()*(i+1));[cards[i],cards[j]]=[cards[j]!,cards[i]!];}return cards;};
  return {type:"START",playerId,firstPlayerId:tied[0]!,setupRolls:rounds,deckOrder:{chance:shuffle(),community:shuffle()}};
}
