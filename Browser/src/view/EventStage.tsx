import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { assetUrl, useAssets } from "../assets";
import { getPurchasableTile, getTile, isStreetTile } from "../engine/board";
import { calculateRent } from "../engine/reducer";
import type { GameAction, GameState, Player } from "../engine/types";
import type { PresentationFrame } from "../presentation/plan";
import { GROUP_COLORS } from "./palette";

const money = (value: number) => `$${value.toLocaleString("en-US")}`;
const ART = { presenting: "dba32b5b1a084458", hammer: "bf380b9028ee80ae", waiting: "7e5612f738223164", sold: "3d92b4733d425fa8", jail: "d73b9e891369cc5b", bankrupt: "ff6eb34a6f9e58ff", winner: "5be924bf8411012c", chest: "76a2561bbb2b243c" };
function Character({ pose, className = "" }: { pose: keyof typeof ART; className?: string }) {
  return <img className={`event-character ${className}`} alt="" src={assetUrl(`assets/images/${ART[pose]}.webp`)} />;
}

export function PlayerPortrait({ player }: { player: Player }) {
  const { byId, catalog } = useAssets();
  const token = byId.get(player.tokenId ?? "");
  const name = token?.name.toLowerCase() ?? "car";
  const iconName = name.includes("lantern") ? "013_TokenIcon_Atlantic_Lantern" : name.includes("samurai") ? "035_TokenIcon_Tokyo_SamuraiHelmet" : name.includes("dragon") ? "054_TokenIcon_Golden_Dragon" : name.includes("cat") ? "001_TokenIcon_Gray_Cat" : name.includes("boot") ? "008_TokenIcon_Classic_Boot" : "000_TokenIcon_Gray_Car";
  const portrait = catalog?.assets.find(a => a.kind === "image" && a.name === iconName);
  return <span className="silver-portrait" style={{ "--player-color": player.color } as CSSProperties} aria-hidden="true">
    {portrait && <img src={assetUrl(portrait.src)} alt="" />}
    <span>{token?.label?.toLowerCase().includes("car") ? "◆" : player.name.slice(0, 1)}</span>
  </span>;
}

export function TitleDeed({ game, position, rent }: { game: GameState; position: number; rent?: number }) {
  const tile = getPurchasableTile(position, game.boardSize);
  if (!tile) return null;
  const stripe = tile.kind === "property" ? GROUP_COLORS[tile.group] : tile.kind === "railroad" ? "#34465c" : "#d4a234";
  const rows = tile.kind === "property" ? [
    ["Rent", tile.rent[0]], ["Full colour set", tile.rent[0] * 2], ...tile.rent.slice(1).map((value, i) => [i === 4 ? "With HOTEL" : `With ${i + 1} house${i ? "s" : ""}`, value])
  ] : tile.kind === "railroad" ? [["1 railroad", 25], ["2 railroads", 50], ["3 railroads", 100], ["4 railroads", 200]] : [["One utility", "4 × dice"], ["Both utilities", "10 × dice"]];
  return <article className="title-deed" style={{ "--deed-color": stripe } as CSSProperties}>
    <header><small>TITLE DEED</small><h2>{tile.name}</h2></header>
    <div className="deed-symbol">{tile.kind === "railroad" ? "🚂" : tile.kind === "utility" ? "⚡" : "⌂"}</div>
    <dl>{rows.map(([label, value]) => <div key={label} className={value === rent ? "applicable-rent" : ""}><dt>{label}</dt><dd>{typeof value === "number" ? money(value) : value}</dd></div>)}</dl>
    <footer><p>Mortgage value <b>{money(tile.mortgageValue)}</b></p>{isStreetTile(tile) && <><p>Houses cost <b>{money(tile.houseCost)} each</b></p><p>Hotel costs <b>{money(tile.houseCost)} + 4 houses</b></p></>}<small>{isStreetTile(tile) ? "Own the complete colour set. Build evenly." : tile.kind === "utility" ? "Multiply by the total of the landing dice." : "More railroads mean higher rent."}</small></footer>
  </article>;
}

