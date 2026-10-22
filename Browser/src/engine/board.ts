import type {
  CardDeck,
  BoardSize,
  ColorGroup,
  PurchasableTile,
  BaseTile,
  RailroadTile,
  StreetTile,
  Tile,
  UtilityTile
} from "./types";

type Place = Pick<BaseTile, "name" | "boardLabel" | "region" | "detail">;
const place = (name: string, boardLabel: string, region: string, detail: string): Place => ({ name, boardLabel, region, detail });

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
  location: Place,
  group: ColorGroup,
  price: number,
  houseCost: number,
  rent: StreetTile["rent"]
): StreetTile => ({
  position,
  ...location,
  kind: "property",
  group,
  price,
  mortgageValue: price / 2,
  houseCost,
  rent
});

const railroad = (position: number, location: Place): RailroadTile => ({
  position,
  ...location,
  kind: "railroad",
  price: 200,
  mortgageValue: 100
});

const utility = (position: number, location: Place): UtilityTile => ({
  position,
  ...location,
  kind: "utility",
  price: 150,
  mortgageValue: 75
});

export const BOARD: readonly Tile[] = [
  { position: 0, name: "GO", detail: "Collect ₹200 when you pass or land here.", kind: "go" },
  street(1, place("Fort Kochi", "Fort Kochi", "Kochi · Kerala", "Heritage waterfront and spice-trade quarter"), "brown", 60, 50, [2, 10, 30, 90, 160, 250]),
  { position: 2, name: "Community Chest", kind: "community" },
  street(3, place("Mattancherry Palace", "Mattancherry", "Kochi · Kerala", "Historic palace and old market lanes"), "brown", 60, 50, [4, 20, 60, 180, 320, 450]),
  { position: 4, name: "Income Tax", boardLabel: "Income Tax", detail: "Pay ₹200 to the bank.", kind: "tax", amount: 200 },
  railroad(5, place("Chhatrapati Shivaji Maharaj Terminus", "CSMT Station", "Mumbai · Maharashtra", "UNESCO-listed rail terminus")),
  street(6, place("Marina Beach", "Marina Beach", "Chennai · Tamil Nadu", "Iconic Bay of Bengal promenade"), "lightBlue", 100, 50, [6, 30, 90, 270, 400, 550]),
  { position: 7, name: "Chance", kind: "chance" },
  street(8, place("Mylapore", "Mylapore", "Chennai · Tamil Nadu", "Temple quarter, tank and heritage streets"), "lightBlue", 100, 50, [6, 30, 90, 270, 400, 550]),
  street(9, place("T. Nagar", "T. Nagar", "Chennai · Tamil Nadu", "Busy shopping district and Pondy Bazaar"), "lightBlue", 120, 50, [8, 40, 100, 300, 450, 600]),
  { position: 10, name: "Jail / Just Visiting", detail: "Visit friends or serve time after a jail move.", kind: "jail" },
  street(11, place("Cubbon Park", "Cubbon Park", "Bengaluru · Karnataka", "Tree-lined central park and civic district"), "pink", 140, 100, [10, 50, 150, 450, 625, 750]),
  utility(12, place("City Power Grid", "Power Grid", "India · Electricity", "Utility rent depends on the dice roll")),
  street(13, place("M. G. Road", "M. G. Road", "Bengaluru · Karnataka", "Historic boulevard and city-centre shops"), "pink", 140, 100, [10, 50, 150, 450, 625, 750]),
  street(14, place("Lalbagh Botanical Garden", "Lalbagh", "Bengaluru · Karnataka", "Historic botanical garden and glasshouse"), "pink", 160, 100, [12, 60, 180, 500, 700, 900]),
  railroad(15, place("New Delhi Railway Station", "New Delhi Station", "New Delhi · Delhi", "Major gateway to the capital")),
  street(16, place("Park Street", "Park Street", "Kolkata · West Bengal", "Dining, culture and old-city nightlife"), "orange", 180, 100, [14, 70, 200, 550, 750, 950]),
  { position: 17, name: "Community Chest", kind: "community" },
  street(18, place("New Market", "New Market", "Kolkata · West Bengal", "Historic covered market and trading lanes"), "orange", 180, 100, [14, 70, 200, 550, 750, 950]),
  street(19, place("Victoria Memorial", "Victoria Memorial", "Kolkata · West Bengal", "Marble landmark set in landscaped gardens"), "orange", 200, 100, [16, 80, 220, 600, 800, 1000]),
  { position: 20, name: "Free Parking", detail: "A free stop. This edition has no tax jackpot.", kind: "freeParking" },
  street(21, place("Charminar", "Charminar", "Hyderabad · Telangana", "Four-minaret landmark and old-city bazaar"), "red", 220, 150, [18, 90, 250, 700, 875, 1050]),
  { position: 22, name: "Chance", kind: "chance" },
  street(23, place("Golconda Fort", "Golconda Fort", "Hyderabad · Telangana", "Hilltop fortress and historic royal complex"), "red", 220, 150, [18, 90, 250, 700, 875, 1050]),
  street(24, place("Hussain Sagar", "Hussain Sagar", "Hyderabad · Telangana", "Lakefront promenade and city landmark"), "red", 240, 150, [20, 100, 300, 750, 925, 1100]),
  railroad(25, place("Howrah Junction", "Howrah Junction", "Kolkata · West Bengal", "Historic station beside the Hooghly")),
  street(26, place("Hawa Mahal", "Hawa Mahal", "Jaipur · Rajasthan", "The Palace of Winds in the Pink City"), "yellow", 260, 150, [22, 110, 330, 800, 975, 1150]),
  street(27, place("Amer Fort", "Amer Fort", "Jaipur · Rajasthan", "Hilltop fort overlooking Maota Lake"), "yellow", 260, 150, [22, 110, 330, 800, 975, 1150]),
  utility(28, place("Municipal Waterworks", "Waterworks", "India · Water Supply", "Utility rent depends on the dice roll")),
  street(29, place("Jantar Mantar", "Jantar Mantar", "Jaipur · Rajasthan", "UNESCO-listed astronomical observatory"), "yellow", 280, 150, [24, 120, 360, 850, 1025, 1200]),
  { position: 30, name: "Go To Jail", detail: "Move directly to Jail. Do not collect ₹200.", kind: "goToJail" },
  street(31, place("Chandni Chowk", "Chandni Chowk", "Delhi · National Capital", "Old Delhi market and food lanes"), "green", 300, 200, [26, 130, 390, 900, 1100, 1275]),
  street(32, place("Connaught Place", "Connaught Place", "Delhi · National Capital", "Grand circular shopping and business district"), "green", 300, 200, [26, 130, 390, 900, 1100, 1275]),
  { position: 33, name: "Community Chest", kind: "community" },
  street(34, place("India Gate", "India Gate", "Delhi · National Capital", "War memorial on the ceremonial boulevard"), "green", 320, 200, [28, 150, 450, 1000, 1200, 1400]),
  railroad(35, place("Chennai Central", "Chennai Central", "Chennai · Tamil Nadu", "Red-brick landmark and major rail hub")),
  { position: 36, name: "Chance", kind: "chance" },
  street(37, place("Gateway of India", "Gateway of India", "Mumbai · Maharashtra", "Harbour-facing arch and historic waterfront"), "darkBlue", 350, 200, [35, 175, 500, 1100, 1300, 1500]),
  { position: 38, name: "GST / Trade Duty", boardLabel: "GST Duty", region: "India · Commerce", detail: "Pay ₹100 to the bank.", kind: "tax", amount: 100 },
  street(39, place("Marine Drive", "Marine Drive", "Mumbai · Maharashtra", "The Queen’s Necklace along Back Bay"), "darkBlue", 400, 200, [50, 200, 600, 1400, 1700, 2000])
];

