import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, PointerEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { getBoard, getTile } from "../engine/board";
import { formatRupees as money } from "../engine/currency";
import {
  canChallengeCityProject, CITY_CONTRACTS, CITY_POLICIES, cityLoanAvailable, cityLoanReason, cityPolicyAvailable,
  cityStable, councilSpeaker, councilVoteThreshold, districtName, DUEL_VETO_COST, fortPosition, LOAN_REPAYMENT,
  cityLoanBalance, MAX_AUDITS_PER_TERM, OFFICE_PROJECTS, mayorAuditsLeft, nextAuditFine, nextAuditMiss, reserveLevy, WHEEL_SECTIONS
} from "../engine/mayor";
import type { CityAction, CityPolicy, WheelDecision } from "../engine/mayor";
import type { ColorGroup, GameState } from "../engine/types";
import { useViewSettings } from "../assets";
import { createScratchBurst, eraseScratchFoil, paintScratchFlakes, paintScratchFoil } from "./scratchFoil";
import type { ScratchBurst } from "./scratchFoil";
import { FORT_SPIN_MS } from "./wheelTiming";
import MayorOffice from "./MayorOffice";
import { CityLoanAccount } from "./CityLoans";
import "./mayor.css";

const FortWheelCloseup = lazy(() => import("./FortWheelCloseup"));

