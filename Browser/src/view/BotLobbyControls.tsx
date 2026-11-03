import {botStyle} from '../engine/bots';
import type {GameAction,GameState} from '../engine/types';

export default function BotLobbyControls({game,localId,sendAction}:{game:GameState;localId:string;sendAction:(action:GameAction)=>void}){
  const host=game.players[0]?.id===localId;
  return <div className="bot-lobby-controls" aria-label="AI players">
    <p>Play with friends, AI, or both. At least 2 players in total.</p>
    {host&&<button type="button" disabled={game.players.length>=6} onClick={()=>sendAction({type:'ADD_BOT',playerId:localId})}>+ Add AI player</button>}
    {game.players.filter(p=>p.bot).map(p=><div className="bot-lobby-row" key={p.id}><span>{p.name} · {botStyle(p).name}</span>{host&&<button type="button" onClick={()=>sendAction({type:'REMOVE_BOT',playerId:localId,botId:p.id})} aria-label={`Remove ${p.name}`}>Remove</button>}</div>)}
  </div>;
}
