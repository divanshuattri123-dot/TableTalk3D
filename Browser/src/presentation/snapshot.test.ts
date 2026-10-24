import { expect, it } from "vitest";
import { createInitialState, reduceGame } from "../engine/reducer";
import { unitySnapshot } from "./snapshot";
it("sends only rendering fields to Unity, leaving fractional money and deck data in the canonical browser state",()=>{
  const s=reduceGame(createInitialState("REND"),{type:"JOIN",player:{id:"a",name:"Asha",color:"red",tokenId:"car"}});s.players[0]!.cash=1494.5;s.players[0]!.jailCardDecks=["chance"];
  const native=unitySnapshot(s);
  expect(native.players[0]).toEqual({id:"a",name:"Asha",color:"red",tokenId:"car",position:0,inJail:false,bankrupt:false});
  expect(s.players[0]!.cash).toBe(1494.5);expect(s.players[0]!.jailCardDecks).toEqual(["chance"]);expect(native.tiles).toHaveLength(40);
});
