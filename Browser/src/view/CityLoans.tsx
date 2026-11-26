import {useEffect, useState} from "react";
import {formatRupees as money} from "../engine/currency";
import {cityLoanBalance} from "../engine/mayor";
import type {CityAction} from "../engine/mayor";
import type {GameState} from "../engine/types";

export function CityLoanAccount({game, localId, available, sendAction}: {
  game: GameState; localId: string; available: boolean; sendAction: (action: CityAction) => void;
}) {
  const [amount, setAmount] = useState("");
  const account = game.mayor?.seats[localId];
  const balance = cityLoanBalance(game, localId);
  useEffect(() => setAmount(""), [balance]);
  const cash = game.players.find(player => player.id === localId)?.cash ?? 0;
  const max = Math.max(0, Math.min(balance, cash));
  const payment = amount ? Number(amount) : max;
  if (!account || !balance) return null;
  const turns = (account.loanDue ?? 0) - account.turns;
  return <div className="city-loan-account">
    <p><b>{money(balance)} city loan outstanding</b>. {account.loanStatus === "seized"
      ? "Rent goes toward the loan. Repay to release your unsold deeds."
      : account.loanStatus === "notice" ? "Warning. Pay by the end of your next turn to avoid seizure."
      : turns <= 1 ? "Due at the end of your next turn." : "Due at the end of your second turn with the loan."}</p>
    <div className="city-project-picker">
      <label>Repayment amount<input type="number" inputMode="numeric" min="1" max={max} step="1"
        placeholder={String(max)} value={amount} onChange={event => setAmount(event.target.value)} /></label>
    </div>
    <div className="city-actions">
      <button type="button" disabled={!available || !Number.isSafeInteger(payment) || payment < 1 || payment > max}
        onClick={() => sendAction({type:"CITY_REPAY_LOAN",playerId:localId,amount:payment})}>Repay {money(Math.max(0, payment || 0))}</button>
    </div>
  </div>;
}
