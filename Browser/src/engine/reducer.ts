import {
  cityText,
  getBoard,
  boardSizeForPlayers,
  classicPosition,
  railroadPositions,
  utilityPositions,
  cardAt,
  colorGroupTiles,
  getPurchasableTile,
  getTile,
  isPurchasableTile,
  isStreetTile
} from "./board";
import { formatRupees } from "./currency";
import {
  AUDIT_FINE, CITY_CONTRACTS, CITY_CONTRACT_REWARD, CITY_POLICIES, LOAN_AMOUNT, LOAN_REPAYMENT, TRAIN_FARE, WHEEL_SECTIONS,
  advanceCityRound, auctionCredit, canChallengeCityProject, cityAuctionBacking, cityContractReady, cityLoanAvailable, cityLoanTotal,
  cityPolicyAvailable, cityStable, councilSpeaker, districtName, fortPosition, newTerm, nextCityTurn,
  nextMayor, permitPaused, recordRent, rentRelief, reserveLevy, startCity, trainOffer, updateCitySeat
} from "./mayor";
import type { CityAction, TaxBill } from "./mayor";
import { isPlayerColorTaken, playerColorKey, PLAYER_COLORS } from "./playerColors";
import { canClassicTradeProperty, reduceClassic, startClassic } from "./classic";
import { cityInfo, isCityId } from './cities';
import {isWorldId,worldInfo} from './worlds';
import type {
  AuctionState,
  BoardSize,
  DebtResumePhase,
  CardDeck,
  CardDraw,
  GameAction,
  GameEvent,
  GameState,
  Player,
  PropertyState,
  PurchasableTile,
  StreetTile,
  TradeOffer
} from "./types";

const MAX_EVENTS = 60;
const GO_REWARD = 200;
const JAIL_FINE = 50;
type PaymentTarget = string | "bank";

export const createInitialState = (roomCode = "", boardSize: BoardSize = 40): GameState => {
  const properties: Record<number, PropertyState> = {};
  for (const tile of getBoard(boardSize)) {
    if (isPurchasableTile(tile)) {
      properties[tile.position] = { houses: 0, mortgaged: false };
    }
  }

  return {
    roomCode,
    boardSize,
    phase: "lobby",
    players: [],
    properties,
    bankHouses: 32 + (boardSize - 40) * 2,
    bankHotels: 12 + (boardSize - 40) / 2,
    consecutiveDoubles: 0,
    eventLog: [],
    nextEventId: 1
  };
};

const addEvent = (
  state: GameState,
  text: string,
  kind: GameEvent["kind"] = "info",
  detail: Partial<Omit<GameEvent, "id" | "kind" | "text">> = {}
): GameState => ({
  ...state,
  eventLog: [{ id: state.nextEventId, kind, text, ...detail }, ...state.eventLog].slice(0, MAX_EVENTS),
  nextEventId: state.nextEventId + 1,
  notice: kind === "error" ? text : undefined
});

const reject = (state: GameState, message: string): GameState => addEvent(state, message, "error");

const playerById = (state: GameState, playerId: string): Player | undefined =>
  state.players.find((player) => player.id === playerId);

const withPlayer = (
  state: GameState,
  playerId: string,
  update: (player: Player) => Player
): GameState => ({
  ...state,
  players: state.players.map((player) => (player.id === playerId ? update(player) : player))
});

const withProperty = (
  state: GameState,
  propertyId: number,
  update: (property: PropertyState) => PropertyState
): GameState => ({
  ...state,
  properties: {
    ...state.properties,
    [propertyId]: update(state.properties[propertyId] as PropertyState)
  }
});

const changeCash = (state: GameState, playerId: string, delta: number): GameState =>
  withPlayer(state, playerId, (player) => ({ ...player, cash: player.cash + delta }));

const playerName = (state: GameState, playerId: string): string =>
  playerById(state, playerId)?.name ?? "Player";

const isWholeNonNegative = (value: number): boolean =>
  Number.isSafeInteger(value) && value >= 0;

const isValidDice = (dice: readonly number[]): boolean =>
  dice.length === 2 && dice.every((die) => Number.isInteger(die) && die >= 1 && die <= 6);

const isActive = (state: GameState, playerId: string): boolean =>
  state.activePlayerId === playerId && Boolean(playerById(state, playerId));

const isNormalTurnPhase = (state: GameState): boolean =>
  state.phase === "awaitingRoll" || state.phase === "awaitingEndTurn";

export const decisionPlayerId = (state: GameState): string | undefined => state.debts?.[0]?.playerId ??
  (state.phase === "awaitingMortgageDecision" ? state.mortgageTransfers?.[0]?.playerId : state.activePlayerId);
const canManageFinances = (state: GameState, playerId: string): boolean =>
  (isNormalTurnPhase(state) || state.phase === "awaitingDebt" || state.phase === "awaitingJailPayment") && decisionPlayerId(state) === playerId;

export const netWorth = (state: GameState, playerId: string): number => {
  const player = playerById(state, playerId);
  if (!player) {
    return 0;
  }

  return getBoard(state.boardSize).reduce((total, tile) => {
    if (!isPurchasableTile(tile)) {
      return total;
    }
    const property = state.properties[tile.position] as PropertyState;
    if (property.ownerId !== playerId) {
      return total;
    }
    const improvements = isStreetTile(tile) ? state.mode === "classic" && property.buildingCosts
      ? property.buildingCosts.reduce((n, cost) => n + cost, 0) : property.houses * tile.houseCost : 0;
    return total + tile.price + improvements - (property.mortgaged ? tile.mortgageValue : 0);
  }, player.cash);
};

export const playerOwnsFullGroup = (
  state: GameState,
  playerId: string,
  group: StreetTile["group"]
): boolean =>
  colorGroupTiles(group, state.boardSize).every(
    (tile) => (state.properties[tile.position] as PropertyState).ownerId === playerId
  );

const groupIsUnmortgaged = (
  state: GameState,
  group: StreetTile["group"]
): boolean =>
  colorGroupTiles(group, state.boardSize).every(
    (tile) => !(state.properties[tile.position] as PropertyState).mortgaged
  );

export const canTradeProperty = (state: GameState, propertyId: number, playerId: string): boolean => {
  if (state.mode === "classic") return canClassicTradeProperty(state, propertyId, playerId);
  const tile = getPurchasableTile(propertyId, state.boardSize);
  const property = state.properties[propertyId];
  return Boolean(tile && property?.ownerId === playerId && property.houses === 0 &&
    (tile.kind !== "property" || colorGroupTiles(tile.group, state.boardSize).every(
      (member) => state.properties[member.position]?.houses === 0
    )));
};

export const calculateRent = (
  state: GameState,
  propertyId: number,
  diceTotal: number
): number => {
  const tile = getPurchasableTile(propertyId, state.boardSize);
  const property = state.properties[propertyId];
  if (!tile || !property?.ownerId || property.mortgaged) {
    return 0;
  }

  if (tile.kind === "property") {
    const base = tile.rent[property.houses];
    return property.houses === 0 && playerOwnsFullGroup(state, property.ownerId, tile.group)
      ? base * 2
      : base;
  }

  if (tile.kind === "railroad") {
    const ownedRailroads = railroadPositions(state.boardSize).filter(
      (position) => state.properties[position]?.ownerId === property.ownerId
    ).length;
    return [0, 25, 50, 100, 200][ownedRailroads] as number;
  }

  const ownedUtilities = utilityPositions(state.boardSize).filter(
    (position) => state.properties[position]?.ownerId === property.ownerId
  ).length;
  return diceTotal * (ownedUtilities === 2 ? 10 : 4);
};

const bankruptPlayer = (state: GameState, playerId: string, creditor: PaymentTarget, surrender = false): GameState => {
  const player = playerById(state, playerId);
  if (!player || player.bankrupt || (!surrender && netWorth(state, playerId) >= 0)) {
    return state;
  }

  const creditorPlayer = creditor === "bank" ? undefined : playerById(state, creditor);
  const transferToCreditor = Boolean(creditorPlayer && !creditorPlayer.bankrupt);
  let bankHouses = state.bankHouses;
  let bankHotels = state.bankHotels;
  const properties = { ...state.properties };
  const repossessed: number[] = [];
  let buildingProceeds = 0;

  for (const tile of getBoard(state.boardSize)) {
    if (!isPurchasableTile(tile)) {
      continue;
    }
    const property = properties[tile.position] as PropertyState;
    if (property.ownerId !== playerId) {
      continue;
    }
    if (tile.kind === "property") {
      buildingProceeds += Math.floor(property.houses * tile.houseCost / 2);
      if (property.houses === 5) {
        bankHotels += 1;
      } else {
        bankHouses += property.houses;
      }
    }
    properties[tile.position] = transferToCreditor
      ? { ...property, houses: 0, ownerId: creditor }
      : { houses: 0, mortgaged: false };
    if (!transferToCreditor) repossessed.push(tile.position);
  }

  let next: GameState = {
    ...state,
    properties,
    bankHouses,
    bankHotels,
    bankAuctionQueue: repossessed.length ? [...(state.bankAuctionQueue ?? []), ...repossessed] : state.bankAuctionQueue,
    players: state.players.map((candidate) =>
      candidate.id === playerId
        ? { ...candidate, bankrupt: true, inJail: false, getOutOfJailCards: 0 }
        : transferToCreditor && candidate.id === creditor
          ? { ...candidate, cash: candidate.cash + buildingProceeds, getOutOfJailCards: candidate.getOutOfJailCards + player.getOutOfJailCards }
          : candidate
    )
  };
  next = addEvent(
    next,
    transferToCreditor
      ? `${player.name} is bankrupt. Their properties go to ${playerName(next, creditor as string)}.`
      : `${player.name} is bankrupt. Their properties return to the bank.`,
    "money", { playerId }
  );

  const solvent = next.players.filter((candidate) => !candidate.bankrupt);
  if (solvent.length <= 1) {
    return {
      ...next,
      phase: "gameOver",
      activePlayerId: solvent[0]?.id,
      pendingRoll: undefined,
      pendingPurchase: undefined,
      auction: undefined,
      pendingTrade: undefined,
      bankAuctionQueue: undefined,
      bankAuctionResumePhase: undefined,
      winnerId: solvent[0]?.id
    };
  }
  return next;
};

