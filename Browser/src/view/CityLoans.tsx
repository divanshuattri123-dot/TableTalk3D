import {useEffect, useState} from "react";
import {formatRupees as money} from "../engine/currency";
import {classicSpendableCash} from "../engine/classic";
import {usesClassicRules} from "../engine/rules";
import {cityLoanBalance} from "../engine/mayor";
import type {CityAction} from "../engine/mayor";
import type {GameState} from "../engine/types";

export function cityLoanDeadline(turns: number) {
  return turns <= 1 ? "Due at the end of your next turn." : `Due in ${turns} of your turns.`;
}

export function CityLoanAccount({game, localId, available, sendAction}: {
  game: GameState; localId: string; available: boolean; sendAction: (action: CityAction) => void;
}) {
  const [amount, setAmount] = useState("");
  const account = game.mayor?.seats[localId];
  const balance = cityLoanBalance(game, localId);
  useEffect(() => setAmount(""), [balance]);
  const classic = usesClassicRules(game);
  const cash = classic ? classicSpendableCash(game, localId) : game.players.find(player => player.id === localId)?.cash ?? 0;
  const step = classic ? .01 : 1;
  const max = Math.max(0, Math.min(balance, cash));
  const payment = amount ? Number(amount) : max;
  const valid = classic ? Math.round(payment * 100) / 100 === payment : Number.isSafeInteger(payment);
  if (!account || !balance) return null;
  const turns = (account.loanDue ?? 0) - account.turns;
  return <div className="city-loan-account">
    <p><b>{money(balance)} city loan outstanding</b>. {account.loanStatus === "seized"
      ? "Rent goes toward the loan. Repay to release your unsold deeds."
      : account.loanStatus === "notice" ? "Warning. Pay by the end of your next turn to avoid seizure."
      : cityLoanDeadline(turns)}</p>
    <div className="city-project-picker">
      <label>Repayment amount<input type="number" inputMode={classic ? "decimal" : "numeric"} min={step} max={max} step={step}
        placeholder={String(max)} value={amount} onChange={event => setAmount(event.target.value)} /></label>
    </div>
    <div className="city-actions">
      <button type="button" disabled={!available || !valid || payment < step || payment > max}
        onClick={() => sendAction({type:"CITY_REPAY_LOAN",playerId:localId,amount:payment})}>Repay {money(Math.max(0, payment || 0))}</button>
    </div>
  </div>;
}
