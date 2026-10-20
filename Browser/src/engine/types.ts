export type Dice = readonly [number, number];

export type ColorGroup =
  | "brown"
  | "lightBlue"
  | "pink"
  | "orange"
  | "red"
  | "yellow"
  | "green"
  | "darkBlue"
  | "coral" | "teal" | "violet" | "lime"
  | "copper" | "sky" | "rose" | "mint"
  | "indigo" | "amber" | "lavender" | "turquoise";

export type BoardSize = 40 | 48 | 56 | 64;

export type ImprovementLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type CardDeck = "chance" | "community";
export type Phase =
  | "lobby"
  | "awaitingRoll"
  | "awaitingMove"
  | "awaitingBuy"
  | "awaitingJailPayment"
  | "awaitingAuction"
  | "awaitingTradeResponse"
  | "awaitingEndTurn"
  | "gameOver";

export interface BaseTile {
  position: number;
  name: string;
  boardLabel?: string;
  region?: string;
  detail?: string;
}

export interface StreetTile extends BaseTile {
  kind: "property";
  group: ColorGroup;
  price: number;
  mortgageValue: number;
  houseCost: number;
  rent: readonly [number, number, number, number, number, number];
}

export interface RailroadTile extends BaseTile {
  kind: "railroad";
  price: number;
  mortgageValue: number;
}

export interface UtilityTile extends BaseTile {
  kind: "utility";
  price: number;
  mortgageValue: number;
}

export interface TaxTile extends BaseTile {
  kind: "tax";
  amount: number;
}

export interface CardTile extends BaseTile {
  kind: CardDeck;
}

export interface SpecialTile extends BaseTile {
  kind: "go" | "jail" | "freeParking" | "goToJail";
}

export type PurchasableTile = StreetTile | RailroadTile | UtilityTile;
export type Tile = PurchasableTile | TaxTile | CardTile | SpecialTile;

export interface PlayerInput {
  id: string;
  name: string;
  color: string;
  tokenId?: string;
  diceId?: string;
}

export interface Player extends PlayerInput {
  cash: number;
  position: number;
  inJail: boolean;
  jailTurns: number;
  getOutOfJailCards: number;
  bankrupt: boolean;
}

export interface PropertyState {
  ownerId?: string;
  houses: ImprovementLevel;
  mortgaged: boolean;
}

export interface PendingRoll {
  playerId: string;
  dice: Dice;
  total: number;
  doubles: boolean;
  grantsExtraRoll: boolean;
}

export interface PendingPurchase {
  playerId: string;
  propertyId: number;
}

export interface AuctionState {
  propertyId: number;
  landingPlayerId: string;
  currentBid: number;
  highestBidderId?: string;
  eligiblePlayerIds: string[];
  passedPlayerIds: string[];
}

export interface TradeOffer {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  offeredCash: number;
  offeredPropertyIds: number[];
  requestedCash: number;
  requestedPropertyIds: number[];
  resumePhase: "awaitingRoll" | "awaitingEndTurn";
}

export interface CardDraw {
  deck: CardDeck;
  index: number;
}

export interface CardReveal {
  deck: CardDeck;
  index: number;
  text: string;
  playerId: string;
}

export interface GameEvent {
  id: number;
  kind: "info" | "error" | "money" | "card" | "turn";
  text: string;
  playerId?: string;
  position?: number;
  deck?: CardDeck;
  cardIndex?: number;
  amount?: number;
  recipientId?: string;
}

export interface GameState {
  roomCode: string;
  boardSize: BoardSize;
  phase: Phase;
  players: Player[];
  activePlayerId?: string;
  properties: Record<number, PropertyState>;
  bankHouses: number;
  bankHotels: number;
  consecutiveDoubles: number;
  pendingRoll?: PendingRoll;
  pendingPurchase?: PendingPurchase;
  auction?: AuctionState;
  pendingTrade?: TradeOffer;
  card?: CardReveal;
  lastRoll?: PendingRoll;
  eventLog: GameEvent[];
  nextEventId: number;
  notice?: string;
  winnerId?: string;
}

export type PayKind = "jailFine" | "jailCard";

export type GameAction =
  | { type: "JOIN"; player: PlayerInput }
  | { type: "SET_APPEARANCE"; playerId: string; tokenId?: string; diceId?: string }
  | { type: "START"; playerId: string; firstPlayerId: string }
  | { type: "ROLL"; playerId: string; dice: Dice }
  | { type: "MOVE_RESULT"; playerId: string; cardDraws?: CardDraw[] }
  | { type: "BUY"; playerId: string; propertyId: number }
  | { type: "DECLINE_BUY"; playerId: string }
  | {
      type: "BUILD";
      playerId: string;
      propertyId: number;
      operation: "build" | "sell";
    }
  | { type: "MORTGAGE"; playerId: string; propertyId: number; mortgage: boolean }
  | { type: "PAY"; playerId: string; kind: PayKind }
  | { type: "END_TURN"; playerId: string }
  | { type: "AUCTION_BID"; playerId: string; amount?: number; pass?: boolean }
  | {
      type: "TRADE_OFFER";
      playerId: string;
      offerId: string;
      toPlayerId: string;
      offeredCash: number;
      offeredPropertyIds: number[];
      requestedCash: number;
      requestedPropertyIds: number[];
    }
  | { type: "TRADE_ACCEPT"; playerId: string; offerId: string }
  | { type: "TRADE_DECLINE"; playerId: string; offerId: string };