const makePayment = (
  state: GameState,
  fromPlayerId: string,
  target: PaymentTarget,
  amount: number,
  reason: string,
  kind?: "rent" | "city"
): GameState => {
  if (amount <= 0) {
    return state;
  }
  const scratch = state.mayor?.wheel;
  // A saved prize already belongs to the player. Count it before an audit can eliminate that seat.
  if (scratch?.playerId === fromPlayerId && scratch.prize && (playerById(state, fromPlayerId)?.cash ?? 0) < amount) {
    state = closeWheel(state, true);
  }
  const available = Math.max(0, playerById(state, fromPlayerId)?.cash ?? 0);
  let next = changeCash(state, fromPlayerId, -amount);
  if (target !== "bank") {
    next = changeCash(next, target, Math.min(available, amount));
  }
  const paid = Math.min(available, amount);
  if (kind === "rent") next = recordRent(next, target, paid);
  if (kind === "city" && next.mayor) next = { ...next, mayor: { ...next.mayor, treasury: next.mayor.treasury + paid } };
  if ((playerById(next, fromPlayerId)?.cash ?? 0) < 0) {
    next = { ...next, debts: [...(next.debts ?? []), {
      playerId: fromPlayerId, creditorId: target, reason,
      ...(kind === "city" ? { city: true } : kind === "rent" && state.mayor ? { rent: true } : {})
    }] };
  }
  next = addEvent(
    next,
    `${playerName(next, fromPlayerId)} paid ${formatRupees(amount)} ${reason}.`,
    "money", { playerId: fromPlayerId, amount, recipientId: target }
  );
  return bankruptPlayer(next, fromPlayerId, target);
};

const finishLanding = (state: GameState): GameState => {
  if (state.phase === "gameOver") return state;
  const next: GameState = { ...state, phase: "awaitingEndTurn" };
  const active = state.players.find((player) => player.id === state.activePlayerId);
  // Eliminated players no longer have controls, so their turn must advance here.
  return active?.bankrupt
    ? handleEndTurn(next, { type: "END_TURN", playerId: active.id })
    : next;
};

const moveForward = (state: GameState, playerId: string, spaces: number): GameState => {
  const player = playerById(state, playerId) as Player;
  const rawPosition = player.position + spaces;
  const position = rawPosition % state.boardSize;
  let next = withPlayer(state, playerId, (candidate) => ({ ...candidate, position }));
  next = addEvent(next, `${player.name} moved to ${getTile(position, state.boardSize).name}.`, "turn", { playerId, position });
  if (rawPosition >= state.boardSize) {
    next = changeCash(next, playerId, GO_REWARD);
    next = updateCitySeat(next, playerId, seat => ({ ...seat, rodeExpress: undefined }));
    next = addEvent(next, `${player.name} passed GO and collected ${formatRupees(GO_REWARD)}.`, "money");
  }
  return next;
};

const moveTo = (
  state: GameState,
  playerId: string,
  position: number,
  awardGo?: boolean
): GameState => {
  const player = playerById(state, playerId) as Player;
  let next = withPlayer(state, playerId, (candidate) => ({ ...candidate, position }));
  next = addEvent(next, `${player.name} moved to ${getTile(position, state.boardSize).name}.`, "turn", { playerId, position });
  if (awardGo === true || (awardGo !== false && position < player.position)) {
    next = changeCash(next, playerId, GO_REWARD);
    next = updateCitySeat(next, playerId, seat => ({ ...seat, rodeExpress: undefined }));
    next = addEvent(next, `${player.name} collected ${formatRupees(GO_REWARD)} for passing GO.`, "money");
  }
  return next;
};

const nearestRailroad = (position: number, size: BoardSize): number =>
  railroadPositions(size).find((railroad) => railroad > position) ?? railroadPositions(size)[0]!;

const sendToJail = (state: GameState, playerId: string, reason: string): GameState => {
  let next = withPlayer(state, playerId, (player) => ({
    ...player,
    position: state.boardSize / 4,
    inJail: true,
    jailTurns: 0
  }));
  next = {
    ...next,
    phase: "awaitingEndTurn",
    pendingRoll: undefined,
    pendingPurchase: undefined,
    consecutiveDoubles: 0
  };
  return addEvent(next, `${playerName(next, playerId)} went to Jail (${reason}).`, "turn", { playerId, position: state.boardSize / 4 });
};

const previewCardDestination = (position: number, draw: CardDraw, size: BoardSize): number | "jail" | undefined => {
  const card = cardAt(draw.deck, draw.index);
  if (!card) {
    return undefined;
  }
  switch (card.effect.kind) {
    case "moveTo":
      return classicPosition(card.effect.position, size);
    case "nearestRailroad":
      return nearestRailroad(position, size);
    case "moveRelative":
      return (position + card.effect.spaces + size) % size;
    case "goToJail":
      return "jail";
    default:
      return undefined;
  }
};

const validateCardDraws = (
  startPosition: number,
  spaces: number,
  draws: readonly CardDraw[],
  size: BoardSize
): string | undefined => {
  let position = (startPosition + spaces) % size;
  let drawIndex = 0;

  for (let depth = 0; depth < 4; depth += 1) {
    const tile = getTile(position, size);
    if (tile.kind !== "chance" && tile.kind !== "community") {
      return drawIndex === draws.length ? undefined : "Unexpected card draw supplied.";
    }

    const draw = draws[drawIndex];
    if (!draw || draw.deck !== tile.kind || !Number.isInteger(draw.index) || !cardAt(draw.deck, draw.index)) {
      return `A valid ${tile.kind} card draw is required.`;
    }
    drawIndex += 1;
    const destination = previewCardDestination(position, draw, size);
    if (destination === "jail" || destination === undefined) {
      return drawIndex === draws.length ? undefined : "Unexpected card draw supplied.";
    }
    position = destination;
  }
  return "Card movement chain is too deep.";
};

const resolveCard = (
  state: GameState,
  playerId: string,
  diceTotal: number,
  draws: readonly CardDraw[],
  drawIndex: number
): GameState => {
  const draw = draws[drawIndex] as CardDraw;
  const card = cardAt(draw.deck, draw.index);
  if (!card) {
    return reject(state, "Invalid card draw.");
  }

  let next: GameState = {
    ...state,
    card: { deck: draw.deck, index: draw.index, text: card.text, playerId }
  };
  next = addEvent(next, `${playerName(next, playerId)} drew: ${card.text}`, "card", { playerId, deck: draw.deck, cardIndex: draw.index });

  switch (card.effect.kind) {
    case "money":
      if (card.effect.amount >= 0) {
        next = changeCash(next, playerId, card.effect.amount);
        next = addEvent(next, `${playerName(next, playerId)} received ${formatRupees(card.effect.amount)}.`, "money");
      } else {
        next = makePayment(next, playerId, "bank", -card.effect.amount, "for a card");
      }
      return finishLanding(next);
    case "moveTo":
      return resolveLanding(
        moveTo(next, playerId, classicPosition(card.effect.position, state.boardSize), card.effect.awardGo),
        playerId,
        diceTotal,
        draws,
        drawIndex + 1
      );
    case "nearestRailroad":
      return resolveLanding(
        moveTo(next, playerId, nearestRailroad((playerById(next, playerId) as Player).position, state.boardSize)),
        playerId,
        diceTotal,
        draws,
        drawIndex + 1,
        2
      );
    case "moveRelative": {
      const current = playerById(next, playerId) as Player;
      const destination = (current.position + card.effect.spaces + state.boardSize) % state.boardSize;
      return resolveLanding(
        moveTo(next, playerId, destination, false),
        playerId,
        diceTotal,
        draws,
        drawIndex + 1
      );
    }
    case "goToJail":
      return sendToJail(next, playerId, "card");
    case "jailCard":
      next = withPlayer(next, playerId, (player) => ({
        ...player,
        getOutOfJailCards: player.getOutOfJailCards + 1
      }));
      return finishLanding(next);
    case "collectFromEach": {
      for (const player of next.players) {
        if (player.id !== playerId && !player.bankrupt) {
          next = makePayment(next, player.id, playerId, card.effect.amount, "to another player");
        }
      }
      return finishLanding(next);
    }
    default: return reject(state, "That card effect is unavailable in Expanding mode.");
  }
};

const resolveLanding = (
  state: GameState,
  playerId: string,
  diceTotal: number,
  draws: readonly CardDraw[],
  drawIndex = 0,
  railroadMultiplier = 1
): GameState => {
  if (state.phase === "gameOver") {
    return state;
  }
  const player = playerById(state, playerId) as Player;
  const tile = getTile(player.position, state.boardSize);

  if (isPurchasableTile(tile)) {
    const property = state.properties[tile.position] as PropertyState;
    if (!property.ownerId) {
      return {
        ...state,
        phase: "awaitingBuy",
        pendingPurchase: { playerId, propertyId: tile.position }
      };
    }
    if (property.ownerId === playerId || property.mortgaged) {
      return finishLanding(state);
    }
    const rent = calculateRent(state, tile.position, diceTotal) * (tile.kind === "railroad" ? railroadMultiplier : 1);
    const discount = rentRelief(state, playerId, tile, rent);
    if (discount > 0) {
      const round = state.mayor!.round;
      state = civicEvent(updateCitySeat(state, playerId, seat => ({ ...seat, rentReliefRound: round })),
        `Rent Relief saved ${playerName(state, playerId)} ${formatRupees(discount)} at ${tile.name}.`,
        "policy", { playerId, position: tile.position, amount: discount });
    }
    return finishLanding(
      makePayment(state, playerId, property.ownerId, rent - discount, `rent for ${tile.name}`, "rent")
    );
  }

  if (tile.kind === "tax") {
    return finishLanding(makePayment(state, playerId, "bank", tile.amount, `for ${tile.name}`));
  }
  if (tile.kind === "chance" || tile.kind === "community") {
    return resolveCard(state, playerId, diceTotal, draws, drawIndex);
  }
  if (tile.kind === "goToJail") {
    return sendToJail(state, playerId, "board space");
  }
  return finishLanding(state);
};

