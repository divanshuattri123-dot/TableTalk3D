import {
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
import type {
  AuctionState,
  BoardSize,
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
    const improvements = isStreetTile(tile) ? property.houses * tile.houseCost : 0;
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

const bankruptPlayer = (state: GameState, playerId: string, creditor: PaymentTarget): GameState => {
  const player = playerById(state, playerId);
  if (!player || player.bankrupt || netWorth(state, playerId) >= 0) {
    return state;
  }

  const creditorPlayer = creditor === "bank" ? undefined : playerById(state, creditor);
  const transferToCreditor = Boolean(creditorPlayer && !creditorPlayer.bankrupt);
  let bankHouses = state.bankHouses;
  let bankHotels = state.bankHotels;
  const properties = { ...state.properties };

  for (const tile of getBoard(state.boardSize)) {
    if (!isPurchasableTile(tile)) {
      continue;
    }
    const property = properties[tile.position] as PropertyState;
    if (property.ownerId !== playerId) {
      continue;
    }
    if (transferToCreditor) {
      properties[tile.position] = { ...property, ownerId: creditor };
      continue;
    }

    if (tile.kind === "property") {
      if (property.houses === 5) {
        bankHotels += 1;
      } else {
        bankHouses += property.houses;
      }
    }
    properties[tile.position] = { houses: 0, mortgaged: false };
  }

  let next: GameState = {
    ...state,
    properties,
    bankHouses,
    bankHotels,
    players: state.players.map((candidate) =>
      candidate.id === playerId
        ? { ...candidate, bankrupt: true, inJail: false, getOutOfJailCards: 0 }
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
  reason: string
): GameState => {
  if (amount <= 0) {
    return state;
  }
  let next = changeCash(state, fromPlayerId, -amount);
  if (target !== "bank") {
    next = changeCash(next, target, amount);
  }
  next = addEvent(
    next,
    `${playerName(next, fromPlayerId)} paid $${amount} ${reason}.`,
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
    next = addEvent(next, `${player.name} passed GO and collected $${GO_REWARD}.`, "money");
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
    next = addEvent(next, `${player.name} collected $${GO_REWARD} for passing GO.`, "money");
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
        next = addEvent(next, `${playerName(next, playerId)} received $${card.effect.amount}.`, "money");
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
        drawIndex + 1
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
  }
};

const resolveLanding = (
  state: GameState,
  playerId: string,
  diceTotal: number,
  draws: readonly CardDraw[],
  drawIndex = 0
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
    const rent = calculateRent(state, tile.position, diceTotal);
    return finishLanding(
      makePayment(state, playerId, property.ownerId, rent, `rent for ${tile.name}`)
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
  const player: Player = {
    id,
    name: name.trim(),
    color,
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
  const boardSize = boardSizeForPlayers(players.length);
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
  if (!playerById(state, action.firstPlayerId)) {
    return reject(state, "Choose a player in this room to go first.");
  }
  return addEvent(
    { ...state, phase: "awaitingRoll", activePlayerId: action.firstPlayerId },
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
        `${player.name} must pay $${JAIL_FINE} before moving.`,
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
  return addEvent(next, `${player.name} bought ${tile.name} for $${tile.price}.`, "money");
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
  if (!auction.highestBidderId) {
    return addEvent(
      { ...state, phase: "awaitingEndTurn", auction: undefined },
      `Nobody bought ${tile.name}; it stays with the bank.`
    );
  }
  const winner = playerById(state, auction.highestBidderId) as Player;
  let next = withProperty(state, auction.propertyId, (property) => ({
    ...property,
    ownerId: winner.id
  }));
  next = changeCash(next, winner.id, -auction.currentBid);
  next = { ...next, phase: "awaitingEndTurn", auction: undefined };
  return addEvent(next, `${winner.name} won ${tile.name} for $${auction.currentBid}.`, "money");
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
    (action.amount as number) > bidder.cash ||
    auction.highestBidderId === action.playerId
  ) {
    return reject(state, "Bids must increase and be affordable.");
  }
  const updated: AuctionState = {
    ...auction,
    currentBid: action.amount as number,
    highestBidderId: action.playerId
  };
  const next = addEvent({ ...state, auction: updated }, `${bidder.name} bid $${action.amount}.`);
  return auctionIsFinished(updated) ? finishAuction(next, updated) : next;
};

const handleBuild = (state: GameState, action: Extract<GameAction, { type: "BUILD" }>): GameState => {
  if (!isNormalTurnPhase(state) || !isActive(state, action.playerId)) {
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
  const levels = groupStates.map((groupState) => groupState.houses);
  const minimum = Math.min(...levels);
  const maximum = Math.max(...levels);

  if (action.operation === "build") {
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
  if (!isNormalTurnPhase(state) || !isActive(state, action.playerId)) {
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
    return addEvent(next, `${player.name} mortgaged ${tile.name} for $${tile.mortgageValue}.`, "money");
  }
  const cost = tile.mortgageValue + Math.ceil(tile.mortgageValue / 10);
  if (!property.mortgaged || player.cash < cost) {
    return reject(state, "You cannot unmortgage that property yet.");
  }
  let next = withProperty(state, action.propertyId, (candidate) => ({ ...candidate, mortgaged: false }));
  next = changeCash(next, player.id, -cost);
  return addEvent(next, `${player.name} unmortgaged ${tile.name} for $${cost}.`, "money");
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
  const rollAgain = Boolean(
    !player.bankrupt && state.lastRoll?.playerId === player.id && state.lastRoll.grantsExtraRoll && !player.inJail
  );
  if (rollAgain) {
    return addEvent(
      {
        ...state,
        phase: "awaitingRoll",
        pendingRoll: undefined,
        pendingPurchase: undefined
      },
      `${player.name} rolled doubles and goes again.`,
      "turn"
    );
  }
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
  return addEvent(
    {
      ...state,
      phase: "awaitingRoll",
      activePlayerId: nextPlayer.id,
      consecutiveDoubles: 0,
      pendingRoll: undefined,
      pendingPurchase: undefined
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
    offer.offeredCash > from.cash ||
    offer.requestedCash > to.cash ||
    !uniqueValues(offer.offeredPropertyIds) ||
    !uniqueValues(offer.requestedPropertyIds)
  ) {
    return "The trade terms are no longer valid.";
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
    (state.phase !== "awaitingRoll" && state.phase !== "awaitingEndTurn") ||
    !isActive(state, action.playerId)
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
    resumePhase: state.phase
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
    offer.toPlayerId !== action.playerId ||
    offer.id !== action.offerId
  ) {
    return reject(state, "There is no matching trade to decline.");
  }
  return addEvent(
    { ...state, phase: offer.resumePhase, pendingTrade: undefined },
    `${playerName(state, action.playerId)} declined the trade.`
  );
};

export const reduceGame = (state: GameState, action: GameAction): GameState => {
  switch (action.type) {
    case "JOIN":
      return handleJoin(state, action);
    case "SET_APPEARANCE":
      return playerById(state, action.playerId)
        ? withPlayer(state, action.playerId, (player) => ({ ...player,
          tokenId: action.tokenId ?? player.tokenId, diceId: action.diceId ?? player.diceId }))
        : reject(state, "That player is not in this room.");
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
    case "AUCTION_BID":
      return handleAuctionBid(state, action);
    case "TRADE_OFFER":
      return handleTradeOffer(state, action);
    case "TRADE_ACCEPT":
      return handleTradeAccept(state, action);
    case "TRADE_DECLINE":
      return handleTradeDecline(state, action);
  }
};
