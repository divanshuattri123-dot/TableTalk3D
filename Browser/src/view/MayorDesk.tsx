import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, PointerEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { getBoard, getTile } from "../engine/board";
import { formatRupees as money } from "../engine/currency";
import {
  canChallengeCityProject, CITY_CONTRACTS, CITY_POLICIES, cityLoanAvailable, cityLoanReason, cityPolicyAvailable,
  cityStable, councilSpeaker, districtName, fortPosition, LOAN_REPAYMENT, reserveLevy, WHEEL_SECTIONS
} from "../engine/mayor";
import type { CityAction, CityPolicy, WheelDecision } from "../engine/mayor";
import type { ColorGroup, GameState } from "../engine/types";
import { useViewSettings } from "../assets";
import { createScratchBurst, eraseScratchFoil, paintScratchFlakes, paintScratchFoil } from "./scratchFoil";
import type { ScratchBurst } from "./scratchFoil";
import { FORT_SPIN_MS } from "./wheelTiming";
import "./mayor.css";

const FortWheelCloseup = lazy(() => import("./FortWheelCloseup"));

const projectDetails: Record<CityPolicy, string> = {
  loans: "Players with ₹1,000 or less can use city funds on their turn to borrow ₹200 and repay ₹225.",
  transit: "One free Express ride per player while the city has funds.",
  wealth: "Once per match. A player with at least ₹2,000 and more than half the table’s shown cash pays 20% above ₹1,500, capped at ₹300.",
  credit: "The next eligible deed auction backs cash-light players with up to ₹200. The winner repays only what they borrow, plus 12.5% interest rounded up.",
  "rent-relief": "In one district, each player’s first rent is halved, with a discount of at most ₹250.",
  permits: "New construction pauses in one district for a round. Existing rent, selling and trading continue."
};
const wheelIcons = ["₹100", "₹150", "−₹50", "KEY", "GO", "✦"];
const wheelDetails = ["Collect ₹100.", "Collect ₹150.", "Pay ₹50.", "Keep a Get Out of Jail card.", "Move to GO and collect ₹200.", "Scratch to uncover your prize."];
type SendCity = (action: CityAction) => void;

function CityModal({ title, kind = "ledger", onClose, children }: { title: string; kind?: "ledger" | "wheel"; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => { if (element.open) element.close(); };
  }, []);
  return createPortal(<dialog ref={dialog} className={`city-modal city-${kind}`} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><div><p>TABLETALK3D · CITY HALL</p><h2 id={titleId}>{title}</h2></div><button type="button" className="city-close" aria-label="Close" onClick={onClose}>×</button></header>
    {children}
  </dialog>, document.body);
}