const handleJoin = (state: GameState, action: Extract<GameAction, { type: "JOIN" }>): GameState => {
  if (playerById(state, action.player.id)) return state;
  if (state.phase !== "lobby") {
    return reject(state, "The game has already started.");
  }
  if (state.players.length >= 6) {
    return reject(state, "This room is full.");
  }
  const { id, name, color } = action.player;
  if (!id || !name.trim() || !color || playerById(state, id)) {
    return reject(state, "Choose a unique name and player identity.");
  }
  if (!playerColorKey(color) || isPlayerColorTaken(state.players, color)) {
    return reject(state, "That token colour is already taken. Choose a different colour.");
  }
  const player: Player = {
    id,
    name: name.trim(),
    color: playerColorKey(color),
    tokenId: action.player.tokenId,
    diceId: action.player.diceId,
    cash: 1500,
    position: 0,
    inJail: false,
    jailTurns: 0,
    getOutOfJailCards: 0,
    bankrupt: false
  };
  const players = [...state.players, player];
  const boardSize = state.mode === "classic" ? 40 : boardSizeForPlayers(players.length);
  const board = boardSize === state.boardSize ? state : {
    ...state, boardSize, properties: createInitialState(state.roomCode, boardSize).properties,
    bankHouses: 32 + (boardSize - 40) * 2, bankHotels: 12 + (boardSize - 40) / 2
  };
  return addEvent({ ...board, players }, `${player.name} joined the room.`);
};

const handleStart = (state: GameState, action: Extract<GameAction, { type: "START" }>): GameState => {
  if (state.phase !== "lobby") {
    return reject(state, "The game is already in progress.");
  }
  if (state.players[0]?.id !== action.playerId) {
    return reject(state, "Only the room creator can start the game.");
  }
  if (state.players.length < 2) {
    return reject(state, "At least two players are needed to start.");
  }
  if (state.players.some(player => isPlayerColorTaken(state.players, player.color, player.id))) {
    return reject(state, "Every player must choose a different token colour before starting.");
  }
  if (!playerById(state, action.firstPlayerId)) {
    return reject(state, "Choose a player in this room to go first.");
  }
  if (state.mode === "classic") return startClassic(state, action);
  return addEvent(
    { ...state, phase: "awaitingRoll", activePlayerId: action.firstPlayerId,
      ...(state.mode === "mayor" ? { mayor: startCity(state.players, action.firstPlayerId) } : {}) },
    `${playerName(state, action.firstPlayerId)} goes first.`,
    "turn"
  );
};

const handleRoll = (state: GameState, action: Extract<GameAction, { type: "ROLL" }>): GameState => {
  if (state.phase !== "awaitingRoll" || !isActive(state, action.playerId)) {
    return reject(state, "It is not your roll.");
  }
  const player = playerById(state, action.playerId) as Player;
  if (player.bankrupt || !isValidDice(action.dice)) {
    return reject(state, "Use two valid dice to roll.");
  }
  const total = action.dice[0] + action.dice[1];
  const doubles = action.dice[0] === action.dice[1];
  const roll = {
    playerId: action.playerId,
    dice: action.dice,
    total,
    doubles,
    grantsExtraRoll: doubles && !player.inJail
  };

  if (player.inJail) {
    if (doubles) {
      let next = withPlayer(state, player.id, (candidate) => ({
        ...candidate,
        inJail: false,
        jailTurns: 0
      }));
      next = {
        ...next,
        phase: "awaitingMove",
        pendingRoll: roll,
        lastRoll: roll,
        consecutiveDoubles: 0
      };
      return addEvent(next, `${player.name} rolled doubles and left Jail.`, "turn");
    }
    const failedRolls = player.jailTurns + 1;
    let next = withPlayer(state, player.id, (candidate) => ({ ...candidate, jailTurns: failedRolls }));
    next = { ...next, lastRoll: roll, consecutiveDoubles: 0 };
    if (failedRolls >= 3) {
      return addEvent(
        { ...next, phase: "awaitingJailPayment", pendingRoll: roll },
        `${player.name} must pay ${formatRupees(JAIL_FINE)} before moving.`,
        "turn"
      );
    }
    return addEvent(
      { ...next, phase: "awaitingEndTurn", pendingRoll: undefined },
      `${player.name} did not roll doubles and remains in Jail.`,
      "turn"
    );
  }

  if (doubles && state.consecutiveDoubles >= 2) {
    const lastRoll = { ...roll, grantsExtraRoll: false };
    return sendToJail({ ...state, lastRoll }, action.playerId, "three consecutive doubles");
  }

  const next: GameState = {
    ...state,
    phase: "awaitingMove",
    pendingRoll: roll,
    lastRoll: roll,
    consecutiveDoubles: doubles ? state.consecutiveDoubles + 1 : 0
  };
  return addEvent(next, `${player.name} rolled ${action.dice[0]} + ${action.dice[1]}.`, "turn");
};

const handleMoveResult = (
  state: GameState,
  action: Extract<GameAction, { type: "MOVE_RESULT" }>
): GameState => {
  if (state.phase !== "awaitingMove" || !state.pendingRoll || state.pendingRoll.playerId !== action.playerId) {
    return reject(state, "There is no move waiting for this player.");
  }
  const player = playerById(state, action.playerId) as Player;
  const draws = action.cardDraws ?? [];
  const cardError = validateCardDraws(player.position, state.pendingRoll.total, draws, state.boardSize);
  if (cardError) {
    return reject(state, cardError);
  }
  const pendingRoll = state.pendingRoll;
  const moved = moveForward(
    { ...state, pendingRoll: undefined, card: undefined, notice: undefined },
    action.playerId,
    pendingRoll.total
  );
  return resolveLanding(moved, action.playerId, pendingRoll.total, draws);
};

const handleBuy = (state: GameState, action: Extract<GameAction, { type: "BUY" }>): GameState => {
  const pending = state.pendingPurchase;
  if (
    state.phase !== "awaitingBuy" ||
    !pending ||
    pending.playerId !== action.playerId ||
    pending.propertyId !== action.propertyId ||
    !isActive(state, action.playerId)
  ) {
    return reject(state, "There is no property available for this purchase.");
  }
  const tile = getPurchasableTile(action.propertyId, state.boardSize) as PurchasableTile;
  const property = state.properties[action.propertyId] as PropertyState;
  const player = playerById(state, action.playerId) as Player;
  if (property.ownerId || player.cash < tile.price) {
    return reject(state, "You cannot afford this property.");
  }
  let next = withProperty(state, action.propertyId, (candidate) => ({
    ...candidate,
    ownerId: action.playerId
  }));
  next = changeCash(next, action.playerId, -tile.price);
  next = { ...next, phase: "awaitingEndTurn", pendingPurchase: undefined };
  return addEvent(next, `${player.name} bought ${tile.name} for ${formatRupees(tile.price)}.`, "money", { playerId: player.id, position: tile.position, amount: tile.price });
};

const handleDeclineBuy = (
  state: GameState,
  action: Extract<GameAction, { type: "DECLINE_BUY" }>
): GameState => {
  const pending = state.pendingPurchase;
  if (
    state.phase !== "awaitingBuy" ||
    !pending ||
    pending.playerId !== action.playerId ||
    !isActive(state, action.playerId)
  ) {
    return reject(state, "There is no property to decline.");
  }
  const tile = getPurchasableTile(pending.propertyId, state.boardSize) as PurchasableTile;
  const auction: AuctionState = {
    propertyId: pending.propertyId,
    landingPlayerId: action.playerId,
    currentBid: 0,
    eligiblePlayerIds: state.players.filter((player) => !player.bankrupt).map((player) => player.id),
    passedPlayerIds: []
  };
  return addEvent(
    { ...state, phase: "awaitingAuction", pendingPurchase: undefined, auction },
    `${tile.name} is up for auction.`
  );
};

const auctionIsFinished = (auction: AuctionState): boolean => {
  if (!auction.highestBidderId) {
    return auction.eligiblePlayerIds.every((playerId) => auction.passedPlayerIds.includes(playerId));
  }
  return auction.eligiblePlayerIds
    .filter((playerId) => playerId !== auction.highestBidderId)
    .every((playerId) => auction.passedPlayerIds.includes(playerId));
};