export const CHANCE_CARDS: readonly GameCard[] = [
  { text: "Advance to GO. Collect ₹200.", effect: { kind: "moveTo", position: 0, awardGo: true } },
  { text: "Ride the express to Hussain Sagar.", effect: { kind: "moveTo", position: 24 } },
  { text: "Advance to the nearest railroad. If owned, pay twice its usual rent.", effect: { kind: "nearestRailroad" } },
  { text: "Go back three spaces.", effect: { kind: "moveRelative", spaces: -3 } },
  { text: "The bank pays a festival dividend of ₹50.", effect: { kind: "money", amount: 50 } },
  { text: "Pay a local civic levy of ₹15.", effect: { kind: "money", amount: -15 } },
  { text: "Go directly to Jail.", effect: { kind: "goToJail" } },
  { text: "Get Out of Jail Free.", effect: { kind: "jailCard" } }
];

export const COMMUNITY_CARDS: readonly GameCard[] = [
  { text: "Advance to GO. Collect ₹200.", effect: { kind: "moveTo", position: 0, awardGo: true } },
  { text: "Bank error in your favour. Collect ₹200.", effect: { kind: "money", amount: 200 } },
  { text: "Clinic and medicines. Pay ₹50.", effect: { kind: "money", amount: -50 } },
  { text: "Get Out of Jail Free.", effect: { kind: "jailCard" } },
  { text: "Go directly to Jail.", effect: { kind: "goToJail" } },
  { text: "Community festival night. Collect ₹50 from every player.", effect: { kind: "collectFromEach", amount: 50 } },
  { text: "Income tax refund. Collect ₹20.", effect: { kind: "money", amount: 20 } },
  { text: "Savings certificate matures. Collect ₹100.", effect: { kind: "money", amount: 100 } }
];