const projectDetails: Record<CityPolicy, string> = {
  loans: "Instant: Players with ₹1,000 or less (and the Mayor at any cash) can borrow ₹200 from City Funds on their turn and repay ₹225.",
  transit: "Instant: One free Express ride per player while City Funds has ₹75 (Mayors always ride Express free).",
  wealth: "Collects 20% above ₹1,500 (capped at ₹300) right now from a player holding ≥ ₹2,000 and over half the table’s cash.",
  credit: "Instant: The next eligible deed auction backs cash-light bidders (≤ ₹400) with up to ₹200 at 12.5% interest.",
  "rent-relief": "Instant: Turns one district BLUE right now and cuts all rent there by 50% (up to ₹250 off per landing).",
  permits: "Instant: Freezes rival construction in one district while the Mayor remains free to build."
};
const wheelIcons = ["₹100", "₹150", "−₹50", "KEY", "GO", "✦"];
const wheelDetails = ["Collect ₹100.", "Collect ₹150.", "Pay ₹50.", "Keep a Get Out of Jail card.", "Move to GO and collect ₹200.", "Scratch to uncover your prize."];
type SendCity = (action: CityAction) => boolean | void;

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
  const [selected, setSelected] = useState<CityPolicy>(() => game.mayor?.office ? "wealth" : "loans");
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
  const auditsLeft = desk.office ? Infinity : mayorAuditsLeft(desk);
  const myNextFine = nextAuditFine(seat);
  const nextMissFine = desk.higherTax ? nextAuditMiss(seat).fine : 25;
  const threshold = councilVoteThreshold(game);
  const isDuel = seatCount === 2;
  const canVote = canChallengeCityProject(game, localId);
  const hasActionDot = bills.length > 0 || Boolean(canChooseContract && here) || loanAvailable ||
    Boolean(office && (desk.office || !desk.proposalUsed || auditsLeft > 0)) || canVote;
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
        <p className="city-status"><b>Mayor Perks · {mayor?.name ?? "Mayor"}</b> · +₹100 stipend · 0% rent tax · {desk.office ? "₹75 Express · Repeatable audits" : "Free Express · " + MAX_AUDITS_PER_TERM + " warrants"} · Instant decrees</p>
        {speaker && <p className="city-status"><b>Council Speaker · {localName(speaker)}{speaker === localId ? " (you)" : ""}</b>
          {proposal ? ` · Live vote open (${voteCount}/${threshold})` : " · Leads Council Vote whenever the Mayor enacts a decree"}</p>}
        {desk.policy && <p className={`city-status${desk.policy.kind === "rent-relief" ? " city-status-blue" : ""}`}><b>{CITY_POLICIES[desk.policy.kind]}{desk.policy.district ? ` · ${districtName(game, desk.policy.district)}` : ""}</b>
          {desk.policy.kind === "credit" && desk.policy.used ? " · Auction backing spent" :
            desk.policy.kind === "wealth" ? " · Collected instantly" :
            desk.policy.kind === "rent-relief" ? " · Active NOW (district tiles turned blue · 50% off rent)" : " · Active NOW"}</p>}
        {seat && <section aria-label="Your private bills">
          <h3>Your private bills</h3>
          {bills.length === 0 && seat.loanDue === undefined && !loanAvailable && !loanNote && <p>Nothing due.{seat.caughtCount ? ` Past audit catches: ${seat.caughtCount} (next fine if caught: ${money(myNextFine)}).` : ""}</p>}
          {(() => {
            const openBills = bills.filter(b => b.status === "open");
            const deferredBills = bills.filter(b => b.status === "deferred");
            const deferredTotal = deferredBills.reduce((s, b) => s + b.amount, 0);
            return <>
              {openBills.map((bill, idx) => <div className="city-bill" key={`open-${bill.round}-${bill.id ?? idx}`}>
                <div><b>{money(bill.amount)} levy (Round {bill.round})</b><small>Open · pay now or defer (never auto-pays unless caught by Mayor)</small></div>
                <div className="city-actions">
                  <button type="button" disabled={!taxReady || local!.cash < bill.amount} onClick={() => sendAction({ type: "CITY_PAY_TAX", playerId: localId, round: bill.round, billId: bill.id ?? null })}>Pay {money(bill.amount)}</button>
                  <button type="button" disabled={!taxReady} onClick={() => sendAction({ type: "CITY_DEFER_TAX", playerId: localId, round: bill.round, billId: bill.id ?? null })}>Defer</button>
                </div>
              </div>)}
              {deferredBills.length === 1 && <div className="city-bill">
                <div><b>{money(deferredBills[0]!.amount)} deferred levy (Round {deferredBills[0]!.round})</b><small>Deferred · never auto-pays! Pay yourself or risk {money(myNextFine)} fine if Mayor audits you</small></div>
                <div className="city-actions">
                  <button type="button" disabled={!taxReady || local!.cash < deferredBills[0]!.amount} onClick={() => sendAction({ type: "CITY_PAY_TAX", playerId: localId, round: deferredBills[0]!.round, billId: deferredBills[0]!.id ?? null })}>Pay {money(deferredBills[0]!.amount)}</button>
                </div>
              </div>}
              {deferredBills.length > 1 && <div className="city-bill">
                <div><b>{money(deferredTotal)} total deferred tax ({deferredBills.length} bills)</b><small>Deferred · never auto-pays! Pay yourself or risk {money(myNextFine)} fine if Mayor audits you</small></div>
                <div className="city-actions">
                  <button type="button" disabled={!taxReady || local!.cash < deferredTotal} onClick={() => sendAction({ type: "CITY_PAY_TAX", playerId: localId, round: desk.round, billId: -1 })}>Pay all {money(deferredTotal)}</button>
                </div>
              </div>}
            </>;
          })()}
          {desk.office && <CityLoanAccount game={game} localId={localId} available={stable} sendAction={sendAction} />}
          {!desk.office && seat.loanDue !== undefined && <p>City loan due <b>{money(seat.loanAmountDue ?? LOAN_REPAYMENT)}</b>{seat.loanDue <= seat.turns + 1 ? " at the end of your upcoming turn." : " within two of your turns."}</p>}
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
        {desk.office && <MayorOffice key={desk.term} game={game} localId={localId} available={stable} jailAvailable={available} sendAction={sendAction} />}
        {office && local && !local.bankrupt && game.phase !== "gameOver" && <section aria-label="Mayor's decisions">
          <h3>Your decisions as Mayor</h3>
          {auditsLeft <= 0 ? <p>Both audit warrants have been used this term.</p> :
            <><p><b>{desk.office ? "You can audit repeatedly." : auditsLeft + " of " + MAX_AUDITS_PER_TERM + " warrants left this term."}</b> Deferred tax is only paid if they pay voluntarily or you catch them! Fines double every catch (₹25 → ₹50 → ₹100…) across the whole match, plus you earn a ₹25 raid bonus. Clear records cost you {money(nextMissFine)} on your next missed audit.</p>
              {desk.higherTax && <p>Missed audits cost ₹25, then ₹50, ₹100 and double every time after that. Your missed audits carry over when you become Mayor again. Open bills can also be caught once overdue.</p>}
              {desk.tip ? <p>{desk.tip.length ? `Intelligence tip: unpaid deferred tax spotted on ${desk.tip.map(localName).join(" or ")}.` : "No audit-eligible levies were found."}</p> :
                <div className="city-actions"><button type="button" disabled={!stable || !!desk.office?.investigationUsed} onClick={() => sendAction({ type: "CITY_TIP", playerId: localId, term: desk.term })}>Investigate for a tip</button></div>}
              <div className="city-actions" aria-label="Choose a rival for the warrant">{rivals.map(player => <button type="button" key={player.id} disabled={!stable} onClick={() => sendAction({ type: "CITY_AUDIT", playerId: localId, term: desk.term, targetId: player.id })}>Audit {player.name} ({money(nextAuditFine(desk.seats[player.id]))} fine)</button>)}</div>
            </>}
          {(desk.office || !desk.proposalUsed) ? <>
            <p><b>Instant Executive Decree:</b> Enact a decree during your term — it works <b>immediately</b>!</p>
            <div className="city-project-picker">
              <label>Project<select aria-label="City project" value={selected} onChange={event => setSelected(event.target.value as CityPolicy)}>
                {(desk.office ? OFFICE_PROJECTS : desk.council ? Object.keys(CITY_POLICIES) as CityPolicy[] : ["loans", "transit"] as const).map(policy =>
                  <option key={policy} value={policy}>{CITY_POLICIES[policy]}</option>)}
              </select></label>
              {districtPolicy && <label>District<select aria-label="City project district" value={district} onChange={event => setSelectedDistrict(event.target.value as ColorGroup)}>
                {groups.map(group => <option key={group} value={group}>{districtName(game, group)}</option>)}
              </select></label>}
            </div>
            <p>{projectDetails[selected]}</p>
            {selected === "wealth" && <p><small>{!desk.office && desk.reserveLevyUsed ? "The reserve levy has already been collected in this match." : estimate
              ? `${localName(estimate.playerId)} owes ${money(estimate.amount)} immediately right now!` : "Nobody qualifies at current balances."}</small></p>}
            <div className="city-actions"><button type="button" disabled={!stable || !cityPolicyAvailable(game, selected, district)}
              onClick={() => sendAction({ type: "CITY_PROPOSE", playerId: localId, term: desk.term, policy: selected, district })}>Enact {CITY_POLICIES[selected]} Now</button></div>
          </> : <p>Executive decree used for Term {desk.term}.</p>}
        </section>}
        <section aria-label="Council proposal">
          <h3>{proposal ? `Council Vote · ${CITY_POLICIES[proposal.kind]}` : "Council Chamber & Voting"}</h3>
          {proposal ? <>
            {proposal.district && <p>{districtName(game, proposal.district)}</p>}
            <p><small>{projectDetails[proposal.kind]}</small></p>
            <p>{isDuel
              ? `1v1 Council Veto: rival can pay ${money(DUEL_VETO_COST)} into City Funds to ${competingPolicy ? `switch to ${CITY_POLICIES[competingPolicy]}` : "repeal this decree"} immediately.`
              : `${voteCount} of ${threshold} votes cast to ${competingPolicy ? `switch to ${CITY_POLICIES[competingPolicy]}` : "repeal this decree"} immediately.`}</p>
            {proposal.sponsorId === localId ? <p><small>You enacted this decree as Mayor. Other players may vote here.</small></p> :
              proposal.votes.includes(localId) ? <p><small>Your vote is recorded ({voteCount}/{threshold}).</small></p> :
              <div className="city-actions"><button type="button" disabled={!stable || !canVote}
                onClick={() => sendAction({ type: "CITY_VOTE", playerId: localId, term: proposal.term, proposalId: proposal.id })}>
                {isDuel
                  ? `${competingPolicy ? `Veto & Switch to ${CITY_POLICIES[competingPolicy]}` : `Veto ${CITY_POLICIES[proposal.kind]}`} (${money(DUEL_VETO_COST)})`
                  : competingPolicy ? `Vote for ${CITY_POLICIES[competingPolicy]} (${voteCount}/${threshold})` :
                    `Vote to Repeal ${CITY_POLICIES[proposal.kind]} (${voteCount}/${threshold})`}
              </button></div>}
          </> : <p>No decree vote is active right now. As soon as the Mayor enacts a decree, a live Council Vote opens here and on your screen.</p>}
        </section>
        <section aria-label="City headlines"><h3>City headlines</h3>
          {journal.length ? <ol className="city-journal">{journal.map(event => <li key={event.id}>{event.text}</li>)}</ol> : <p>The city is watching the first deals.</p>}
        </section>
        <details><summary>How Mayor Mode & Levies work</summary><p>Classic 40 with City Hall. Whenever a non-Mayor collects rent, a city levy is issued immediately ({desk.higherTax ? "50% on the first ₹100, 60% on the next ₹100, and 70% above ₹200" : "10% up to ₹200, 20% from ₹200–₹300, 40% above ₹300, up to ₹200 per round"}).</p><p>Deferred levies never pay automatically — you only pay if you choose to pay yourself or if the Mayor catches you with an Audit Warrant! Audit fines start at ₹25 and double every time you are caught (₹25 → ₹50 → ₹100 → ₹200…) across the entire match, even when the Mayor changes.</p></details>
      </div>
    </CityModal>}
  </>;
}