const finishAuction = (state: GameState, auction: AuctionState): GameState => {
  const tile = getPurchasableTile(auction.propertyId, state.boardSize) as PurchasableTile;
  const phase = state.bankAuctionResumePhase ?? "awaitingEndTurn";
  const finished = { ...state, phase, auction: undefined, bankAuctionResumePhase: undefined };
  if (!auction.highestBidderId) {
    return addEvent(
      finished,
      `Nobody bought ${tile.name}; it stays with the bank.`
    );
  }
  const winner = playerById(state, auction.highestBidderId) as Player;
  let next = withProperty(finished, auction.propertyId, (property) => ({
    ...property,
    ownerId: winner.id
  }));
  const shortfall = Math.max(0, auction.currentBid - winner.cash);
  if (shortfall && auctionCredit(auction, winner.id) >= shortfall) {
    const due = cityLoanTotal(shortfall);
    next = fundCityLoan(next, winner.id, shortfall, due);
    next = civicEvent(next, `City Hall backed ${winner.name} with ${formatRupees(shortfall)}. Repayment ${formatRupees(due)}.`,
      "auction", { playerId: winner.id, position: tile.position, amount: shortfall });
  }
  next = changeCash(next, winner.id, -auction.currentBid);
  return addEvent(next, `${winner.name} won ${tile.name} for ${formatRupees(auction.currentBid)}.`, "money", { playerId: winner.id, position: tile.position, amount: auction.currentBid });
};

const handleAuctionBid = (
  state: GameState,
  action: Extract<GameAction, { type: "AUCTION_BID" }>
): GameState => {
  const auction = state.auction;
  const bidder = playerById(state, action.playerId);
  if (
    state.phase !== "awaitingAuction" ||
    !auction ||
    !bidder ||
    bidder.bankrupt ||
    !auction.eligiblePlayerIds.includes(action.playerId) ||
    auction.passedPlayerIds.includes(action.playerId)
  ) {
    return reject(state, "You are not eligible for this auction.");
  }
  if (action.pass) {
    if (auction.highestBidderId === action.playerId) {
      return reject(state, "The leading bidder cannot pass.");
    }
    const updated = { ...auction, passedPlayerIds: [...auction.passedPlayerIds, action.playerId] };
    const next = addEvent({ ...state, auction: updated }, `${bidder.name} passed the auction.`);
    return auctionIsFinished(updated) ? finishAuction(next, updated) : next;
  }
  if (
    !isWholeNonNegative(action.amount ?? -1) ||
    (action.amount as number) <= auction.currentBid ||
    (action.amount as number) > bidder.cash + auctionCredit(auction, bidder.id) ||
    auction.highestBidderId === action.playerId
  ) {
    return reject(state, "Bids must increase and be affordable.");
  }
  const updated: AuctionState = {
    ...auction,
    currentBid: action.amount as number,
    highestBidderId: action.playerId
  };
  const next = addEvent({ ...state, auction: updated }, `${bidder.name} bid ${formatRupees(action.amount as number)}.`);
  return auctionIsFinished(updated) ? finishAuction(next, updated) : next;
};

const handleBuild = (state: GameState, action: Extract<GameAction, { type: "BUILD" }>): GameState => {
  if (!canManageFinances(state, action.playerId)) {
    return reject(state, "Buildings can only change during your turn.");
  }
  const player = playerById(state, action.playerId) as Player;
  const tile = getPurchasableTile(action.propertyId, state.boardSize);
  const property = state.properties[action.propertyId];
  if (!tile || !property || tile.kind !== "property" || property.ownerId !== player.id) {
    return reject(state, "You can only improve one of your color properties.");
  }
  const groupTiles = colorGroupTiles(tile.group, state.boardSize);
  const groupStates = groupTiles.map((groupTile) => state.properties[groupTile.position] as PropertyState);
  if (!playerOwnsFullGroup(state, player.id, tile.group) || !groupIsUnmortgaged(state, tile.group)) {
    return reject(state, "You need an unmortgaged full color set to build.");
  }
  if (action.operation === "sellGroup") {
    if (!groupStates.some(property => property.houses > 0)) return reject(state, "There are no buildings in this district to sell.");
    let next = state, proceeds = 0, houses = 0, hotels = 0;
    // A complete district can be liquidated without borrowing nonexistent bank houses.
    for (const member of groupTiles) {
      const level = state.properties[member.position]!.houses;
      proceeds += Math.floor(level * member.houseCost / 2);
      if (level === 5) hotels++; else houses += level;
      next = withProperty(next, member.position, property => ({ ...property, houses: 0 }));
    }
    next = changeCash({ ...next, bankHouses: next.bankHouses + houses, bankHotels: next.bankHotels + hotels }, player.id, proceeds);
    return addEvent(next, `${player.name} sold all district buildings near ${tile.name} for ${formatRupees(proceeds)}.`, "money", { playerId: player.id, position: tile.position, amount: proceeds });
  }
  const levels = groupStates.map((groupState) => groupState.houses);
  const minimum = Math.min(...levels);
  const maximum = Math.max(...levels);

  if (action.operation === "build") {
    if (permitPaused(state, tile.group)) return reject(state, "City Hall paused building permits in this district for the round.");
    if (property.houses >= 5 || property.houses !== minimum || player.cash < tile.houseCost) {
      return reject(state, "Build evenly and make sure you can pay the house cost.");
    }
    let next: GameState;
    if (property.houses === 4) {
      if (state.bankHotels < 1) {
        return reject(state, "The bank has no hotels left.");
      }
      next = withProperty(
        { ...state, bankHouses: state.bankHouses + 4, bankHotels: state.bankHotels - 1 },
        action.propertyId,
        (candidate) => ({ ...candidate, houses: 5 })
      );
    } else {
      if (state.bankHouses < 1) {
        return reject(state, "The bank has no houses left.");
      }
      next = withProperty(
        { ...state, bankHouses: state.bankHouses - 1 },
        action.propertyId,
        (candidate) => ({ ...candidate, houses: (candidate.houses + 1) as PropertyState["houses"] })
      );
    }
    next = changeCash(next, player.id, -tile.houseCost);
    return addEvent(next, `${player.name} improved ${tile.name}.`, "money");
  }

  if (property.houses === 0 || property.houses !== maximum) {
    return reject(state, "Sell improvements evenly across the color group.");
  }
  let next: GameState;
  if (property.houses === 5) {
    if (state.bankHouses < 4) {
      return reject(state, "The bank needs four houses before this hotel can be sold.");
    }
    next = withProperty(
      { ...state, bankHouses: state.bankHouses - 4, bankHotels: state.bankHotels + 1 },
      action.propertyId,
      (candidate) => ({ ...candidate, houses: 4 })
    );
  } else {
    next = withProperty(
      { ...state, bankHouses: state.bankHouses + 1 },
      action.propertyId,
      (candidate) => ({ ...candidate, houses: (candidate.houses - 1) as PropertyState["houses"] })
    );
  }
  next = changeCash(next, player.id, Math.floor(tile.houseCost / 2));
  return addEvent(next, `${player.name} sold one improvement on ${tile.name}.`, "money");
};

const handleMortgage = (
  state: GameState,
  action: Extract<GameAction, { type: "MORTGAGE" }>
): GameState => {
  if (!canManageFinances(state, action.playerId)) {
    return reject(state, "Mortgages can only change during your turn.");
  }
  const player = playerById(state, action.playerId) as Player;
  const tile = getPurchasableTile(action.propertyId, state.boardSize);
  const property = state.properties[action.propertyId];
  if (!tile || !property || property.ownerId !== player.id) {
    return reject(state, "You do not own that property.");
  }
  if (action.mortgage) {
    if (property.mortgaged) {
      return reject(state, "That property is already mortgaged.");
    }
    if (tile.kind === "property" && colorGroupTiles(tile.group, state.boardSize).some(
      (groupTile) => (state.properties[groupTile.position] as PropertyState).houses > 0
    )) {
      return reject(state, "Sell all buildings in this color group before mortgaging.");
    }
    let next = withProperty(state, action.propertyId, (candidate) => ({ ...candidate, mortgaged: true }));
    next = changeCash(next, player.id, tile.mortgageValue);
    return addEvent(next, `${player.name} mortgaged ${tile.name} for ${formatRupees(tile.mortgageValue)}.`, "money");
  }
  const cost = tile.mortgageValue + Math.ceil(tile.mortgageValue / 10);
  if (!property.mortgaged || player.cash < cost) {
    return reject(state, "You cannot unmortgage that property yet.");
  }
  let next = withProperty(state, action.propertyId, (candidate) => ({ ...candidate, mortgaged: false }));
  next = changeCash(next, player.id, -cost);
  return addEvent(next, `${player.name} unmortgaged ${tile.name} for ${formatRupees(cost)}.`, "money");
};

const handlePay = (state: GameState, action: Extract<GameAction, { type: "PAY" }>): GameState => {
  const player = playerById(state, action.playerId);
  if (
    !player ||
    !isActive(state, action.playerId) ||
    !player.inJail ||
    (state.phase !== "awaitingRoll" && state.phase !== "awaitingJailPayment")
  ) {
    return reject(state, "There is no jail payment waiting for this player.");
  }
  const requiresMove = state.phase === "awaitingJailPayment";
  if (action.kind === "jailCard") {
    if (player.getOutOfJailCards < 1) {
      return reject(state, "You do not have a Get Out of Jail Free card.");
    }
    const released = withPlayer(state, player.id, (candidate) => ({
      ...candidate,
      inJail: false,
      jailTurns: 0,
      getOutOfJailCards: candidate.getOutOfJailCards - 1
    }));
    return addEvent(
      { ...released, phase: requiresMove ? "awaitingMove" : "awaitingRoll" },
      `${player.name} used a Get Out of Jail Free card.`,
      "turn"
    );
  }

  let next = makePayment(state, player.id, "bank", JAIL_FINE, "to leave Jail");
  const updatedPlayer = playerById(next, player.id) as Player;
  if (next.phase === "gameOver") {
    return next;
  }
  if (updatedPlayer.bankrupt) {
    return finishLanding({ ...next, pendingRoll: undefined });
  }
  next = withPlayer(next, player.id, (candidate) => ({ ...candidate, inJail: false, jailTurns: 0 }));
  return { ...next, phase: requiresMove ? "awaitingMove" : "awaitingRoll" };
};