export function CityHall({ game, localId, available, open, onOpen, onClose, sendAction }: {
  game: GameState; localId: string; available: boolean; open: boolean; onOpen: () => void; onClose: () => void; sendAction: SendCity;
}) {
  const [selected, setSelected] = useState<CityPolicy>("loans");
  const [selectedDistrict, setSelectedDistrict] = useState<ColorGroup>();
  const desk = game.mayor;
  if (!desk) return null;
  const seat = desk.seats[localId];
  const local = game.players.find(player => player.id === localId);
  const mayor = game.players.find(player => player.id === desk.mayorId);
  const bills = seat?.bills.filter(bill => bill.status !== "paid") ?? [];
  const here = game.activePlayerId === localId;
  const stable = available && cityStable(game) && !!local && !local.bankrupt;
  const taxReady = available && !!local && !local.bankrupt && !game.debts?.length &&
    game.phase !== "lobby" && game.phase !== "gameOver" && game.phase !== "awaitingAuction";
  const office = localId === desk.mayorId;
  const rivals = game.players.filter(player => !player.bankrupt && player.id !== localId);
  const proposal = desk.proposal;
  const challenged = (proposal?.votes.length ?? 0) > 0;
  const voteCount = proposal?.votes.filter(id => game.players.some(p => p.id === id && !p.bankrupt)).length ?? 0;
  const seatCount = game.players.filter(player => !player.bankrupt).length;
  const localName = (id: string) => game.players.find(player => player.id === id)?.name ?? "Player";
  const speaker = councilSpeaker(game);
  const districtPolicy = selected === "rent-relief" || selected === "permits";
  const groups = desk.council ? [...new Set(getBoard(game.boardSize, game.city).flatMap(tile => tile.kind === "property" ? [tile.group] : []))] : [];
  const district = districtPolicy ? selectedDistrict ?? groups[0] : undefined;
  const competingPolicy = proposal?.kind === "loans" ? "transit" : proposal?.kind === "transit" ? "loans" : undefined;
  const canChooseContract = desk.council && seat && !seat.contract && desk.round <= 2 && local && !local.bankrupt;
  const loanAvailable = cityLoanAvailable(game, localId);
  const loanNote = cityLoanReason(game, localId);
  const hasActionDot = bills.length > 0 || Boolean(canChooseContract && here) || loanAvailable ||
    Boolean(office && here && !desk.proposalUsed && !proposal) || canChallengeCityProject(game, localId);
  const estimate = selected === "wealth" ? reserveLevy(game) : undefined;
  const journal = game.eventLog.filter(event => event.kind === "civic").slice(0, 8);

  return <>
    <button type="button" className="city-hall-trigger" onClick={onOpen} aria-haspopup="dialog" aria-expanded={open}>
      <span aria-hidden="true">♜</span> City Hall {hasActionDot && <i aria-label="City Hall choice available" />}
    </button>
    {open && <CityModal title={game.phase === "gameOver" ? "The city’s story" : "City Hall"} onClose={onClose}>
      <div className="city-modal-body">
        <div className="city-summary">
          <div><span>IN OFFICE · TERM {desk.term}</span><b>{mayor?.name ?? "Mayor"}{office ? " (you)" : ""}</b></div>
          <div><span>ROUND {desk.round} · CITY FUNDS</span><b>{money(desk.treasury)}</b></div>
        </div>
        {speaker && <p className="city-status"><b>Council Speaker · {localName(speaker)}{speaker === localId ? " (you)" : ""}</b>
          {speaker === localId && (desk.speakerUsedTerm === desk.term ? " · Challenge used this term" : " · You can call one extra vote this term")}</p>}
        {desk.policy && <p className="city-status"><b>{CITY_POLICIES[desk.policy.kind]}{desk.policy.district ? ` · ${districtName(game, desk.policy.district)}` : ""}</b>
          {desk.policy.kind === "credit" && desk.policy.used ? " · Auction backing spent this round" :
            desk.policy.kind === "wealth" ? " · Assessed when this round opened" : " · In effect this round"}</p>}
        {seat && <section aria-label="Your private bills">
          <h3>Your private bills</h3>
          {bills.length === 0 && seat.loanDue === undefined && !loanAvailable && !loanNote && <p>Nothing due.</p>}
          {bills.map((bill, idx) => <div className="city-bill" key={`${bill.round}-${idx}`}>
            <div><b>{money(bill.amount)} levy</b><small>{bill.status === "deferred" ? "Deferred · the Mayor can audit this bill" : "Open · pay now or defer for one turn"}</small></div>
            <div className="city-actions">
              <button type="button" disabled={!taxReady || local!.cash < bill.amount} onClick={() => sendAction({ type: "CITY_PAY_TAX", playerId: localId, round: bill.round })}>Pay {money(bill.amount)}</button>
              {bill.status === "open" && bill.dueTurn <= seat.turns + 2 && <button type="button" disabled={!taxReady} onClick={() => sendAction({ type: "CITY_DEFER_TAX", playerId: localId, round: bill.round })}>Defer</button>}
            </div>
          </div>)}
          {seat.loanDue !== undefined && <p>City loan due <b>{money(seat.loanAmountDue ?? LOAN_REPAYMENT)}</b>{seat.loanDue <= seat.turns + 1 ? " at the end of your upcoming turn." : " within two of your turns."}</p>}
          {loanAvailable && <div className="city-actions"><button type="button" disabled={!stable} onClick={() => sendAction({ type: "CITY_LOAN", playerId: localId, round: desk.round })}>Borrow ₹200 · repay ₹225</button></div>}
          {loanNote && <p><small>{loanNote}</small></p>}
        </section>}
        {desk.council && seat && (seat.contract || canChooseContract) && <section aria-label="Your City Contract">
          <h3>Your City Contract</h3>
          {seat.contract ? <p><b>{CITY_CONTRACTS[seat.contract]}</b> · {seat.contractPaid ? "₹150 earned" : seat.contract === "build"
            ? "Own a clear colour set with at least four building levels across it." : "Own two unmortgaged stations and take an Express ride."}</p> :
            <><p>Pick one private goal by round two. Completing it pays ₹150 once.</p>
            <div className="city-actions">
              <button type="button" disabled={!stable || !here} onClick={() => sendAction({ type: "CITY_CONTRACT", playerId: localId, contract: "build" })}>Develop a District</button>
              <button type="button" disabled={!stable || !here} onClick={() => sendAction({ type: "CITY_CONTRACT", playerId: localId, contract: "transit" })}>Connect the City</button>
            </div>
            <p><small>Develop a clear colour set or connect two stations with an Express ride.</small></p></>}
        </section>}
        {office && local && !local.bankrupt && game.phase !== "gameOver" && <section aria-label="Mayor's decisions">
          <h3>Your decisions as Mayor</h3>
          {desk.auditUsed ? <p>Your warrant has been used this term.</p> : rivals.length === 1 ? <p>In a two-player table, a deferred bill is audited automatically when your rival ends their turn if your warrant is still available.</p> :
            <><p>One warrant per term. A deferred bill comes due with a ₹25 fine. Clear records cost you ₹25 in compensation.</p>
              {desk.tip ? <p>{desk.tip.length ? `Your private tip named ${desk.tip.map(localName).join(" or ")}.` : "No deferred levies are open right now — auditing clean records costs you ₹25."}</p> :
                <div className="city-actions"><button type="button" disabled={!stable} onClick={() => sendAction({ type: "CITY_TIP", playerId: localId, term: desk.term })}>Investigate for a tip</button></div>}
              <div className="city-actions" aria-label="Choose a rival for the warrant">{rivals.map(player => <button type="button" key={player.id} disabled={!stable} onClick={() => sendAction({ type: "CITY_AUDIT", playerId: localId, term: desk.term, targetId: player.id })}>Audit {player.name}</button>)}</div>
            </>}
          {!desk.proposalUsed && !proposal && <>
            <p>Propose one project on your turn. It takes effect next round.</p>
            <div className="city-project-picker">
              <label>Project<select aria-label="City project" value={selected} onChange={event => setSelected(event.target.value as CityPolicy)}>
                {(desk.council ? Object.keys(CITY_POLICIES) as CityPolicy[] : ["loans", "transit"] as const).map(policy =>
                  <option key={policy} value={policy}>{CITY_POLICIES[policy]}</option>)}
              </select></label>
              {districtPolicy && <label>District<select aria-label="City project district" value={district} onChange={event => setSelectedDistrict(event.target.value as ColorGroup)}>
                {groups.map(group => <option key={group} value={group}>{districtName(game, group)}</option>)}
              </select></label>}
            </div>
            <p>{projectDetails[selected]}</p>
            {selected === "wealth" && <p><small>{desk.reserveLevyUsed ? "The reserve levy has already been collected in this match." : estimate
              ? `${localName(estimate.playerId)} would owe ${money(estimate.amount)} at current balances.` : "Nobody qualifies at current balances."}</small></p>}
            <div className="city-actions"><button type="button" disabled={!stable || !here || !cityPolicyAvailable(game, selected, district)}
              onClick={() => sendAction({ type: "CITY_PROPOSE", playerId: localId, term: desk.term, policy: selected, district })}>Propose {CITY_POLICIES[selected]}</button></div>
          </>}
        </section>}
        {proposal && <section aria-label="Council proposal">
          <h3>Next round · {CITY_POLICIES[proposal.kind]}</h3>
          {proposal.district && <p>{districtName(game, proposal.district)}</p>}
          <p><small>{projectDetails[proposal.kind]} Takes effect when Round {desk.round + 1} begins.</small></p>
          <p>{challenged ? `${voteCount} of ${Math.floor(seatCount / 2) + 1} votes to ${competingPolicy ? "switch" : "stop"} the project.` :
            "The vote closes when the next round starts."}</p>
          {canChallengeCityProject(game, localId) &&
            <div className="city-actions"><button type="button" disabled={!stable}
              onClick={() => sendAction({ type: "CITY_VOTE", playerId: localId, term: proposal.term })}>
              {competingPolicy ? `${challenged ? "Vote for" : "Challenge for"} ${CITY_POLICIES[competingPolicy]}` :
                challenged ? "Vote against the project" : "Challenge the project"}
            </button></div>}
        </section>}
        <section aria-label="City headlines"><h3>City headlines</h3>
          {journal.length ? <ol className="city-journal">{journal.map(event => <li key={event.id}>{event.text}</li>)}</ol> : <p>The city is watching the first deals.</p>}
        </section>
        <details><summary>How the levy works</summary><p>Whenever you collect rent, a city levy is issued immediately: 10% up to ₹200 of rent in the round (minimum ₹1), 20% from ₹200 to ₹300, and 40% above ₹300, capped at ₹200 per round.</p><p>Pay privately right away or defer for one turn. Other players’ shown cash masks early payments until they post, and deferred bills can be raided by the Mayor with a ₹25 fine.</p></details>
      </div>
    </CityModal>}
  </>;
}

