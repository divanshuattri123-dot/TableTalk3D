import {useState} from "react";
import {getBoard, getTile} from "../engine/board";
import {formatRupees} from "../engine/currency";
import {LOAN_AMOUNT, LOAN_REPAYMENT, MAYOR_MOVE_SPACES, PERMIT_LOCK_COUNT, mayorCanGrantLoan} from "../engine/mayor";
import type {CityAction} from "../engine/mayor";
import type {GameState} from "../engine/types";

export default function MayorOffice({game, localId, available, sendAction}: {
  game: GameState; localId: string; available: boolean; sendAction: (action: CityAction) => void;
}) {
  const [selections, setSelections] = useState<string[]>(() => Array<string>(PERMIT_LOCK_COUNT).fill(""));
  const [borrower, setBorrower] = useState("");
  const [confirmMove, setConfirmMove] = useState(false);
  const desk = game.mayor!;
  const office = desk.office!;
  const inOffice = desk.mayorId === localId && game.phase !== "gameOver";
  const streets = getBoard(game.boardSize, game.city).filter(tile => tile.kind === "property");
  const eligible = game.players.filter(player => mayorCanGrantLoan(game, player.id));
  const moveUsed = office.rivalMoveTerm === desk.term;
  const canMove = available && game.activePlayerId === localId && !moveUsed;
  const terms = {playerId: localId, term: desk.term};

  return <>
    {(inOffice || office.permitPropertyIds?.length) && <section aria-label="Permit Pause">
      <h3>Permit Pause</h3>
      {office.permitPropertyIds ? <>
        <p>Building is paused on these streets until a different Mayor takes office.</p>
        <ul className="city-journal">{office.permitPropertyIds.map(id => <li key={id}>{getTile(id, game.boardSize, game.city).name}</li>)}</ul>
      </> : <>
        <p>Choose three streets. Nobody can add houses or hotels there while you hold office.</p>
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
    {inOffice && <>
      <section aria-label="Emergency Loans">
        <h3>Emergency Loans</h3>
        <p>Choose a player to receive {formatRupees(LOAN_AMOUNT)} from City Funds. They repay {formatRupees(LOAN_REPAYMENT)}.</p>
        <div className="city-project-picker">
          <label>Loan recipient<select value={borrower} disabled={!available || !eligible.length}
            onChange={event => setBorrower(event.target.value)}>
            <option value="">Choose a player</option>
            {game.players.filter(player => !player.bankrupt).map(player => <option key={player.id} value={player.id}
              disabled={!eligible.some(candidate => candidate.id === player.id)}>{player.name}{player.id === localId ? " (you)" : ""}</option>)}
          </select></label>
        </div>
        {!eligible.length && <p><small>{desk.treasury < LOAN_AMOUNT ? "City Funds needs ₹200 to issue a loan." : available ? "Every solvent player already has a city loan." : "Loans are available during a regular turn."}</small></p>}
        <div className="city-actions"><button type="button" disabled={!available || !eligible.some(player => player.id === borrower)}
          onClick={() => sendAction({type:"CITY_GRANT_LOAN",...terms,targetId:borrower})}>Give ₹200 loan</button></div>
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