const nextSolventPlayer = (state: GameState, afterPlayerId: string): Player | undefined => {
  const currentIndex = state.players.findIndex((player) => player.id === afterPlayerId);
  if (currentIndex < 0) {
    return undefined;
  }
  for (let offset = 1; offset <= state.players.length; offset += 1) {
    const candidate = state.players[(currentIndex + offset) % state.players.length] as Player;
    if (!candidate.bankrupt) {
      return candidate;
    }
  }
  return undefined;
};

const handleEndTurn = (
  state: GameState,
  action: Extract<GameAction, { type: "END_TURN" }>
): GameState => {
  if (state.phase !== "awaitingEndTurn" || !isActive(state, action.playerId)) {
    return reject(state, "This turn cannot end yet.");
  }
  const player = playerById(state, action.playerId) as Player;
  if (state.mayor?.wheel?.playerId === player.id) state = closeWheel(state, true);
  const rollAgain = Boolean(
    !player.bankrupt && state.lastRoll?.playerId === player.id && state.lastRoll.grantsExtraRoll && !player.inJail
  );
  if (rollAgain) {
    return addEvent(
      {
        ...state,
        phase: "awaitingRoll",
        pendingRoll: undefined,
        pendingPurchase: undefined,
        card: undefined
      },
      `${player.name} rolled doubles and goes again.`,
      "turn"
    );
  }
  const desk = state.mayor;
  if (desk && !desk.auditUsed && desk.mayorId !== player.id && !player.bankrupt &&
      state.players.filter(candidate => !candidate.bankrupt).length === 2 &&
      desk.seats[player.id]?.bills.some(bill => bill.status === "deferred")) {
    state = auditCity(state, player.id);
    if (state.phase === "gameOver" || state.debts?.some(debt => debt.playerId === player.id && !playerById(state, player.id)?.bankrupt)) return state;
  }
  state = settleCityEnd(state, player.id);
  if (state.phase === "gameOver" || state.debts?.some(debt => debt.playerId === player.id && !playerById(state, player.id)?.bankrupt)) return state;
  const nextPlayer = nextSolventPlayer(state, action.playerId);
  if (!nextPlayer || nextPlayer.id === player.id) {
    return {
      ...state,
      phase: "gameOver",
      winnerId: nextPlayer?.id,
      activePlayerId: nextPlayer?.id,
      pendingRoll: undefined,
      pendingPurchase: undefined,
      auction: undefined,
      pendingTrade: undefined
    };
  }
  const curDesk = state.mayor;
  if (curDesk && !curDesk.auditUsed && curDesk.mayorId === player.id &&
      state.players.filter(candidate => !candidate.bankrupt).length === 2 &&
      curDesk.seats[nextPlayer.id]?.bills.some(bill => bill.status === "deferred")) {
    const start = state.players.findIndex(candidate => candidate.id === curDesk.firstId);
    const order = (id: string) => (state.players.findIndex(candidate => candidate.id === id) - start + state.players.length) % state.players.length;
    if (order(nextPlayer.id) <= order(player.id) && curDesk.round + 1 - curDesk.termStart >= 2) {
      state = auditCity(state, nextPlayer.id);
      if (state.phase === "gameOver" || state.debts?.some(debt => !playerById(state, debt.playerId)?.bankrupt)) return state;
    }
  }
  return addEvent(
    {
      ...nextCityTurn(state, action.playerId, nextPlayer.id),
      phase: "awaitingRoll",
      activePlayerId: nextPlayer.id,
      consecutiveDoubles: 0,
      pendingRoll: undefined,
      pendingPurchase: undefined,
      card: undefined
    },
    `${nextPlayer.name}'s turn.`,
    "turn"
  );
};

const uniqueValues = (values: readonly number[]): boolean => new Set(values).size === values.length;

const validTradeTerms = (state: GameState, offer: TradeOffer): string | undefined => {
  const from = playerById(state, offer.fromPlayerId);
  const to = playerById(state, offer.toPlayerId);
  if (
    !from ||
    !to ||
    from.bankrupt ||
    to.bankrupt ||
    !isWholeNonNegative(offer.offeredCash) ||
    !isWholeNonNegative(offer.requestedCash) ||
    offer.offeredCash > Math.max(0, from.cash) ||
    offer.requestedCash > Math.max(0, to.cash) ||
    !uniqueValues(offer.offeredPropertyIds) ||
    !uniqueValues(offer.requestedPropertyIds)
  ) {
    return "The trade terms are no longer valid.";
  }
  if (state.mayor && (offer.offeredCash > 0 && state.mayor.seats[from.id]?.loanDue !== undefined ||
    offer.requestedCash > 0 && state.mayor.seats[to.id]?.loanDue !== undefined)) {
    return "Repay your city loan before offering cash in a trade.";
  }
  const offeredIsValid = offer.offeredPropertyIds.every((id) => canTradeProperty(state, id, from.id));
  const requestedIsValid = offer.requestedPropertyIds.every((id) => canTradeProperty(state, id, to.id));
  return offeredIsValid && requestedIsValid ? undefined : "Only owned, unimproved properties can be traded.";
};

const handleTradeOffer = (
  state: GameState,
  action: Extract<GameAction, { type: "TRADE_OFFER" }>
): GameState => {
  if (
    !canManageFinances(state, action.playerId)
  ) {
    return reject(state, "Trades can only be offered during your turn.");
  }
  if (!action.offerId || action.toPlayerId === action.playerId) {
    return reject(state, "Choose another player and a trade ID.");
  }
  const offer: TradeOffer = {
    id: action.offerId,
    fromPlayerId: action.playerId,
    toPlayerId: action.toPlayerId,
    offeredCash: action.offeredCash,
    offeredPropertyIds: [...action.offeredPropertyIds],
    requestedCash: action.requestedCash,
    requestedPropertyIds: [...action.requestedPropertyIds],
    resumePhase: state.phase as TradeOffer["resumePhase"]
  };
  if (
    offer.offeredCash === 0 &&
    offer.requestedCash === 0 &&
    offer.offeredPropertyIds.length === 0 &&
    offer.requestedPropertyIds.length === 0
  ) {
    return reject(state, "A trade must offer or request something.");
  }
  const error = validTradeTerms(state, offer);
  if (error) {
    return reject(state, error);
  }
  return addEvent(
    { ...state, phase: "awaitingTradeResponse", pendingTrade: offer },
    `${playerName(state, action.playerId)} offered a trade to ${playerName(state, action.toPlayerId)}.`
  );
};

const handleTradeCounter = (state: GameState, action: Extract<GameAction, { type: "TRADE_COUNTER" }>): GameState => {
  const previous = state.pendingTrade;
  if (state.phase !== "awaitingTradeResponse" || !previous || previous.id !== action.previousOfferId || previous.toPlayerId !== action.playerId || !action.offerId || action.offerId === previous.id) return reject(state, "Only the recipient may counter the current offer with a new ID.");
  const offer: TradeOffer = { ...action, id: action.offerId, counterOfId: previous.id, fromPlayerId: action.playerId, toPlayerId: previous.fromPlayerId, resumePhase: previous.resumePhase };
  if (!offer.offeredCash && !offer.requestedCash && !offer.offeredPropertyIds.length && !offer.requestedPropertyIds.length) return reject(state, "A counter-offer must include cash or a deed.");
  const error = validTradeTerms(state, offer);
  return error ? reject(state, error) : addEvent({ ...state, pendingTrade: offer }, `${playerName(state, action.playerId)} counter-offered to ${playerName(state, offer.toPlayerId)}.`, "info", { playerId: action.playerId });
};

const handleTradeAccept = (
  state: GameState,
  action: Extract<GameAction, { type: "TRADE_ACCEPT" }>
): GameState => {
  const offer = state.pendingTrade;
  if (
    state.phase !== "awaitingTradeResponse" ||
    !offer ||
    offer.toPlayerId !== action.playerId ||
    offer.id !== action.offerId
  ) {
    return reject(state, "There is no matching trade to accept.");
  }
  const error = validTradeTerms(state, offer);
  if (error) {
    return reject(state, error);
  }
  let next: GameState = {
    ...state,
    players: state.players.map((player) => {
      if (player.id === offer.fromPlayerId) {
        return { ...player, cash: player.cash - offer.offeredCash + offer.requestedCash };
      }
      if (player.id === offer.toPlayerId) {
        return { ...player, cash: player.cash + offer.offeredCash - offer.requestedCash };
      }
      return player;
    })
  };
  for (const propertyId of offer.offeredPropertyIds) {
    next = withProperty(next, propertyId, (property) => ({ ...property, ownerId: offer.toPlayerId }));
  }
  for (const propertyId of offer.requestedPropertyIds) {
    next = withProperty(next, propertyId, (property) => ({ ...property, ownerId: offer.fromPlayerId }));
  }
  return addEvent(
    { ...next, phase: offer.resumePhase, pendingTrade: undefined },
    `${playerName(next, offer.toPlayerId)} accepted the trade.`,
    "money"
  );
};

const handleTradeDecline = (
  state: GameState,
  action: Extract<GameAction, { type: "TRADE_DECLINE" }>
): GameState => {
  const offer = state.pendingTrade;
  if (
    state.phase !== "awaitingTradeResponse" ||
    !offer ||
    (offer.toPlayerId !== action.playerId && offer.fromPlayerId !== action.playerId) ||
    offer.id !== action.offerId
  ) {
    return reject(state, "There is no matching trade to decline.");
  }
  return addEvent(
    { ...state, phase: offer.resumePhase, pendingTrade: undefined },
    `${playerName(state, action.playerId)} ${action.playerId === offer.fromPlayerId ? "withdrew" : "declined"} the trade.`,
    "info", { playerId: action.playerId }
  );
};

