import {describe, expect, it} from "vitest";
import {cityContractReady, propertyPermitLocked, trainOffer} from "./mayor";
import {createInitialState, reduceGame} from "./reducer";
import type {GameState} from "./types";
import {planPresentation} from "../presentation/plan";

const step = reduceGame;
const player = (game: GameState, id: string) => game.players.find(seat => seat.id === id)!;
const changePlayer = (game: GameState, id: string, updates: Partial<GameState["players"][number]>) =>
  ({...game, players: game.players.map(seat => seat.id === id ? {...seat, ...updates} : seat)});
const turn = (game: GameState, activePlayerId: string) => ({...game, activePlayerId});
const end = (game: GameState) => step({...game, phase:"awaitingEndTurn"}, {type:"END_TURN", playerId:game.activePlayerId!});
const round = (game: GameState) => end(end(end(game)));
function table(mayorOffice = true) {
  let game = createInitialState("CITY");
  for (const [id, color] of [["a","red"],["b","blue"],["c","green"]]) {
    game = step(game, {type:"JOIN", player:{id:id!, name:id!.toUpperCase(), color:color!}});
  }
  game = step(game, {type:"SET_MODE", playerId:"a", mode:"mayor", mayorOffice:mayorOffice ? true : undefined});
  return step(game, {type:"START", playerId:"a", firstPlayerId:"a"});
}

