import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { GameAction, GameState } from '../engine/types';
import { makeStartAction } from '../network/startAction';
import { isPlayerColorTaken } from '../engine/playerColors';
import { PlayerPortrait } from './EventStage';
import CityPicker from './CityPicker';
import MapPicker from './MapPicker';
import {worldInfo} from '../engine/worlds';

export default function MobileLobby({game,localId,isHost,sendAction,onCopy,copied,colorPicker}: {
  game:GameState;localId:string;isHost:boolean;sendAction:(action:GameAction)=>void;onCopy:()=>void;copied:boolean;colorPicker:ReactNode;
}) {
  const [colours,setColours]=useState(false),[rules,setRules]=useState(false),[maps,setMaps]=useState(false);
  useEffect(()=>{if(isHost && game.mode===undefined)sendAction({type:'SET_MODE',playerId:localId,mode:'classic',rulesEdition:'hasbro-2025'});},[game.mode,isHost,localId,sendAction]);
  const duplicates=game.players.some(p=>isPlayerColorTaken(game.players,p.color,p.id));
  const slots=Math.min(6,Math.max(4,game.players.length+1));
  return <section className="mobile-lobby-content menu-paper" aria-label="Room lobby">
    <div className="mobile-lobby-title"><h1>Lobby</h1><p>Online with friends</p></div>
    {maps&&<MapPicker world={game.world} city={game.city} disabled={!isHost} onWorld={world=>sendAction({type:'SET_WORLD',playerId:localId,world})} onCity={city=>sendAction({type:'SET_CITY',playerId:localId,city})} onClose={()=>setMaps(false)}/>}
<div className="lobby-rules-row"><button type="button" className="lobby-world-trigger" onClick={()=>setMaps(true)}>MAP · {worldInfo(game.world).name} <span aria-hidden="true">⌄</span></button><CityPicker value={game.city} disabled={!isHost} onSelect={city=>sendAction({type:"SET_CITY",playerId:localId,city})}/><div className="lobby-rule-buttons" role="group" aria-label="Rules mode"><button type="button" disabled={!isHost} aria-pressed={game.mode==='classic'} onClick={()=>sendAction({type:'SET_MODE',playerId:localId,mode:'classic',rulesEdition:'hasbro-2025'})}>Classic · 40 spaces</button><button type="button" disabled={!isHost} aria-pressed={game.mode==='expanding'} onClick={()=>sendAction({type:'SET_MODE',playerId:localId,mode:'expanding'})}>Expanding India</button></div><button className="lobby-info" type="button" aria-label="About these rules" aria-expanded={rules} onClick={()=>setRules(!rules)}>ⓘ</button></div>
    <div className="mobile-lobby-seats" style={{'--seat-count':slots} as CSSProperties}>{Array.from({length:slots},(_,i)=>{
      const p=game.players[i];
      return p ? <article className={`mobile-lobby-seat ${p.id===localId?'is-you':''}`} key={p.id} style={{'--player-color':p.color} as CSSProperties}><h2>{p.name}</h2><PlayerPortrait player={p}/><span className="lobby-seat-ribbon" style={{background:p.color}}>{p.id===localId?'YOU':i===0?'HOST':'READY'}</span>{p.id===localId && <button type="button" className="lobby-colour-button" aria-expanded={colours} onClick={()=>setColours(!colours)}>Your colour <span aria-hidden="true">✎</span></button>}</article> : <button type="button" className="mobile-lobby-seat empty-seat" key={`empty-${i}`} onClick={onCopy} aria-label="Copy room link to invite a friend"><span aria-hidden="true">+</span><b>Invite friend</b><small>{copied?'Link copied':'Share the room code'}</small></button>;
    })}</div>
    <footer className="mobile-lobby-footer"><button type="button" className="lobby-share-code" onClick={onCopy}><small>ROOM CODE</small><b>{game.roomCode}</b><span>{copied?'Copied ✓':'Copy link'}</span></button><div>{isHost ? <button className="menu-pill lobby-start" type="button" disabled={game.players.length<2||duplicates||game.mode===undefined} onClick={()=>sendAction(makeStartAction(game,localId))}>{game.players.length<2?'WAITING FOR A FRIEND':'START GAME'} <span aria-hidden="true">›</span></button> : <p className="lobby-host-wait">Waiting for the host to start</p>}<small>{duplicates?'Choose different colours before starting.':`${game.players.length} / 6 players · ${game.boardSize} spaces`}</small></div></footer>
    {(colours||rules) && <div className="lobby-choice-backdrop" onClick={()=>{setColours(false);setRules(false);}}><section className="lobby-choice-sheet" role="dialog" aria-modal="true" aria-label={colours?'Choose your colour':'Rules summary'} onClick={e=>e.stopPropagation()}><button type="button" className="lobby-choice-close" aria-label="Close lobby choice" autoFocus onClick={()=>{setColours(false);setRules(false);}}>×</button>{colours ? <><h2>Your colour</h2>{colorPicker}<p>Every player at the table needs a different colour.</p></> : <><h2>{game.mode==='classic'?'Classic India':'Expanding India'}</h2><p>{game.mode==='classic' ? game.rulesEdition==='hasbro-2025'?'40 spaces. Shuffled 16-card decks. Owners must claim rent before the next movement roll. Received mortgages may be kept without an immediate charge.':'Traditional Classic with automatic rent and immediate mortgage-transfer interest.' : '40 spaces for 2–3 players, 48 for 4, 56 for 5 and 64 for 6. The board locks when the game starts.'}</p><p>Everyone starts with ₹1,500. Buy, auction, trade and build. Unpaid debt pauses play until it is settled. Last player standing wins.</p></>}</section></div>}
  </section>;
}