const civicEvent = (state: GameState, text: string, civic: NonNullable<GameEvent["civic"]>, detail: Partial<Omit<GameEvent, "id" | "kind" | "text" | "civic">> = {}) =>
  addEvent(state, text, "civic", { ...detail, civic });

const changeTreasury = (state: GameState, delta: number): GameState =>
  state.mayor ? { ...state, mayor: { ...state.mayor, treasury: state.mayor.treasury + delta } } : state;

function fundCityLoan(state: GameState, id: string, principal: number, amountDue: number) {
  return updateCitySeat(changeTreasury(changeCash(state, id, principal), -principal), id,
    record => ({ ...record, borrowed: true, loanDue: record.turns + 2, loanAmountDue: amountDue }));
}

function startBackedAuction(state: GameState): GameState {
  const cityBacking = cityAuctionBacking(state);
  if (!cityBacking) return state;
  return civicEvent({
    ...state,
    auction: { ...state.auction!, cityBacking },
    mayor: { ...state.mayor!, policy: { ...state.mayor!.policy!, used: true } }
  }, `City Hall reserved up to ${formatRupees(cityBacking.limit)} to back an eligible bidder.`, "auction");
}

const updateBill = (state: GameState, id: string, round: number, update: (bill: TaxBill) => TaxBill) =>
  updateCitySeat(state, id, seat => {
    let updated = false;
    return {
      ...seat,
      bills: seat.bills.map(bill => {
        if (!updated && bill.round === round && bill.status !== "paid") {
          updated = true;
          return update(bill);
        }
        return bill;
      })
    };
  });

function payTaxEarly(state: GameState, id: string, bill: TaxBill) {
  return updateBill(changeCash(state, id, -bill.amount), id, bill.round, entry => ({ ...entry, status: "paid" }));
}

function settleCityEnd(state: GameState, id: string): GameState {
  const seat = state.mayor?.seats[id];
  const player = playerById(state, id);
  if (!seat || !player || player.bankrupt) return state;
  const cutoff = seat.turns + 1;
  const due = seat.bills.filter(bill => bill.dueTurn <= cutoff);
  const pending = seat.bills.filter(bill => bill.dueTurn > cutoff);
  const loanDue = seat.loanDue !== undefined && seat.loanDue <= cutoff;
  const posted = due.reduce((sum, bill) => sum + (bill.status === "paid" ? bill.amount : 0), 0);
  const owed = due.reduce((sum, bill) => sum + (bill.status === "paid" ? 0 : bill.amount), 0) + (loanDue ? seat.loanAmountDue ?? LOAN_REPAYMENT : 0);
  let next = updateCitySeat(changeTreasury(state, posted), id, record => ({
    ...record, bills: pending, loanDue: loanDue ? undefined : record.loanDue,
    loanAmountDue: loanDue ? undefined : record.loanAmountDue
  }));
  next = makePayment(next, id, "bank", owed, "to settle City Hall dues", "city");
  if ((playerById(next, id)?.cash ?? 0) < 0) return next;
  for (const bill of pending) {
    if (bill.status !== "open" || bill.dueTurn !== cutoff + 1 || playerById(next, id)!.bankrupt) continue;
    next = playerById(next, id)!.cash >= bill.amount
      ? payTaxEarly(next, id, bill)
      : updateBill(next, id, bill.round, entry => ({ ...entry, status: "deferred" }));
  }
  return next;
}

function auditCity(state: GameState, targetId: string): GameState {
  const desk = state.mayor!;
  const mayor = playerById(state, desk.mayorId)!;
  const target = playerById(state, targetId)!;
  const bill = desk.seats[targetId]?.bills.find(entry => entry.status === "deferred");
  let next: GameState = { ...state, mayor: { ...desk, auditUsed: true } };
  if (!bill) {
    next = civicEvent(next, `Clear records. ${mayor.name} owes ${target.name} ${formatRupees(AUDIT_FINE)} for the failed raid.`, "raid",
      { playerId: mayor.id, recipientId: target.id, position: target.position, amount: AUDIT_FINE });
    return makePayment(next, mayor.id, target.id, AUDIT_FINE, "as compensation for a failed raid");
  }
  const due = bill.amount + AUDIT_FINE;
  next = updateCitySeat(next, target.id, seat => ({ ...seat, bills: seat.bills.filter(entry => entry !== bill) }));
  next = civicEvent(next, `Raid on ${target.name}: unpaid levy found. ${formatRupees(due)} due with the fine.`, "raid",
    { playerId: target.id, position: target.position, amount: due });
  return makePayment(next, target.id, "bank", due, "for the city levy and audit fine", "city");
}

function closeWheel(state: GameState, reveal: boolean): GameState {
  const desk = state.mayor, wheel = desk?.wheel;
  if (!desk || !wheel) return state;
  const { playerId, prize } = wheel;
  const next: GameState = { ...state, mayor: { ...desk, wheel: undefined,
    ...(reveal && prize ? { wheelResult: wheel } : {})
  } };
  if (!reveal || !prize) return next;
  const heading = prize === 2000 ? "Fort jackpot!" : "Lucky Scratch";
  return civicEvent(changeCash(next, playerId, prize), `${heading} ${playerName(next, playerId)} found ${formatRupees(prize)}.`, "wheel",
    { playerId, position: fortPosition(next), amount: prize });
}

function handleCityAction(original: GameState, action: CityAction): GameState {
  const desk = original.mayor;
  const player = playerById(original, action.playerId);
  const taxDecision = action.type === "CITY_PAY_TAX" || action.type === "CITY_DEFER_TAX";
  const allowedPhase = taxDecision
    ? original.phase !== "lobby" && original.phase !== "gameOver" && original.phase !== "awaitingAuction"
    : cityStable(original);
  if (original.mode !== "mayor" || !desk || !player || player.bankrupt || !allowedPhase) {
    return reject(original, "City Hall actions are available during a regular turn in Mayor mode.");
  }
  const state = { ...original, notice: undefined };
  const id = player.id, seat = desk.seats[id]!, active = state.activePlayerId === id;
  const office = "term" in action && action.term === desk.term && desk.mayorId === id;
  const solvent = state.players.filter(candidate => !candidate.bankrupt);
  switch (action.type) {
    case "CITY_PAY_TAX":
    case "CITY_DEFER_TAX": {
      const bill = seat.bills.find(entry => entry.round === action.round && entry.status !== "paid");
      if (!bill) return addEvent(state, "That private bill is no longer open.", "error", { privateTo: id });
      if (action.type === "CITY_PAY_TAX") return player.cash >= bill.amount
        ? payTaxEarly(state, id, bill) : addEvent(state, "Raise more cash before paying this bill.", "error", { privateTo: id });
      if (bill.status !== "open" || bill.dueTurn > seat.turns + 2) return addEvent(state, "You can defer this bill once before it comes due.", "error", { privateTo: id });
      return updateBill(state, id, bill.round, entry => ({ ...entry, status: "deferred" }));
    }
    case "CITY_AUDIT":
      if (!office || desk.auditUsed || solvent.length <= 2 || action.targetId === id || !solvent.some(candidate => candidate.id === action.targetId)) {
        return reject(state, "Choose one solvent rival while your warrant is available.");
      }
      return auditCity(state, action.targetId);
    case "CITY_TIP": {
      if (!office || desk.auditUsed || desk.tip || solvent.length < 3) return reject(state, "One investigation is available per term while your warrant is unused.");
      const rivals = solvent.filter(candidate => candidate.id !== id);
      const suspect = rivals.find(candidate => desk.seats[candidate.id]?.bills.some(bill => bill.status === "deferred"));
      const second = rivals.find(candidate => candidate.id !== suspect?.id);
      const tip = suspect && second ? [suspect.id, second.id].sort() : [];
      const next = { ...state, mayor: { ...desk, tip } };
      return tip.length ? civicEvent(next, "City Hall opened an investigation into unpaid levies.", "investigation") : next;
    }
    case "CITY_PROPOSE":
      if (!office || !active || desk.proposalUsed || desk.proposal || !cityPolicyAvailable(state, action.policy, action.district)) {
        return reject(state, "Choose an available city project during your term and turn.");
      }
      return civicEvent({ ...state, mayor: { ...desk, proposalUsed: true, proposal: { term: desk.term, kind: action.policy, sponsorId: id, votes: [], district: action.district } } },
        `${player.name} proposed ${CITY_POLICIES[action.policy]}${action.district ? ` for ${districtName(state, action.district)}` : ""} for next round.`, "policy", { playerId: id });
    case "CITY_VOTE": {
      const proposal = desk.proposal;
      if (!proposal || proposal.term !== action.term || !canChallengeCityProject(state, id)) {
        return reject(state, "This proposal cannot be challenged again.");
      }
      const opened = proposal.votes.length === 0;
      const speaker = opened && councilSpeaker(state) === id && desk.speakerUsedTerm !== desk.term;
      const result: GameState = { ...state, mayor: { ...desk,
        ...(speaker ? { speakerUsedTerm: desk.term } : opened ? { voteUsed: true } : {}),
        proposal: { ...proposal, votes: [...proposal.votes, id] }
      } };
      const voice = speaker ? `Council Speaker ${player.name}` : player.name;
      return opened ? civicEvent(result, `${voice} opened a City Hall vote on ${CITY_POLICIES[proposal.kind]}.`, "policy") : result;
    }
    case "CITY_LOAN":
      if (action.round !== desk.round || !cityLoanAvailable(state, id)) return reject(state, "No city loan is available to this seat right now.");
      return civicEvent(fundCityLoan(state, id, LOAN_AMOUNT, LOAN_REPAYMENT),
        `${player.name} took a ${formatRupees(LOAN_AMOUNT)} city loan. ${formatRupees(LOAN_REPAYMENT)} due at the end of their next turn.`, "policy",
        { playerId: id });
    case "CITY_CONTRACT":
      if (!desk.council || !active || desk.round > 2 || seat.contract || (action.contract !== "build" && action.contract !== "transit")) {
        return addEvent(state, "Choose one contract before the second round ends, during your own turn.", "error", { privateTo: id });
      }
      return updateCitySeat(state, id, record => ({ ...record, contract: action.contract }));
    case "CITY_EXPRESS": {
      const ride = trainOffer(state, id);
      if (!ride || player.cash < ride.fare) return reject(state, "An Express ride is not available before this roll.");
      let next = updateCitySeat({ ...changeCash(state, id, -ride.fare), lastRoll: undefined }, id,
        record => ({ ...record, rodeExpress: true, ...(desk.council ? { completedExpress: true } : {}),
          ...(ride.fare === 0 ? { freeRideRound: desk.round } : {}) }));
      if (!ride.fare) next = changeTreasury(next, -TRAIN_FARE);
      next = civicEvent(next, `${player.name} boarded the Express ${ride.fare ? `for ${formatRupees(ride.fare)}` : "with a Transit Day pass"}.`, "express",
        { playerId: id, position: ride.to });
      return resolveLanding(moveTo(next, id, ride.to, false), id, 0, []);
    }
    case "CITY_SKIP_WHEEL":
    case "CITY_SCRATCH":
    case "CITY_SPIN": {
      const wheel = desk.wheel;
      if (!active || state.phase !== "awaitingEndTurn" || !wheel || wheel.id !== action.wheelId || wheel.playerId !== id) {
        return reject(state, "This wheel decision has closed.");
      }
      if (action.type === "CITY_SKIP_WHEEL") return closeWheel(state, true);
      if (action.type === "CITY_SCRATCH") return wheel.section === 5 ? closeWheel(state, true) : reject(state, "Spin before scratching.");
      if (action.type !== "CITY_SPIN") return state;
      const { section, prizeRoll } = action;
      if (wheel.section !== undefined || section === undefined || !Number.isInteger(section) || section < 0 || section >= WHEEL_SECTIONS.length ||
        (section === 5 && (prizeRoll === undefined || !Number.isInteger(prizeRoll) || prizeRoll < 0 || prizeRoll > 99))) {
        return reject(state, "This wheel already spun or the result was invalid.");
      }
      const position = fortPosition(state);
      const result = { ...wheel, section };
      let next = civicEvent({ ...state, mayor: { ...desk, wheel: undefined, wheelResult: result } },
        `${player.name} spun the Fort wheel: ${WHEEL_SECTIONS[section]}.`, "wheel", { playerId: id, position });
      if (section === 0 || section === 1) return changeCash(next, id, section === 0 ? 100 : 150);
      if (section === 2) return makePayment(next, id, "bank", 50, "for the Fort wheel doctor’s fee");
      if (section === 3) return withPlayer(next, id, candidate => ({ ...candidate, getOutOfJailCards: candidate.getOutOfJailCards + 1 }));
      if (section === 4) return moveTo(next, id, 0, true);
      const prize = prizeRoll! >= 97 && !desk.jackpotUsed ? 2000 : prizeRoll! >= 85 ? 250 : 100;
      next = { ...next, mayor: { ...next.mayor!, wheel: { ...result, prize }, jackpotUsed: prize === 2000 ? true : desk.jackpotUsed } };
      return next;
    }
  }
}