describe("Mayor office rules", () => {
  it("locks three street deeds for the Mayor and rivals until the Mayor changes", () => {
    let game = table();
    const lock = {type:"CITY_LOCK_PERMITS", playerId:"a", term:1, propertyIds:[1,6,8]} as const;
    expect(step(game, {...lock, propertyIds:[1,1,8]}).notice).toBeTruthy();
    expect(step(game, {...lock, propertyIds:[1,5,8]}).notice).toBeTruthy();
    expect(step(game, {...lock, playerId:"b"}).notice).toBeTruthy();
    game = step(game, lock);
    expect([1,3,6,8].map(id=>propertyPermitLocked(game,id))).toEqual([true,false,true,true]);
    expect(step(game, {...lock, propertyIds:[3,6,8]}).notice).toBeTruthy();
    const deeds = {...game.properties, 1:{ownerId:"a", houses:0 as const, mortgaged:false}, 3:{ownerId:"a", houses:0 as const, mortgaged:false}};
    expect(step({...game,properties:deeds}, {type:"BUILD",playerId:"a",propertyId:1,operation:"build"}).notice).toContain("paused");
    expect(step({...game,properties:deeds}, {type:"BUILD",playerId:"a",propertyId:3,operation:"build"}).properties[3]?.houses).toBe(1);
    const rival = {...turn(game,"b"),properties:{...deeds,1:{...deeds[1],ownerId:"b"},3:{...deeds[3],ownerId:"b"}}};
    expect(step(rival, {type:"BUILD",playerId:"b",propertyId:1,operation:"build"}).notice).toContain("paused");
    expect(propertyPermitLocked(round(game),1)).toBe(true);
    const nextMayor = round(round(game));
    expect(nextMayor.mayor?.mayorId).toBe("b");
    expect(propertyPermitLocked(nextMayor,1)).toBe(false);
  });

  it("lets the Mayor lend to a rival with over ₹1,000, then lets that seat borrow again after repayment", () => {
    const before = table();
    const grant = {type:"CITY_GRANT_LOAN",playerId:"a",term:1,targetId:"b"} as const;
    expect(step(before, {...grant,playerId:"c"}).notice).toBeTruthy();
    const after = step(before,grant);
    expect(player(after,"b").cash).toBe(1700);
    expect(after.mayor?.treasury).toBe(200);
    expect(after.mayor?.seats.b?.loanAmountDue).toBe(225);
    expect(step(after,grant).notice).toBeTruthy();
    expect(step(after,{type:"CITY_LOAN",playerId:"b",round:1}).notice).toBeTruthy();
    const second = step(after,{...grant,targetId:"c"});
    expect(second.mayor?.treasury).toBe(0);
    expect(step(second,{...grant,targetId:"a"}).notice).toBeTruthy();
    const repaid = round(round(second));
    expect(player(repaid,"b").cash).toBe(1475);
    expect(repaid.mayor?.treasury).toBe(450);
    const reissued = step(repaid,{...grant,playerId:"b",term:2});
    expect(player(reissued,"b").cash).toBe(1675);
  });

  it("repeats audits and council proposals without a quota while preserving failed audit costs", () => {
    const audit = {type:"CITY_AUDIT",playerId:"a",targetId:"b",term:1} as const;
    const three = step(step(step(table(),audit),audit),{...audit,targetId:"c"});
    expect(player(three,"a").cash).toBe(1425);
    expect(player(three,"b").cash).toBe(1550);
    expect(player(three,"c").cash).toBe(1525);
    const project = {type:"CITY_PROPOSE",playerId:"a",term:1,policy:"credit"} as const;
    const opened = step(three,project);
    expect(opened.mayor?.proposal?.kind).toBe("credit");
    expect(step(opened,project).notice).toBeTruthy();
    const another = step(round(opened),{...project,policy:"rent-relief",district:"brown"});
    expect(another.mayor?.proposal?.kind).toBe("rent-relief");
  });

  it("moves every solvent rival five spaces once per Mayor term without opening landing decisions", () => {
    let game = changePlayer(changePlayer(table(),"b",{position:38}),"c",{position:10,inJail:true,jailTurns:2});
    const order = {type:"CITY_MOVE_RIVALS",playerId:"a",term:1} as const;
    expect(step(turn(game,"b"),order).notice).toBeTruthy();
    const moved = step(game,order);
    expect(player(moved,"a").position).toBe(0);
    expect(player(moved,"b")).toMatchObject({position:3,cash:1700});
    expect(player(moved,"c")).toMatchObject({position:15,inJail:false,jailTurns:0});
    expect(moved.phase).toBe("awaitingRoll");
    expect(moved.activePlayerId).toBe("a");
    expect(moved.pendingPurchase).toBeUndefined();
    expect(moved.lastRoll).toBeUndefined();
    expect(planPresentation(game,moved).filter(frame=>frame.kind==="move").map(frame=>frame.route?.length)).toEqual([5,5]);
    expect(step(moved,order).notice).toBeTruthy();
    game = end(round(round(moved)));
    expect(game.activePlayerId).toBe("b");
    expect(step(game,{...order,playerId:"b",term:2}).notice).toBeUndefined();
  });

  it("charges ₹75 for the next station and resolves its deed while leaving Transit Day in legacy rooms", () => {
    const current = changePlayer(table(),"a",{position:5});
    const legacy = changePlayer(table(false),"a",{position:5});
    const transit = {type:"CITY_PROPOSE",playerId:"a",term:1,policy:"transit"} as const;
    const ride = {type:"CITY_EXPRESS",playerId:"a"} as const;
    expect(trainOffer(current,"a")).toEqual({to:15,fare:75});
    expect(step(current,transit).notice).toBeTruthy();
    expect(step(changePlayer(current,"a",{cash:74}),ride).notice).toBeTruthy();
    const arrived = step(current,ride);
    expect(player(arrived,"a")).toMatchObject({position:15,cash:1425});
    expect(arrived.mayor?.treasury).toBe(400);
    expect(arrived.pendingPurchase).toEqual({playerId:"a",propertyId:15});
    expect(trainOffer(legacy,"a")?.fare).toBe(75);
    expect(step(legacy,transit).notice).toBeUndefined();
    const station = {ownerId:"a",houses:0 as const,mortgaged:false};
    expect(cityContractReady({...current,properties:{...current.properties,5:station,15:station}},"a","transit")).toBe(true);
  });

  it("wraps to the first station for ₹75 without GO salary and charges the destination rent", () => {
    const game = turn(changePlayer(table(),"b",{position:35}),"b");
    const state = {...game,properties:{...game.properties,5:{ownerId:"a",houses:0 as const,mortgaged:false}}};
    const arrived = step(state,{type:"CITY_EXPRESS",playerId:"b"});
    expect(arrived.phase).toBe("awaitingEndTurn");
    expect(player(arrived,"b")).toMatchObject({position:5,cash:1400});
    expect(player(arrived,"a").cash).toBe(1525);
    expect(trainOffer({...arrived,phase:"awaitingRoll"},"b")).toBeUndefined();
  });
});