export function CityTaxPrompt({ game, localId, available, hidden, sendAction }: {
  game: GameState; localId: string; available: boolean; hidden: boolean; sendAction: SendCity;
}) {
  if (hidden || !game.mayor) return null;
  const local = game.players.find(player => player.id === localId);
  const seat = game.mayor.seats[localId];
  const openBill = seat?.bills.find(bill => bill.status === "open" && bill.dueTurn <= seat.turns + 2);
  if (!local || local.bankrupt || !openBill) return null;
  const ready = available && !game.debts?.length && game.phase !== "lobby" && game.phase !== "gameOver" && game.phase !== "awaitingAuction";
  return <aside className="city-tax-prompt" role="region" aria-label="City rent tax">
    <div className="city-tax-copy">
      <small>CITY HALL RENT TAX</small>
      <b>{money(openBill.amount)} levy on rent received</b>
      <span>Pay privately now, or defer 1 turn (Mayor can audit)</span>
    </div>
    <div className="city-actions">
      <button type="button" disabled={!ready || local.cash < openBill.amount} onClick={() => sendAction({ type: "CITY_PAY_TAX", playerId: localId, round: openBill.round })}>Pay {money(openBill.amount)}</button>
      <button type="button" className="city-secondary" disabled={!ready} onClick={() => sendAction({ type: "CITY_DEFER_TAX", playerId: localId, round: openBill.round })}>Defer 1 turn</button>
    </div>
  </aside>;
}