export function CityVotePrompt({ game, localId, available, hidden, sendAction }: {
  game: GameState; localId: string; available: boolean; hidden: boolean; sendAction: SendCity;
}) {
  const proposal = game.mayor?.proposal;
  const voteKey = proposal?.id !== undefined ? String(proposal.id) : proposal ? `${proposal.term}-${proposal.kind}-${proposal.district ?? ""}` : "";
  const [dismissedKey, setDismissedKey] = useState("");
  if (hidden || !game.mayor || !proposal || dismissedKey === voteKey || !canChallengeCityProject(game, localId)) return null;
  const ready = available && !game.debts?.length && game.phase !== "lobby" && game.phase !== "gameOver" && game.phase !== "awaitingAuction";
  const seatCount = game.players.filter(p => !p.bankrupt).length;
  const isDuel = seatCount === 2;
  const threshold = councilVoteThreshold(game);
  const voteCount = proposal.votes.filter(id => game.players.some(p => p.id === id && !p.bankrupt)).length;
  const competing = proposal.kind === "loans" ? "transit" : proposal.kind === "transit" ? "loans" : undefined;
  return <aside className="city-tax-prompt city-vote-prompt" role="region" aria-label="Council decree vote">
    <div className="city-tax-copy">
      <small>COUNCIL VOTE · MAYOR DECREE ACTIVE</small>
      <b>{CITY_POLICIES[proposal.kind]}{proposal.district ? ` · ${districtName(game, proposal.district)}` : ""}</b>
      <span>{isDuel ? `Pay ${money(DUEL_VETO_COST)} to City Funds to override immediately, or keep` : `${voteCount}/${threshold} votes to ${competing ? `switch to ${CITY_POLICIES[competing]}` : "repeal immediately"}`}</span>
    </div>
    <div className="city-actions">
      <button type="button" disabled={!ready} onClick={() => sendAction({ type: "CITY_VOTE", playerId: localId, term: proposal.term, proposalId: proposal.id })}>
        {isDuel ? `Veto (${money(DUEL_VETO_COST)})` : competing ? `Vote ${CITY_POLICIES[competing]}` : "Vote to Repeal"}
      </button>
      <button type="button" className="city-secondary" onClick={() => setDismissedKey(voteKey)}>Keep</button>
    </div>
  </aside>;
}