function afterCityAction(before: GameState, state: GameState): GameState {
  if (state.phase === "gameOver") return state;
  let next = state;
  let desk = next.mayor!;
  for (const player of next.players.filter(candidate => candidate.bankrupt)) {
    const seat = desk.seats[player.id];
    if (!seat || (!seat.bills.length && seat.loanDue === undefined)) continue;
    const posted = seat.bills.reduce((sum, bill) => sum + (bill.status === "paid" ? bill.amount : 0), 0);
    next = updateCitySeat(changeTreasury(next, posted), player.id, record => ({ ...record, bills: [], loanDue: undefined }));
  }
  desk = next.mayor!;
  if (playerById(next, desk.mayorId)?.bankrupt) {
    desk = newTerm(desk, nextMayor(next, desk.mayorId));
    next = { ...next, mayor: desk };
  }
  if (before.mayor?.term !== desk.term) next = civicEvent(next, `${playerName(next, desk.mayorId)} took office as Mayor.`, "office", { playerId: desk.mayorId });
  if (before.mayor?.round !== desk.round) {
    if (desk.policy?.kind === "wealth") {
      const levy = reserveLevy(next);
      if (levy) {
        next = { ...next, mayor: { ...desk, reserveLevyUsed: true } };
        next = civicEvent(makePayment(next, levy.playerId, "bank", levy.amount, "for the Cash Reserve Levy", "city"),
          `Cash Reserve Levy collected ${formatRupees(levy.amount)} from ${playerName(next, levy.playerId)}.`, "policy",
          { playerId: levy.playerId, amount: levy.amount });
      } else next = civicEvent(next, "Cash Reserve Levy closed without a qualifying player.", "policy");
    } else if (desk.policy) {
      const text = CITY_POLICIES[desk.policy.kind] + (desk.policy.district ? ` for ${districtName(next, desk.policy.district)}` : "");
      next = civicEvent(next, `${text} is in effect this round.`, "policy");
    } else if (before.mayor?.proposal) {
      next = civicEvent(next, `The council rejected ${CITY_POLICIES[before.mayor.proposal.kind]}.`, "policy");
    }
  }
  if (desk.council) for (const player of next.players) {
    const seat = next.mayor!.seats[player.id];
    if (player.bankrupt || player.cash < 0 || !seat?.contract || seat.contractPaid || !cityContractReady(next, player.id, seat.contract)) continue;
    const completed = CITY_CONTRACTS[seat.contract];
    next = updateCitySeat(changeCash(next, player.id, CITY_CONTRACT_REWARD), player.id, record => ({ ...record, contractPaid: true }));
    next = civicEvent(next, `${player.name} completed ${completed} for ${formatRupees(CITY_CONTRACT_REWARD)}.`, "contract", { playerId: player.id, amount: CITY_CONTRACT_REWARD });
  }
  const sale = before.auction && !next.auction && next.eventLog.find(event => event.id >= before.nextEventId &&
    event.position === before.auction!.propertyId && event.text.includes(" won ") && (event.amount ?? 0) >= 250);
  if (sale) next = civicEvent(next, `City headlines · ${sale.text}`, "auction", { position: sale.position });
  const active = playerById(next, next.activePlayerId ?? "");
  if (active && !active.bankrupt && next.phase === "awaitingEndTurn" && before.phase !== "awaitingEndTurn" &&
      !desk.wheel && !desk.seats[active.id]?.visitedWheel && active.position === fortPosition(next)) {
    next = updateCitySeat(next, active.id, record => ({ ...record, visitedWheel: true }));
    next = { ...next, mayor: { ...next.mayor!, wheel: { id: next.nextEventId, playerId: active.id } } };
    next = civicEvent(next, `${playerName(next, active.id)} reached the ${getTile(active.position, next.boardSize).name} wheel.`, "wheel",
      { playerId: active.id, position: active.position });
  }

  return next;
}