export function CityHeadline({ game, paused }: { game: GameState; paused: boolean }) {
  const newest = game.eventLog.find(event => event.kind === "civic");
  const lastSeen = useRef(game.nextEventId - 1);
  const [visible, setVisible] = useState<typeof newest>();
  useEffect(() => {
    if (paused) { setVisible(undefined); return; }
    if (!newest || newest.id <= lastSeen.current) return;
    lastSeen.current = newest.id;
    setVisible(newest);
    const timer = window.setTimeout(() => setVisible(undefined), 3800);
    return () => window.clearTimeout(timer);
  }, [newest?.id, paused]);
  if (!visible || paused) return null;
  const labels = { raid: "CITY HALL WARRANT", office: "MAYOR TAKES OFFICE", investigation: "INVESTIGATION OPEN", policy: "CITY DESK", wheel: "FORT WHEEL", express: "EXPRESS TRAIN", auction: "AUCTION REPORT", contract: "CITY CONTRACT" };
  return <aside key={visible.id} className={`city-headline ${visible.civic === "raid" ? "raid" : ""}`} role="status">
    <span className="city-headline-seal" aria-hidden="true">{visible.civic === "raid" ? "!" : "♜"}</span>
    <div><small>{visible.civic ? labels[visible.civic] : "CITY NEWS"}</small><b>{visible.text}</b></div>
  </aside>;
}

