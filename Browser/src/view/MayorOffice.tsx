import {useState} from "react";
import {getBoard, getTile} from "../engine/board";
import {formatRupees} from "../engine/currency";
import {LOAN_AMOUNT, MAYOR_MOVE_SPACES, PERMIT_LOCK_COUNT, cityLoanTotal, citySeizedOwner, mayorCanGrantLoan, mayorCanReleaseJail} from "../engine/mayor";
import type {CityAction} from "../engine/mayor";
import type {GameState} from "../engine/types";

export default function MayorOffice({game, localId, available, jailAvailable, sendAction}: {
  game: GameState; localId: string; available: boolean; jailAvailable: boolean; sendAction: (action: CityAction) => void;
}) {
  const [selections, setSelections] = useState<string[]>(() => Array<string>(PERMIT_LOCK_COUNT).fill(""));
  const [borrower, setBorrower] = useState("");
  const [amount, setAmount] = useState(String(LOAN_AMOUNT));
  const [auctionDeed, setAuctionDeed] = useState("");
  const [confirmMove, setConfirmMove] = useState(false);
  const desk = game.mayor!;
  const office = desk.office!;
  const inOffice = desk.mayorId === localId && game.phase !== "gameOver";
  const board = getBoard(game.boardSize, game.city);
  const streets = board.filter(tile => tile.kind === "property");
  const seized = board.filter(tile => citySeizedOwner(game, tile.position));
  const jailed = game.players.filter(player => !player.bankrupt && player.inJail);
  const principal = Number(amount);
  const eligible = game.players.filter(player => mayorCanGrantLoan(game, player.id, 1));
  const moveUsed = office.rivalMoveTerm === desk.term;
  const canMove = available && game.activePlayerId === localId && !moveUsed;
  const terms = {playerId: localId, term: desk.term};

  return <>
    {(inOffice || office.permitPropertyIds?.length) && <section aria-label="Permit Pause">
      <h3>Permit Pause</h3>
      {office.permitPropertyIds ? <>
        <p>The streets marked purple on the board are paused until a different Mayor takes office.</p>
        <ul className="city-journal">{office.permitPropertyIds.map(id => <li key={id}>{getTile(id, game.boardSize, game.city).name}</li>)}</ul>
      </> : <>
        <p>Choose three streets to mark purple. Nobody can add houses or hotels there while you hold office.</p>
        <div className="city-project-picker">{selections.map((value, index) =>
          <label key={index}>Street {index + 1}
            <select disabled={!available} value={value}
              onChange={event => setSelections(current => current.map((item, i) => i === index ? event.target.value : item))}>
              <option value="">Choose a street</option>
              {streets.map(tile => <option key={tile.position} value={tile.position}
                disabled={String(tile.position) !== value && selections.includes(String(tile.position))}>{tile.name}</option>)}
            </select>
          </label>
        )}</div>
        <div className="city-actions"><button type="button" disabled={!available || selections.some(value => !value)}
          onClick={() => sendAction({type:"CITY_LOCK_PERMITS",...terms,propertyIds:selections.map(Number)})}>Pause permits on three streets</button></div>
      </>}
    </section>}
    {seized.length > 0 && <section aria-label="Seized deeds">
      <h3>Seized deeds</h3>
      <p>Rent pays down each owner’s city loan. Unsold deeds are released when the balance reaches zero.</p>
      {inOffice ? <>
        <div className="city-project-picker">
          <label>Deed to auction<select value={auctionDeed} onChange={event => setAuctionDeed(event.target.value)}>
            <option value="">Choose a seized deed</option>
            {seized.map(tile => <option key={tile.position} value={tile.position}>{tile.name}</option>)}
          </select></label>
        </div>
        <div className="city-actions"><button type="button" disabled={!available || !seized.some(tile => tile.position === Number(auctionDeed))}
          onClick={() => sendAction({type:"CITY_AUCTION_SEIZED",...terms,propertyId:Number(auctionDeed)})}>Auction seized deed</button></div>
      </> : <ul className="city-journal">{seized.map(tile => <li key={tile.position}>{tile.name}</li>)}</ul>}
    </section>}
    {inOffice && <>
      <section aria-label="Emergency Loans">
        <h3>Emergency Loans</h3>
        <p>Choose any whole-rupee amount from City Funds. Repayment is due after two turns at 12.5% interest, rounded up.</p>
        <div className="city-project-picker">
          <label>Loan recipient<select value={borrower} disabled={!available || !eligible.length}
            onChange={event => setBorrower(event.target.value)}>
            <option value="">Choose a player</option>
            {game.players.filter(player => !player.bankrupt).map(player => <option key={player.id} value={player.id}
              disabled={!eligible.some(candidate => candidate.id === player.id)}>{player.name}{player.id === localId ? " (you)" : ""}</option>)}
          </select></label>
          <label>Loan amount<input type="number" inputMode="numeric" min="1" max={desk.treasury} step="1" value={amount}
            onChange={event => setAmount(event.target.value)} /></label>
        </div>
        <p><small>{Number.isSafeInteger(principal) && principal > 0 && principal <= desk.treasury
          ? `Repayment ${formatRupees(cityLoanTotal(principal))}` : `Available in City Funds ${formatRupees(desk.treasury)}`}</small></p>
        <div className="city-actions"><button type="button" disabled={!available || !mayorCanGrantLoan(game, borrower, principal)}
          onClick={() => sendAction({type:"CITY_GRANT_LOAN",...terms,targetId:borrower,amount:principal})}>Issue city loan</button></div>
      </section>
      <section aria-label="Jail release">
        <h3>Jail release</h3>
        <p>Release a jailed player without the ₹50 fine.</p>
        {jailed.length ? <div className="city-actions">{jailed.map(player =>
          <button type="button" key={player.id} disabled={!jailAvailable || !mayorCanReleaseJail(game, player.id)}
            onClick={() => sendAction({type:"CITY_RELEASE_JAIL",...terms,targetId:player.id})}>Release {player.name}{player.id === localId ? " (you)" : ""}</button>
        )}</div> : <p><small>Nobody is in Jail.</small></p>}
      </section>
      <section aria-label="Five-space move">
        <h3>Move rivals {MAYOR_MOVE_SPACES} spaces</h3>
        <p>Once per term on your turn. Rivals can pass GO or leave Jail. Their new spaces do not trigger purchases, rent or cards.</p>
        {moveUsed ? <p><small>Used this term.</small></p> : confirmMove ? <div className="city-actions">
          <button type="button" disabled={!canMove} onClick={() => sendAction({type:"CITY_MOVE_RIVALS",...terms})}>Confirm five-space move</button>
          <button type="button" className="city-secondary" onClick={() => setConfirmMove(false)}>Cancel</button>
        </div> : <div className="city-actions"><button type="button" disabled={!canMove} onClick={() => setConfirmMove(true)}>
          Move every rival five spaces
        </button></div>}
      </section>
    </>}
  </>;
}
