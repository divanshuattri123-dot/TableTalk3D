import type {Dice} from '../engine/types';

const RANGE=0x1_0000_0000;
const nextWord=()=>globalThis.crypto?.getRandomValues
  ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0]!
  : Math.floor(Math.random()*RANGE);

export function randomIndex(size:number,word=nextWord):number {
  // Reject the short remainder instead of favouring some faces through modulo.
  const limit=RANGE-RANGE%size;
  let value:number;do{value=word();}while(value>=limit);
  return value%size;
}
export const randomUnit=()=>nextWord()/RANGE;
export const rollDice=():Dice=>[randomIndex(6)+1,randomIndex(6)+1];