function ScratchCard({ onReveal, disabled }: { onReveal: () => void; disabled: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const flakes = useRef<HTMLCanvasElement>(null);
  const flakeFrames = useRef(0), scratchCount = useRef(0);
  const bursts = useRef<ScratchBurst[]>([]);
  const active = useRef(false);
  const last = useRef<{ x: number; y: number } | undefined>(undefined);
  const cleared = useRef(new Set<number>());
  const done = useRef(false);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    paintScratchFoil(ctx, ctx.canvas.width, ctx.canvas.height);
    return () => cancelAnimationFrame(flakeFrames.current);
  }, []);
  function animateFlakes(now: number) {
    const ctx = flakes.current?.getContext("2d");
    bursts.current = bursts.current.filter(burst => now - burst.createdAt < 550);
    flakeFrames.current = ctx && paintScratchFlakes(ctx, bursts.current, now) ? requestAnimationFrame(animateFlakes) : 0;
  }
  function remove(event: PointerEvent<HTMLCanvasElement>) {
    const element = event.currentTarget, ctx = element.getContext("2d");
    if (!ctx || disabled || !active.current || done.current) return;
    const rect = element.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * element.width;
    const y = ((event.clientY - rect.top) / rect.height) * element.height;
    const from = last.current ?? { x, y };
    const seed = ++scratchCount.current;
    const to = { x, y };
    eraseScratchFoil(ctx, from, to, 44, seed);
    if (seed % 2 === 0 && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      bursts.current = [...bursts.current.slice(-15), createScratchBurst(from, to, performance.now(), seed)];
      if (!flakeFrames.current) flakeFrames.current = requestAnimationFrame(animateFlakes);
    }
    const segments = Math.max(1, Math.ceil(Math.hypot(x - from.x, y - from.y) / 11));
    for (let index = 0; index <= segments; index++) {
      const px = from.x + (x - from.x) * index / segments, py = from.y + (y - from.y) * index / segments;
      if (px < 0 || px >= 420 || py < 0 || py >= 155) continue;
      const cell = Math.floor(py / 25) * 14 + Math.floor(px / 30);
      cleared.current.add(cell);
    }
    last.current = { x, y };
    if (cleared.current.size >= 24) { done.current = true; onReveal(); }
  }
  return <><div className="scratch-ticket"><span aria-hidden="true">✧ LUCKY SCRATCH ✧</span><canvas ref={canvas} width={420} height={155} aria-hidden="true"
    onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); last.current = undefined; active.current = true; remove(event); }}
    onPointerMove={remove} onPointerUp={() => { active.current = false; }} onLostPointerCapture={() => { active.current = false; }} /><canvas ref={flakes} className="scratch-flakes" width={420} height={155} aria-hidden="true" /></div>
    <button type="button" className="city-secondary" disabled={disabled} onClick={onReveal}>Reveal prize</button></>;
}