export const RAILROAD_POSITIONS = [5, 15, 25, 35] as const;
export const UTILITY_POSITIONS = [12, 28] as const;

const EXPANSION_GROUPS: readonly ColorGroup[][] = [
  ["coral", "teal", "violet", "lime"],
  ["copper", "sky", "rose", "mint"],
  ["indigo", "amber", "lavender", "turquoise"]
];
const EXPANSION_NAMES: readonly (readonly (readonly Place[])[])[] = [
  [
    [place("Sabarmati Riverfront", "Sabarmati", "Ahmedabad · Gujarat", "Riverfront promenade and public gardens"), place("Adalaj Stepwell", "Adalaj Stepwell", "Ahmedabad · Gujarat", "Ornate 15th-century stepwell")],
    [place("Dashashwamedh Ghat", "Dashashwamedh", "Varanasi · Uttar Pradesh", "Riverside ghat on the Ganga"), place("Sarnath", "Sarnath", "Varanasi · Uttar Pradesh", "Buddhist heritage and archaeological park")],
    [place("Golden Temple", "Golden Temple", "Amritsar · Punjab", "Sacred complex and community kitchen"), place("Jallianwala Bagh", "Jallianwala Bagh", "Amritsar · Punjab", "Historic memorial garden")],
    [place("Bara Imambara", "Bara Imambara", "Lucknow · Uttar Pradesh", "Nawabi-era monument and central hall"), place("Hazratganj", "Hazratganj", "Lucknow · Uttar Pradesh", "Heritage shopping district")]
  ],
  [
    [place("City Palace", "City Palace", "Udaipur · Rajasthan", "Lakefront palace complex"), place("Lake Pichola", "Lake Pichola", "Udaipur · Rajasthan", "Historic lake and island palaces")],
    [place("Dal Lake", "Dal Lake", "Srinagar · Jammu & Kashmir", "Mountain lake, houseboats and gardens"), place("Nishat Bagh", "Nishat Bagh", "Srinagar · Jammu & Kashmir", "Terraced Mughal garden")],
    [place("Shaniwar Wada", "Shaniwar Wada", "Pune · Maharashtra", "Maratha fortification and old-city landmark"), place("Fergusson College Road", "FC Road", "Pune · Maharashtra", "Lively central shopping avenue")],
    [place("Fontainhas", "Fontainhas", "Panaji · Goa", "Colourful Latin Quarter lanes"), place("Calangute Beach", "Calangute", "North Goa · Goa", "Popular Arabian Sea shoreline")]
  ],
  [
    [place("Mysore Palace", "Mysore Palace", "Mysuru · Karnataka", "Illuminated royal palace and gardens"), place("Chamundi Hills", "Chamundi Hills", "Mysuru · Karnataka", "Hilltop temple and city views")],
    [place("Lakshman Jhula", "Lakshman Jhula", "Rishikesh · Uttarakhand", "Suspension bridge above the Ganga"), place("Triveni Ghat", "Triveni Ghat", "Rishikesh · Uttarakhand", "Riverside steps and evening aarti")],
    [place("Tiger Hill", "Tiger Hill", "Darjeeling · West Bengal", "Sunrise viewpoint over the Himalaya"), place("Darjeeling Mall Road", "Mall Road", "Darjeeling · West Bengal", "Hill-station promenade and bazaar")],
    [place("Cellular Jail", "Cellular Jail", "Port Blair · Andaman", "National memorial by the harbour"), place("Radhanagar Beach", "Radhanagar", "Havelock · Andaman", "Island beach in a tropical forest")]
  ]
];

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
