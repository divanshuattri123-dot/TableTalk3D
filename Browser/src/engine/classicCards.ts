import type { GameCard } from "./board";
import type { CardDeck } from "./types";

// Independent IDs keep existing expanding-mode saves and their card journals readable.
export const CLASSIC_CARDS: Record<CardDeck, readonly GameCard[]> = {
  chance: [
    { text: "Advance to Marine Drive.", effect: { kind: "moveTo", position: 39 } },
    { text: "Advance to GO. Collect ₹200.", effect: { kind: "moveTo", position: 0, awardGo: true } },
    { text: "Advance to Hussain Sagar. Collect ₹200 if you pass GO.", effect: { kind: "moveTo", position: 24 } },
    { text: "Advance to Zirakpur. Collect ₹200 if you pass GO.", effect: { kind: "moveTo", position: 11 } },
    { text: "Advance to the next railroad. Pay double rent if it is owned.", effect: { kind: "nearestRailroad" } },
    { text: "Advance to the next railroad. Pay double rent if it is owned.", effect: { kind: "nearestRailroad" } },
    { text: "Advance to the next utility. If owned, roll fresh dice and pay ten times the total.", effect: { kind: "nearestUtility" } },
    { text: "Bank dividend. Collect ₹50.", effect: { kind: "money", amount: 50 } },
    { text: "Get Out of Jail Free. Keep this card until used or traded.", effect: { kind: "jailCard" } },
    { text: "Go back three spaces.", effect: { kind: "moveRelative", spaces: -3 } },
    { text: "Go directly to Jail. Do not collect for passing GO.", effect: { kind: "goToJail" } },
    { text: "General repairs: pay ₹25 per house and ₹100 per hotel.", effect: { kind: "repairs", house: 25, hotel: 100 } },
    { text: "Speeding fine. Pay ₹15.", effect: { kind: "money", amount: -15 } },
    { text: "Travel to CSMT Station. Collect ₹200 if you pass GO.", effect: { kind: "moveTo", position: 5 } },
    { text: "Elected chairperson. Pay every other player ₹50.", effect: { kind: "payEach", amount: 50 } },
    { text: "Your building loan matures. Collect ₹150.", effect: { kind: "money", amount: 150 } }
  ],
  community: [
    { text: "Advance to GO. Collect ₹200.", effect: { kind: "moveTo", position: 0, awardGo: true } },
    { text: "Bank error in your favour. Collect ₹200.", effect: { kind: "money", amount: 200 } },
    { text: "Doctor's fee. Pay ₹50.", effect: { kind: "money", amount: -50 } },
    { text: "Stock sale proceeds. Collect ₹50.", effect: { kind: "money", amount: 50 } },
    { text: "Get Out of Jail Free. Keep this card until used or traded.", effect: { kind: "jailCard" } },
    { text: "Go directly to Jail. Do not collect for passing GO.", effect: { kind: "goToJail" } },
    { text: "Holiday fund matures. Collect ₹100.", effect: { kind: "money", amount: 100 } },
    { text: "Income tax refund. Collect ₹20.", effect: { kind: "money", amount: 20 } },
    { text: "It is your birthday. Collect ₹10 from every other player.", effect: { kind: "collectFromEach", amount: 10 } },
    { text: "Life insurance matures. Collect ₹100.", effect: { kind: "money", amount: 100 } },
    { text: "Hospital fees. Pay ₹100.", effect: { kind: "money", amount: -100 } },
    { text: "School fees. Pay ₹50.", effect: { kind: "money", amount: -50 } },
    { text: "Consultancy fee. Collect ₹25.", effect: { kind: "money", amount: 25 } },
    { text: "Street repairs: pay ₹40 per house and ₹115 per hotel.", effect: { kind: "repairs", house: 40, hotel: 115 } },
    { text: "Beauty contest prize. Collect ₹10.", effect: { kind: "money", amount: 10 } },
    { text: "You inherit ₹100.", effect: { kind: "money", amount: 100 } }
  ]
};
export const jailCardIndex = (deck: CardDeck) => CLASSIC_CARDS[deck].findIndex(card => card.effect.kind === "jailCard");
