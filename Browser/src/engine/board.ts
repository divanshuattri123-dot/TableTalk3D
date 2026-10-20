import type {
  CardDeck,
  BoardSize,
  ColorGroup,
  PurchasableTile,
  RailroadTile,
  StreetTile,
  Tile,
  UtilityTile
} from "./types";

export type CardEffect =
  | { kind: "money"; amount: number }
  | { kind: "moveTo"; position: number; awardGo?: boolean }
  | { kind: "nearestRailroad" }
  | { kind: "moveRelative"; spaces: number }
  | { kind: "goToJail" }
  | { kind: "jailCard" }
  | { kind: "collectFromEach"; amount: number };

export interface GameCard {
  text: string;
  effect: CardEffect;
}

const street = (
  position: number,
  name: string,
  group: ColorGroup,
  price: number,
  houseCost: number,
  rent: StreetTile["rent"]
): StreetTile => ({
  position,
  name,
  kind: "property",
  group,
  price,
  mortgageValue: price / 2,
  houseCost,
  rent
});

const railroad = (position: number, name: string): RailroadTile => ({
  position,
  name,
  kind: "railroad",
  price: 200,
  mortgageValue: 100
});

const utility = (position: number, name: string): UtilityTile => ({
  position,
  name,
  kind: "utility",
  price: 150,
  mortgageValue: 75
});

export const BOARD: readonly Tile[] = [
  { position: 0, name: "GO", kind: "go" },
  street(1, "Mediterranean Avenue", "brown", 60, 50, [2, 10, 30, 90, 160, 250]),
  { position: 2, name: "Community Chest", kind: "community" },
  street(3, "Baltic Avenue", "brown", 60, 50, [4, 20, 60, 180, 320, 450]),
  { position: 4, name: "Income Tax", kind: "tax", amount: 200 },
  railroad(5, "Reading Railroad"),
  street(6, "Oriental Avenue", "lightBlue", 100, 50, [6, 30, 90, 270, 400, 550]),
  { position: 7, name: "Chance", kind: "chance" },
  street(8, "Vermont Avenue", "lightBlue", 100, 50, [6, 30, 90, 270, 400, 550]),
  street(9, "Connecticut Avenue", "lightBlue", 120, 50, [8, 40, 100, 300, 450, 600]),
  { position: 10, name: "Jail / Just Visiting", kind: "jail" },
  street(11, "St. Charles Place", "pink", 140, 100, [10, 50, 150, 450, 625, 750]),
  utility(12, "Electric Company"),
  street(13, "States Avenue", "pink", 140, 100, [10, 50, 150, 450, 625, 750]),
  street(14, "Virginia Avenue", "pink", 160, 100, [12, 60, 180, 500, 700, 900]),
  railroad(15, "Pennsylvania Railroad"),
  street(16, "St. James Place", "orange", 180, 100, [14, 70, 200, 550, 750, 950]),
  { position: 17, name: "Community Chest", kind: "community" },
  street(18, "Tennessee Avenue", "orange", 180, 100, [14, 70, 200, 550, 750, 950]),
  street(19, "New York Avenue", "orange", 200, 100, [16, 80, 220, 600, 800, 1000]),
  { position: 20, name: "Free Parking", kind: "freeParking" },
  street(21, "Kentucky Avenue", "red", 220, 150, [18, 90, 250, 700, 875, 1050]),
  { position: 22, name: "Chance", kind: "chance" },
  street(23, "Indiana Avenue", "red", 220, 150, [18, 90, 250, 700, 875, 1050]),
  street(24, "Illinois Avenue", "red", 240, 150, [20, 100, 300, 750, 925, 1100]),
  railroad(25, "B. & O. Railroad"),
  street(26, "Atlantic Avenue", "yellow", 260, 150, [22, 110, 330, 800, 975, 1150]),
  street(27, "Ventnor Avenue", "yellow", 260, 150, [22, 110, 330, 800, 975, 1150]),
  utility(28, "Water Works"),
  street(29, "Marvin Gardens", "yellow", 280, 150, [24, 120, 360, 850, 1025, 1200]),
  { position: 30, name: "Go To Jail", kind: "goToJail" },
  street(31, "Pacific Avenue", "green", 300, 200, [26, 130, 390, 900, 1100, 1275]),
  street(32, "North Carolina Avenue", "green", 300, 200, [26, 130, 390, 900, 1100, 1275]),
  { position: 33, name: "Community Chest", kind: "community" },
  street(34, "Pennsylvania Avenue", "green", 320, 200, [28, 150, 450, 1000, 1200, 1400]),
  railroad(35, "Short Line"),
  { position: 36, name: "Chance", kind: "chance" },
  street(37, "Park Place", "darkBlue", 350, 200, [35, 175, 500, 1100, 1300, 1500]),
  { position: 38, name: "Luxury Tax", kind: "tax", amount: 100 },
  street(39, "Boardwalk", "darkBlue", 400, 200, [50, 200, 600, 1400, 1700, 2000])
];

