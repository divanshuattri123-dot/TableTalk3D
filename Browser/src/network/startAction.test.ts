import { expect, it } from "vitest";
import { createInitialState, reduceGame } from "../engine/reducer";
import { makeStartAction } from "./startAction";
it("creates a complete externally randomized Classic start action, rerolling tied players",()=>{
  let s=createInitialState("STRT");for(const [id,color] of [["a","red"],["b","blue"]])s=reduceGame(s,{type:"JOIN",player:{id:id!,name:id!,color:color!}});
  s=reduceGame(s,{type:"SET_MODE",playerId:"a",mode:"classic"});
  const numbers=[0,0,0,0,0,0,.9,.9];
  const action=makeStartAction(s,"a",()=>numbers.shift()??.4);
  expect(action.setupRolls).toHaveLength(2);expect(action.firstPlayerId).toBe("b");
  expect(new Set(action.deckOrder!.chance).size).toBe(16);expect(reduceGame(s,action).phase).toBe("awaitingRoll");expect(s.phase).toBe("lobby");
});