export function CityTaxPrompt({ game, localId, available, hidden, openCityHall, sendAction }: {
  game: GameState; localId: string; available: boolean; hidden: boolean; openCityHall: () => void; sendAction: SendCity;
}) {
  if (hidden || !game.mayor) return null;
  const local = game.players.find(player => player.id === localId);
  const seat = game.mayor.seats[localId];
  const openBill = seat?.bills.find(bill => bill.status === "open");
  if (seat?.loanStatus) return <aside className="city-tax-prompt city-loan-notice" role="region" aria-label="City loan notice">
    <div className="city-tax-copy"><small>{seat.loanStatus === "seized" ? "CITY SEIZURE" : "LOAN WARNING"}</small>
      <b>{money(cityLoanBalance(game, localId))} city loan outstanding</b>
      <span>{seat.loanStatus === "seized" ? "Rent repays your loan. Seized deeds can be auctioned." : "Pay by the end of your next turn to keep your deeds."}</span>
    </div>
    <div className="city-actions"><button type="button" onClick={openCityHall}>View city loan</button></div>
  </aside>;
  if (!local || local.bankrupt || !openBill) return null;
  const ready = available && !game.debts?.length && game.phase !== "lobby" && game.phase !== "gameOver" && game.phase !== "awaitingAuction";
  const fine = nextAuditFine(seat);
  return <aside className="city-tax-prompt" role="region" aria-label="City rent tax">
    <div className="city-tax-copy">
      <small>CITY HALL RENT TAX</small>
      <b>{money(openBill.amount)} levy on rent received</b>
      <span>Pay now, or defer (never auto-pays · {money(fine)} fine if Mayor audits you)</span>
    </div>
    <div className="city-actions">
      <button type="button" disabled={!ready || local.cash < openBill.amount} onClick={() => sendAction({ type: "CITY_PAY_TAX", playerId: localId, round: openBill.round, billId: openBill.id ?? null })}>Pay {money(openBill.amount)}</button>
      <button type="button" className="city-secondary" disabled={!ready} onClick={() => sendAction({ type: "CITY_DEFER_TAX", playerId: localId, round: openBill.round, billId: openBill.id ?? null })}>Defer tax</button>
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

function ScratchCard({ onReveal, disabled }: { onReveal: () => boolean | void; disabled: boolean }) {
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
    if (cleared.current.size >= 24 && onReveal() !== false) { done.current = true; }
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
    const accepted = sendAction({ type, playerId: localId, wheelId: decision.id }) !== false;
    if (accepted && type === "CITY_SKIP_WHEEL") onClose();
    return accepted;
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