export function FortWheel({ game, decision, localId, available, onClose, sendAction }: {
  game: GameState; decision: WheelDecision; localId: string; available: boolean; onClose: () => void; sendAction: SendCity;
}) {
  const spinReady = useSpinSettled(decision.section);
  const [rendered, setRendered] = useState(false);
  const wheelSound = useRatchetSound();
  const canAct = available && game.mayor?.wheel?.id === decision.id &&
    game.phase === "awaitingEndTurn" && decision.playerId === localId;
  const rolled = decision.section;
  const spinStyle = { "--wheel-rotation": `${rolled === undefined ? 0 : 1440 - rolled * 60}deg` } as CSSProperties;
  const send = (type: "CITY_SCRATCH" | "CITY_SPIN" | "CITY_SKIP_WHEEL") => {
    if (type === "CITY_SPIN") wheelSound.unlock();
    sendAction({ type, playerId: localId, wheelId: decision.id });
    if (type === "CITY_SKIP_WHEEL") onClose();
  };
  return <CityModal title={`${getTile(fortPosition(game), game.boardSize, game.city).name} wheel`} kind="wheel" onClose={onClose}>
    <div className="wheel-layout">
      <div className="wheel-machine" aria-hidden="true">
        <div className="wheel-illustration" hidden={rendered}><div className="wheel-plinth" />
          <div className="wheel-rim"><div className="wheel-disc" style={spinStyle}>
            {wheelIcons.map((label, index) => <span key={label} style={{ "--slot": `${60 * index}deg` } as CSSProperties}><b>{label}</b></span>)}
          </div><div className="wheel-pointer" /><div className="wheel-hub" /></div>
        </div>
        <Suspense fallback={null}><FortWheelCloseup section={rolled} onReady={setRendered} onTick={wheelSound.click} /></Suspense>
      </div>
      <div className="wheel-readout">
        {rolled === undefined ? <><h3>Six outcomes. One spin.</h3><p>Spin for a card effect or a chance to try Lucky Scratch.</p>
          <div className="city-actions"><button type="button" disabled={!canAct} onClick={() => send("CITY_SPIN")}>Spin the wheel</button><button type="button" disabled={!canAct} onClick={() => send("CITY_SKIP_WHEEL")}>Skip</button></div></> :
          !spinReady ? <h3 aria-live="polite">Wheel spinning…</h3> :
          <><h3 className={decision.prize ? "scratch-prize" : undefined} aria-live="polite">{decision.prize ? `${money(decision.prize)} ${decision.prize === 2000 ? "jackpot!" : "prize!"}` : WHEEL_SECTIONS[rolled]}</h3>
            {!decision.prize && <p>{wheelDetails[rolled]}</p>}
            {rolled === 5 && canAct && <ScratchCard disabled={!canAct} onReveal={() => send("CITY_SCRATCH")} />}
            {!canAct && (decision.prize !== undefined || rolled !== 5 || game.mayor?.wheel?.id !== decision.id) && <button type="button" className="city-secondary" onClick={onClose}>Back to the board</button>}
          </>}
        <details className="wheel-odds"><summary>Outcomes and odds</summary><p>Each section has a 1 in 6 chance. Lucky Scratch pays ₹100 (85%), ₹250 (12%), or ₹2,000 (3%), with a maximum of one jackpot per match. Later jackpot draws pay ₹250. Prizes are in-game cash.</p></details>
      </div>
    </div>
  </CityModal>;
}

function useSpinSettled(section?: number) {
  const [ready, setReady] = useState(section !== undefined);
  useEffect(() => {
    if (section === undefined || ready) return;
    const delay = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : FORT_SPIN_MS;
    const timer = window.setTimeout(() => setReady(true), delay);
    return () => window.clearTimeout(timer);
  }, [section, ready]);
  return ready;
}

function useRatchetSound() {
  const { settings } = useViewSettings();
  const sound = useRef<AudioContext | undefined>(undefined);
  useEffect(() => () => { if (sound.current) void sound.current.close().catch(() => {}); }, []);
  return {
    unlock() {
      if (!settings.sound || !settings.volume || typeof AudioContext === "undefined") return;
      if (!sound.current) {
        try { sound.current = new AudioContext(); } catch { return; }
      }
      void sound.current.resume().catch(() => {});
    },
    click() {
      const context = sound.current;
      if (!context || context.state !== "running" || !settings.sound || document.hidden) return;
      const time = context.currentTime;
      const tone = context.createOscillator(), amplitude = context.createGain();
      tone.type = "triangle";
      tone.frequency.setValueAtTime(480, time);
      tone.frequency.exponentialRampToValueAtTime(172, time + .034);
      amplitude.gain.setValueAtTime(Math.max(.0001, settings.volume * .17), time);
      amplitude.gain.exponentialRampToValueAtTime(.0001, time + .042);
      tone.connect(amplitude).connect(context.destination);
      tone.start(time); tone.stop(time + .043);
    }
  };
}