export default function EventStage({ game, frame, busy, localId, sendAction }: {
  game: GameState; frame?: PresentationFrame; busy: boolean; localId: string; sendAction: (action: GameAction) => void;
}) {
  const [bid, setBid] = useState("");
  const previousAuction = useRef(game.auction);
  useEffect(() => { if (game.auction) previousAuction.current = game.auction; }, [game.auction]);
  const me = game.players.find(p => p.id === localId), actor = game.players.find(p => p.id === frame?.playerId);
  const current = game.players.find(p => p.id === game.activePlayerId);
  const acting = current?.id === localId && !busy && !me?.bankrupt;
  const auction = game.auction ?? (frame?.kind === "sold" ? previousAuction.current : undefined);
  const eventColor = actor?.color ?? current?.color ?? "#e93244";
  if (auction && (game.auction || frame?.kind === "sold")) {
    const sold = frame?.kind === "sold", winner = game.players.find(p => p.id === (sold ? frame.playerId : auction.highestBidderId));
    const tile = getPurchasableTile(auction.propertyId, game.boardSize);
    const eligible = Boolean(game.auction && me && !me.bankrupt && auction.eligiblePlayerIds.includes(me.id) && !auction.passedPlayerIds.includes(me.id) && auction.highestBidderId !== me.id);
    const minimum = auction.currentBid + 1;
    const doBid = (amount: number) => { sendAction({ type: "AUCTION_BID", playerId: localId, amount }); setBid(""); };
    return <div className="event-backdrop auction-backdrop" style={{ "--auction-color": tile?.kind === "property" ? GROUP_COLORS[tile.group] : "#7695a8" } as CSSProperties}>
      <section className={`auction-stage ${sold ? "is-sold" : ""}`} role="dialog" aria-modal="true" aria-label="Live property auction">
        <header className="auction-heading"><span>LIVE AUCTION</span><h1>{sold ? "SOLD!" : "Who wants the deed?"}</h1><p>{sold ? frame.text : "Bid higher, or pass. The last bidder wins."}</p></header>
        <div className="auctioneer"><div className="auction-speech" key={frame?.id ?? auction.currentBid}>{sold ? `${winner?.name} takes it!` : frame?.kind === "bid" ? frame.text : auction.currentBid ? `${money(auction.currentBid)}. Any higher?` : "Let’s open the bidding!"}</div><Character pose={sold ? "sold" : "waiting"} /><Character pose="hammer" className={frame?.kind === "bid" || sold ? "auction-hammer striking" : "auction-hammer"} /></div>
        <div className="auction-deed"><TitleDeed game={game} position={auction.propertyId} />{sold && <span className="sold-stamp">SOLD</span>}</div>
        <div className="auction-bidding"><div className="highest-bid" key={auction.currentBid}><small>{sold ? "WINNING BID" : "HIGHEST BID"}</small><strong>{money(auction.currentBid)}</strong><span>{winner?.name ?? "No bids yet"}</span></div>
          <div className="auction-participants">{game.players.filter(p => !p.bankrupt).map(player => <div className={`${auction.passedPlayerIds.includes(player.id) ? "has-passed" : ""} ${winner?.id === player.id ? "high-bidder" : ""}`} key={player.id}><PlayerPortrait player={player} /><span><b>{player.name}</b><small>{auction.passedPlayerIds.includes(player.id) ? "Passed" : winner?.id === player.id ? "Leading" : "In the auction"}</small></span><strong>{money(player.cash)}</strong></div>)}</div>
          {eligible && <div className="big-bid-controls"><div>{[10, 50, 100].map(step => <button type="button" key={step} disabled={busy || (me?.cash ?? 0) < auction.currentBid + step} onClick={() => doBid(auction.currentBid + step)}>+{money(step)}</button>)}</div><label>Choose your bid<input aria-label="Auction bid amount" type="number" min={minimum} max={me?.cash} value={bid} placeholder={String(minimum)} onChange={e => setBid(e.target.value)} /></label><div><button className="event-primary" type="button" disabled={busy || !bid || Number(bid) < minimum || Number(bid) > (me?.cash ?? 0)} onClick={() => doBid(Math.floor(Number(bid)))}>Place bid</button><button className="event-secondary" type="button" disabled={busy} onClick={() => sendAction({ type: "AUCTION_BID", playerId: localId, pass: true })}>Pass</button></div></div>}
          {!eligible && !sold && <p className="auction-waiting">{winner?.id === localId ? "You have the highest bid. Waiting for the others." : auction.passedPlayerIds.includes(localId) ? "You passed. Watch the bidding." : "Watching the auction."}</p>}
        </div>
      </section>
    </div>;
  }
  if (game.pendingPurchase && !busy) {
    const position = game.pendingPurchase.propertyId, tile = getPurchasableTile(position, game.boardSize)!;
    return <div className="event-backdrop purchase-backdrop"><section className="purchase-stage" role="dialog" aria-modal="true" aria-label={`Purchase ${tile.name}`}>
      <div className="sale-intro"><p className="event-ribbon" style={{ background: current?.color }}>FOR SALE</p><h1>{tile.name}</h1><p>{current?.name} landed here.</p><Character pose="presenting" /></div><TitleDeed game={game} position={position} />
      <div className="sale-actions"><p>Bank price<strong>{money(tile.price)}</strong></p>{acting ? <><button className="event-primary" type="button" disabled={(me?.cash ?? 0) < tile.price} onClick={() => sendAction({ type: "BUY", playerId: localId, propertyId: position })}>Buy property</button><button className="event-secondary" type="button" onClick={() => sendAction({ type: "DECLINE_BUY", playerId: localId })}>Start auction</button><small>Your cash: {money(me?.cash ?? 0)}<br />Declining opens bidding to everybody.</small></> : <p className="auction-waiting">Waiting for {current?.name} to buy or auction.</p>}</div>
    </section></div>;
  }
  if (game.pendingTrade && !busy) {
    const trade = game.pendingTrade, from = game.players.find(p => p.id === trade.fromPlayerId)!, to = game.players.find(p => p.id === trade.toPlayerId)!;
    return <div className="event-backdrop trade-backdrop"><section className="trade-stage" role="dialog" aria-modal="true" aria-label="Trade offer"><h1>Let’s make a deal.</h1><p>{from.name} made an offer to {to.name}.</p><div className="trade-comparison">{[{ player: from, cash: trade.offeredCash, deeds: trade.offeredPropertyIds }, { player: to, cash: trade.requestedCash, deeds: trade.requestedPropertyIds }].map(side => <article key={side.player.id} style={{ "--player-color": side.player.color } as CSSProperties}><PlayerPortrait player={side.player} /><h2>{side.player.name} gives</h2><strong>{money(side.cash)}</strong><ul>{side.deeds.length ? side.deeds.map(id => <li key={id}>{getTile(id, game.boardSize).name}</li>) : <li>No properties</li>}</ul></article>)}</div>{localId === to.id ? <div className="trade-decision"><button className="event-primary" type="button" onClick={() => sendAction({ type: "TRADE_ACCEPT", playerId: localId, offerId: trade.id })}>Accept deal</button><button className="event-secondary" type="button" onClick={() => sendAction({ type: "TRADE_DECLINE", playerId: localId, offerId: trade.id })}>Decline</button></div> : <p>Waiting for {to.name}’s decision.</p>}</section></div>;
  }
  if (!frame) return null;
  if (frame.kind === "card") return <div className="event-backdrop card-event-backdrop"><section className={`card-reveal ${frame.deck}`} key={frame.id} aria-live="polite"><div className="card-flipper"><div className="card-back"><span>{frame.deck === "community" ? "✦" : "?"}</span></div><div className="card-front"><h2>{frame.deck === "community" ? "Community Chest" : "Chance"}</h2><Character pose={frame.deck === "community" ? "chest" : "presenting"} /><p>{frame.text}</p></div></div></section></div>;
  const cinematic = ["jail", "release", "bankrupt", "winner", "purchase", "sold", "mortgage", "build", "trade"].includes(frame.kind);
  const rent = frame.kind === "money" && frame.text.includes("rent for") && frame.tileId !== undefined;
  return <div className={`motion-event ${cinematic ? "cinematic-event" : ""} motion-${frame.kind}`} key={frame.id} style={{ "--event-color": eventColor } as CSSProperties} aria-live="polite">
    <div className="motion-banner">{actor && <PlayerPortrait player={actor} />}<div><small>{frame.kind === "dice" ? frame.text.includes("DOUBLES") ? "DOUBLES · ROLL AGAIN AFTER LANDING" : "ROLLING THE DICE" : frame.kind === "move" ? "ON THE MOVE" : frame.kind === "jail" ? "GO DIRECTLY TO JAIL" : frame.kind === "release" ? "FREE TO GO" : frame.kind === "winner" ? "THE CITY HAS A WINNER" : frame.kind === "purchase" ? "IT’S YOURS!" : frame.kind.toUpperCase()}</small><strong>{frame.text}</strong></div></div>
    {frame.kind === "dice" && <div className="settled-dice">{frame.dice?.map((value, i) => <span key={i}>{value}</span>)}</div>}
    {cinematic && <Character pose={frame.kind === "jail" ? "jail" : frame.kind === "bankrupt" ? "bankrupt" : frame.kind === "winner" ? "winner" : frame.kind === "sold" ? "sold" : "presenting"} />}
    {rent && <div className="rent-preview"><TitleDeed game={game} position={frame.tileId!} rent={calculateRent(game, frame.tileId!, game.lastRoll?.total ?? 0)} /></div>}
    {frame.kind === "money" && <div className="money-burst"><strong>{money(frame.amount ?? 0)}</strong>{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ "--coin": i } as CSSProperties}>$</i>)}</div>}
    {frame.kind === "winner" && <div className="winner-sparkles">{Array.from({ length: 30 }, (_, i) => <i key={i} style={{ "--coin": i } as CSSProperties} />)}</div>}
  </div>;
}