export const CHANCE_CARDS: readonly GameCard[] = [
  { text: "Advance to GO. Collect $200.", effect: { kind: "moveTo", position: 0, awardGo: true } },
  { text: "Advance to Illinois Avenue.", effect: { kind: "moveTo", position: 24 } },
  { text: "Advance to the nearest railroad.", effect: { kind: "nearestRailroad" } },
  { text: "Go back three spaces.", effect: { kind: "moveRelative", spaces: -3 } },
  { text: "Bank pays you a dividend of $50.", effect: { kind: "money", amount: 50 } },
  { text: "Pay poor tax of $15.", effect: { kind: "money", amount: -15 } },
  { text: "Go directly to Jail.", effect: { kind: "goToJail" } },
  { text: "Get Out of Jail Free.", effect: { kind: "jailCard" } }
];

export const COMMUNITY_CARDS: readonly GameCard[] = [
  { text: "Advance to GO. Collect $200.", effect: { kind: "moveTo", position: 0, awardGo: true } },
  { text: "Bank error in your favor. Collect $200.", effect: { kind: "money", amount: 200 } },
  { text: "Doctor's fee. Pay $50.", effect: { kind: "money", amount: -50 } },
  { text: "Get Out of Jail Free.", effect: { kind: "jailCard" } },
  { text: "Go directly to Jail.", effect: { kind: "goToJail" } },
  { text: "Grand opera night. Collect $50 from every player.", effect: { kind: "collectFromEach", amount: 50 } },
  { text: "Income tax refund. Collect $20.", effect: { kind: "money", amount: 20 } },
  { text: "Holiday fund matures. Collect $100.", effect: { kind: "money", amount: 100 } }
];

export const RAILROAD_POSITIONS = [5, 15, 25, 35] as const;
export const UTILITY_POSITIONS = [12, 28] as const;

const EXPANSION_GROUPS: readonly ColorGroup[][] = [
  ["coral", "teal", "violet", "lime"],
  ["copper", "sky", "rose", "mint"],
  ["indigo", "amber", "lavender", "turquoise"]
];
const EXPANSION_NAMES = [
  [["Harbour Quay", "Marina Walk"], ["Museum Mile", "Gallery Lane"], ["Skyline Drive", "Observatory Hill"], ["Botanical Way", "Orchard Square"]],
  [["Foundry Street", "Copper Market"], ["Cloud Avenue", "Aviator Park"], ["Rosewater Road", "Festival Place"], ["Emerald Terrace", "Fern Gardens"]],
  [["Indigo Pier", "Midnight Promenade"], ["Amber Arcade", "Lantern Boulevard"], ["Lavender Crescent", "Violet Court"], ["Lagoon Heights", "Coral Palace"]]
] as const;

const expandedBoard = (tiers: number): readonly Tile[] => {
  const result: Tile[] = [];
  for (let side = 0; side < 4; side += 1) {
    for (const tile of BOARD.slice(side * 10, side * 10 + 10)) result.push({ ...tile, position: result.length });
    for (let tier = 0; tier < tiers; tier += 1) {
      for (let deed = 0; deed < 2; deed += 1) {
        const price = 80 + side * 60 + tier * 40 + deed * 20;
        const base = Math.floor(price / 10);
        result.push(street(result.length, EXPANSION_NAMES[tier]![side]![deed]!, EXPANSION_GROUPS[tier]![side]!, price,
          50 * (side + 1), [base, base * 5, base * 15, base * 40, base * 60, base * 80]));
      }
    }
  }
  return result;
};
const BOARDS: Record<BoardSize, readonly Tile[]> = { 40: BOARD, 48: expandedBoard(1), 56: expandedBoard(2), 64: expandedBoard(3) };
export const boardSizeForPlayers = (count: number): BoardSize => count >= 6 ? 64 : count === 5 ? 56 : count === 4 ? 48 : 40;
export const getBoard = (size: BoardSize = 40): readonly Tile[] => BOARDS[size];
export const classicPosition = (position: number, size: BoardSize = 40): number => position + Math.floor(position / 10) * (size / 4 - 10);
export const railroadPositions = (size: BoardSize = 40): number[] => RAILROAD_POSITIONS.map((position) => classicPosition(position, size));
export const utilityPositions = (size: BoardSize = 40): number[] => UTILITY_POSITIONS.map((position) => classicPosition(position, size));

export const isPurchasableTile = (tile: Tile): tile is PurchasableTile =>
  tile.kind === "property" || tile.kind === "railroad" || tile.kind === "utility";

export const isStreetTile = (tile: Tile): tile is StreetTile => tile.kind === "property";

export const getTile = (position: number, size: BoardSize = 40): Tile => getBoard(size)[position] as Tile;

export const getPurchasableTile = (position: number, size: BoardSize = 40): PurchasableTile | undefined => {
  const tile = getTile(position, size);
  return tile && isPurchasableTile(tile) ? tile : undefined;
};

export const colorGroupTiles = (group: ColorGroup, size: BoardSize = 40): StreetTile[] =>
  getBoard(size).filter((tile): tile is StreetTile => isStreetTile(tile) && tile.group === group);

export const cardAt = (deck: CardDeck, index: number): GameCard | undefined =>
  (deck === "chance" ? CHANCE_CARDS : COMMUNITY_CARDS)[index];