const applyAction = (state: GameState, action: GameAction): GameState => {
  switch (action.type) {
    case 'ADD_BOT': {
      if(state.phase!=='lobby'||state.players[0]?.id!==action.playerId||state.players[0]?.bot)return reject(state,'Only the host can add AI players before starting.');
      const color=PLAYER_COLORS.find(value=>!isPlayerColorTaken(state.players,value));
      if(state.players.length>=6||!color)return reject(state,'This room has six players. Remove an AI to invite a friend.');
      let seat=1;while(state.players.some(p=>p.id===`ai-${seat}`))seat++;
      const id=`ai-${seat}`,name=`AI ${['Mira','Arjun','Tara','Kabir','Zoya','Dev'][(seat-1)%6]}`;
      const next=handleJoin(state,{type:'JOIN',player:{id,name,color}});
      return {...next,players:next.players.map(p=>p.id===id?{...p,bot:true}:p)};
    }
    case 'REMOVE_BOT': {
      if(state.phase!=='lobby'||state.players[0]?.id!==action.playerId)return reject(state,'Only the host can remove AI players before starting.');
      const bot=state.players.find(p=>p.id===action.botId&&p.bot);
      if(!bot)return reject(state,'Choose an AI player to remove.');
      const players=state.players.filter(p=>p.id!==bot.id),initial=createInitialState(state.roomCode,state.mode==='classic'?40:boardSizeForPlayers(players.length));
      return addEvent({...state,players,boardSize:initial.boardSize,properties:initial.properties,bankHouses:initial.bankHouses,bankHotels:initial.bankHotels},`${bot.name} left the lobby.`);
    }
    case 'SET_WORLD': {
      if(state.phase!=='lobby'||state.players[0]?.id!==action.playerId)return reject(state,'Only the host can choose a map before starting.');
      if(!isWorldId(action.world))return reject(state,'Choose an available map.');
      return addEvent({...state,world:action.world},`The room selected ${worldInfo(action.world).name}.`);
    }
    case 'SET_CITY': {
      if(state.phase!=='lobby' || state.players[0]?.id!==action.playerId)return reject(state,'Only the host can choose a city before starting.');
      if(!isCityId(action.city))return reject(state,'Choose an available city.');
      return addEvent({...state,city:action.city},`The room selected ${cityInfo(action.city).name}.`);
    }
    case "SET_MODE": {
      if (state.phase !== "lobby" || state.players[0]?.id !== action.playerId) return reject(state, "Only the room creator can choose a mode before starting.");
      if (action.mode !== "classic" && action.mode !== "expanding" && action.mode !== "mayor") return reject(state, "Choose Classic, Expanding or Mayor.");
      const initial = createInitialState(state.roomCode, action.mode === "classic" ? 40 : boardSizeForPlayers(state.players.length));
      return addEvent({ ...state, mode: action.mode, rulesEdition: action.mode === 'classic' ? action.rulesEdition : undefined, boardSize: initial.boardSize, properties: initial.properties,
        bankHouses: initial.bankHouses, bankHotels: initial.bankHotels }, `The room selected ${action.mode === "classic" ? "Classic · 40 spaces" : action.mode === "mayor" ? "Mayor · City Hall Stories" : "Expanding Indian board"}.`);
    }
    case "CITY_PAY_TAX":
    case "CITY_DEFER_TAX":
    case "CITY_AUDIT":
    case "CITY_TIP":
    case "CITY_PROPOSE":
    case "CITY_VOTE":
    case "CITY_LOAN":
    case "CITY_CONTRACT":
    case "CITY_EXPRESS":
    case "CITY_SKIP_WHEEL":
    case "CITY_SPIN":
    case "CITY_SCRATCH":
      return handleCityAction(state, action);
    case "RESOLVE_MORTGAGES": return reject(state, "Mortgage-transfer decisions belong to Classic mode.");
    case "CLAIM_RENT": return reject(state, "Rent claims belong to Hasbro 2025 Classic games.");
    case "JOIN":
      return handleJoin(state, action);
    case "SET_APPEARANCE": {
      if (!playerById(state, action.playerId)) return reject(state, "That player is not in this room.");
      if (action.color !== undefined && (state.phase !== "lobby" || !playerColorKey(action.color) || isPlayerColorTaken(state.players, action.color, action.playerId))) {
        return reject(state, "Choose an available token colour before the game starts.");
      }
      const next = withPlayer(state, action.playerId, (player) => ({ ...player,
          tokenId: action.tokenId ?? player.tokenId, diceId: action.diceId ?? player.diceId,
          color: action.color === undefined ? player.color : playerColorKey(action.color) }));
      return action.color === undefined ? next : addEvent(next, `${playerName(state, action.playerId)} chose a different token colour.`);
    }
    case "START":
      return handleStart(state, action);
    case "ROLL":
      return handleRoll(state, action);
    case "MOVE_RESULT":
      return handleMoveResult(state, action);
    case "BUY":
      return handleBuy(state, action);
    case "DECLINE_BUY":
      return handleDeclineBuy(state, action);
    case "BUILD":
      return handleBuild(state, action);
    case "MORTGAGE":
      return handleMortgage(state, action);
    case "PAY":
      return handlePay(state, action);
    case "END_TURN":
      return handleEndTurn(state, action);
    case "BANKRUPT": {
      const debt = state.debts?.[0], player = playerById(state, action.playerId);
      return state.phase === "awaitingDebt" && debt?.playerId === action.playerId && player && player.cash < 0
        ? bankruptPlayer(state, player.id, debt.creditorId, true)
        : reject(state, "Only the player settling a negative balance can declare bankruptcy.");
    }
    case "AUCTION_BID":
      return handleAuctionBid(state, action);
    case "TRADE_OFFER":
      return handleTradeOffer(state, action);
    case "TRADE_COUNTER":
      return handleTradeCounter(state, action);
    case "TRADE_ACCEPT":
      return handleTradeAccept(state, action);
    case "TRADE_DECLINE":
      return handleTradeDecline(state, action);
  }
};

const synchronizeDebt = (state: GameState): GameState => {
  if (state.phase === "lobby") return state;
  if (state.phase === "gameOver") return state.debts || state.debtResumePhase ? { ...state, debts: undefined, debtResumePhase: undefined } : state;
  let next = state;
  const debts = [...(state.debts ?? [])];
  for (const player of next.players) {
    if (!player.bankrupt && player.cash < 0 && !debts.some(debt => debt.playerId === player.id)) debts.push({ playerId: player.id, creditorId: "bank", reason: "an unpaid balance" });
  }
  for (const debt of debts) next = bankruptPlayer(next, debt.playerId, debt.creditorId);
  if (next.phase === "gameOver") return { ...next, debts: undefined, debtResumePhase: undefined };
  if (playerById(next, next.activePlayerId ?? "")?.bankrupt) next = finishLanding({ ...next, debtResumePhase: undefined, pendingTrade: undefined, pendingRoll: undefined });
  const outstanding = debts.filter(debt => { const player = playerById(next, debt.playerId); return player && !player.bankrupt && player.cash < 0; });
  if (!outstanding.length) {
    if (!next.debts && !next.debtResumePhase && next.phase !== "awaitingDebt") return next;
    return { ...next, phase: next.phase === "awaitingDebt" ? next.debtResumePhase ?? "awaitingEndTurn" : next.phase, debts: undefined, debtResumePhase: undefined };
  }
  const tradeResume = next.pendingTrade?.resumePhase;
  const resume = next.phase === "awaitingDebt" || next.phase === "awaitingTradeResponse"
    ? next.debtResumePhase ?? (tradeResume && tradeResume !== "awaitingDebt" ? tradeResume : "awaitingEndTurn")
    : next.phase as DebtResumePhase;
  return { ...next, phase: next.pendingTrade ? "awaitingTradeResponse" : "awaitingDebt", debts: outstanding, debtResumePhase: resume };
};

const reduceCore = (state: GameState, action: GameAction): GameState => {
  if(action.type==='ADD_BOT'||action.type==='REMOVE_BOT')return applyAction(state,action);
  if (state.mode === "classic" && state.phase !== "lobby") return reduceClassic(state, action);
  const before = synchronizeDebt(state), debt = before.debts?.[0];
  if (debt) {
    const actor = "playerId" in action ? action.playerId : "";
    const reply = before.phase === "awaitingTradeResponse" && (
      before.pendingTrade?.toPlayerId === actor && (action.type === "TRADE_ACCEPT" || action.type === "TRADE_DECLINE" || action.type === "TRADE_COUNTER") ||
      before.pendingTrade?.fromPlayerId === actor && action.type === "TRADE_DECLINE"
    );
    const managing = before.phase === "awaitingDebt" && "playerId" in action && action.playerId === debt.playerId &&
      (action.type === "BANKRUPT" || action.type === "TRADE_OFFER" || action.type === "BUILD" && action.operation !== "build" || action.type === "MORTGAGE" && action.mortgage);
    if (!reply && !managing && action.type !== "JOIN" && action.type !== "SET_APPEARANCE") return reject(before, "Settle the outstanding debt before normal play can continue.");
  }
  let next = applyAction(before, action);
  // Raised cash repays the creditor first. Unpaid rent must never become free money.
  for (const pending of before.debts ?? []) {
    const oldPlayer = playerById(before, pending.playerId), player = playerById(next, pending.playerId);
    const creditor = playerById(next, pending.creditorId);
    if (!oldPlayer || !player || player.bankrupt) continue;
    const paid = Math.min(-oldPlayer.cash, Math.max(0, player.cash - oldPlayer.cash));
    if (paid <= 0) continue;
    if (pending.city && next.mayor) next = { ...next, mayor: { ...next.mayor, treasury: next.mayor.treasury + paid } };
    if (creditor && !creditor.bankrupt) {
      next = changeCash(next, creditor.id, paid);
      if (pending.rent) next = recordRent(next, creditor.id, paid);
    }
  }
  next = synchronizeDebt(next);
  if (next.phase !== "gameOver" && !next.notice && !next.debts?.length && !next.auction && !next.bankAuctionQueue?.length && next.mayor?.pendingRoundAdvance) {
    next = advanceCityRound(next);
  }
  if (next.mayor && !next.notice) next = synchronizeDebt(afterCityAction(before, next));
  if (next.phase !== "gameOver" && !next.debts?.length && !next.auction && next.bankAuctionQueue?.length) {
    const [propertyId, ...bankAuctionQueue] = next.bankAuctionQueue;
    const opened = addEvent({ ...next, phase: "awaitingAuction", bankAuctionQueue: bankAuctionQueue.length ? bankAuctionQueue : undefined,
      bankAuctionResumePhase: next.phase as DebtResumePhase,
      auction: { propertyId: propertyId!, landingPlayerId: next.activePlayerId!, currentBid: 0,
        eligiblePlayerIds: next.players.filter(p => !p.bankrupt).map(p => p.id), passedPlayerIds: [] }
    }, `${getTile(propertyId!, next.boardSize).name} is up for a bank repossession auction.`);
    return startBackedAuction(opened);
  }
  return !before.auction && next.auction ? startBackedAuction(next) : next;
};

export const reduceGame = (state:GameState,action:GameAction):GameState => {
  let next=reduceCore(state,action);
  if(!next.notice&&next.activePlayerId!==state.activePlayerId)
    next={...next,players:next.players.map(p=>p.bot&&p.id===next.activePlayerId?{...p,botTradeOffered:false}:p)};
  if(action.type==='TRADE_OFFER'&&next.pendingTrade?.id===action.offerId)
    next={...next,players:next.players.map(p=>p.bot&&p.id===action.playerId?{...p,botTradeOffered:true}:p)};
  if(!next.city || next.city==='india')return next;
  const translate=(text:string)=>cityText(text,next.city,next.boardSize);
  return {...next,eventLog:next.eventLog.map(event=>{
    if(event.id<state.nextEventId)return event;
    const actor=next.players.find(p=>p.id===event.playerId),prefix=actor && event.text.startsWith(actor.name+' ')?actor.name+' ':'';
    return {...event,text:prefix+translate(event.text.slice(prefix.length))};
  }),...(next.card?{card:{...next.card,text:translate(next.card.text)}}:{}),...(next.notice?{notice:translate(next.notice)}:{}),...(next.debts?{debts:next.debts.map(debt=>({...debt,reason:translate(debt.reason)}))}:{})};
};
