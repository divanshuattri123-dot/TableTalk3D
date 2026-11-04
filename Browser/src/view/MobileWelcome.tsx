import { useEffect, useRef, useState } from 'react';
import {flushSync} from 'react-dom';
import type { CSSProperties, ReactNode } from 'react';
import { enterGameFullscreen } from './fullscreen';
import {usePublisher} from '../publisher/PublisherShell';
import {owns} from '../publisher/catalog';
import {storeCandidate} from '../publisher/release';

type Page = 'home' | 'rooms' | 'create' | 'join' | 'profile';
export function MenuDice({ value = 5 }: { value?: number }) {
  const dots = value === 3 ? [[24,24],[50,50],[76,76]] : [[24,24],[76,24],[50,50],[24,76],[76,76]];
  return <svg viewBox="0 0 100 100" aria-hidden="true"><rect x="3" y="3" width="94" height="94" rx="20" fill="#f9faf8" stroke="#b5bdc5" strokeWidth="4"/>{dots.map(([x,y])=><circle key={`${x}-${y}`} cx={x} cy={y} r="9" fill="#263440"/>)}</svg>;
}
export function MenuGlyph({ kind }: { kind: 'create' | 'join' }) {
  return <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind === 'create' ? <><path d="M13 45 50 15l37 30M24 39v43h52V39M41 82V57h19v25"/><path d="M75 14v21M65 24h21"/></> : <><circle cx="36" cy="32" r="14"/><path d="M10 83V71c0-25 52-25 52 0v12M68 21a14 14 0 0 1 0 28M76 58c14 2 18 9 18 23M70 70h22"/></>}</svg>;
}

export default function MobileWelcome({ name, color, roomCode, onName, onRoomCode, colorPicker, joinReady, roomStatus, error, onCreate, onJoin, onMenu, onMaps, onSaveProfile, resumeCode, onResume }: {
  name: string; color: string; roomCode: string; onName: (name: string) => void; onRoomCode: (code: string) => void;
  colorPicker: ReactNode; joinReady: boolean; roomStatus?: ReactNode; error?: ReactNode;
  onCreate: () => void; onJoin: () => void; onMenu: () => void; onSaveProfile: () => void;
  onMaps:()=>void;
  resumeCode?:string;onResume?:()=>void;
}) {
  const publisher=usePublisher();
  const [page,setPage] = useState<Page>(()=>roomCode ? 'join' : 'home');
  const heading = useRef<HTMLHeadingElement>(null);
  const initial = useRef(true);
  const transition=useRef<ViewTransition|undefined>(undefined);
  const navigate=(next:Page)=>{
    transition.current?.skipTransition();
    if(document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      transition.current=document.startViewTransition(()=>flushSync(()=>setPage(next)));
      void transition.current.ready.catch(()=>{});
    } else setPage(next);
  };
  const back = () => navigate(page === 'create' || page === 'join' ? 'rooms' : 'home');
  useEffect(()=>{
    if (initial.current) { initial.current=false; return; }
    heading.current?.focus({preventScroll:true});
  },[page]);
  const title = page === 'rooms' ? 'Play with friends' : page === 'create' ? 'Create a room' : page === 'join' ? 'Join your friends' : 'Your player';
  const submit = () => {
    if (!name.trim()) return;
    onSaveProfile();
    if (page === 'profile') navigate('home');
    else if (page === 'create') onCreate();
    else if (page === 'join' && joinReady) onJoin();
  };
  return <main className={`mobile-front menu-paper menu-page-${page}`}>
    <header className={`mobile-front-header ${page === 'home' ? '' : 'menu-red-header'}`}>
      {page === 'home' ? <div className="menu-brand" aria-label="Table Talk 3D"><span>TABLE TALK</span><small>CITY EDITIONS</small></div> : <><button className="menu-round-back" type="button" aria-label="Go back" onClick={back}>‹</button><div><h1 ref={heading} tabIndex={-1}>{title}</h1><p>Online with friends · 2–6 players</p></div></>}
      <div className="menu-header-tools">{page === 'home' && <button className="menu-profile" type="button" aria-label="Edit your player" onClick={()=>navigate('profile')}><i style={{background:color}}/>{name || 'Your player'}<span aria-hidden="true">✎</span></button>}<button className="menu-options" type="button" aria-label="Open game menu" aria-haspopup="dialog" onClick={onMenu}><span aria-hidden="true">☰</span> Settings</button></div>
    </header>
    {page === 'home' ? <section className="mobile-home-panels" aria-label="Main menu">
      <button className="menu-play-panel menu-tile" type="button" aria-label="Play with friends" onClick={()=>{void enterGameFullscreen();navigate('rooms');}}>
        <div className="play-panel-copy"><span>THE CITY IS YOURS</span><h1 ref={heading} tabIndex={-1}>Buy. Build.<br/>Make a deal.</h1><p>Your people. Your next game night.</p></div>
        <img className="menu-car-art" src={`${import.meta.env.BASE_URL}art/menu-car.webp`} alt="" fetchPriority="high"/>
        <span className="menu-pill menu-play-pill"><span aria-hidden="true">▶</span> PLAY</span>
        <span className="menu-dice-art"><MenuDice/><MenuDice value={3}/></span>
      </button>
      <div className="menu-side-panels"><button className="menu-join-panel menu-tile" type="button" aria-label="Join a room" onClick={()=>navigate('join')}>
        <span className="menu-panel-kicker">ALREADY HAVE A CODE?</span><MenuGlyph kind="join"/><div className="menu-code-art" aria-hidden="true">{['A','B','C','D'].map(c=><span key={c}>{c}</span>)}</div><span className="menu-pill">JOIN ROOM <span aria-hidden="true">›</span></span><small>Four letters. One table.</small>
      </button>
      <button className="menu-maps-panel menu-tile" type="button" aria-label="Choose maps" onClick={onMaps}><span aria-hidden="true">◇</span><b>MAPS</b><small>11 worlds · 6 city editions</small></button>
      <button className="menu-store-panel menu-tile" type="button" aria-label="Open store" onClick={publisher.openStore}><span className="menu-panel-kicker">MAKE THE TABLE YOURS</span><svg viewBox="0 0 100 80" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true"><path d="m12 23 20-15h36l20 15-38 48L12 23Zm0 0h76M32 8l-9 15 27 48 27-48-9-15M50 8v63"/></svg><span className="menu-pill">STORE <span aria-hidden="true">›</span></span><small>{storeCandidate ? "Purchases unavailable" : "Skins & Remove Ads"}</small></button>
      <button className="menu-settings-panel menu-tile" type="button" aria-label="Open settings" onClick={onMenu}><span aria-hidden="true">⚙</span><b>SETTINGS</b><small>Graphics · sound · pieces</small></button></div>
    </section> : page === 'rooms' ? <section className="mobile-room-choices" aria-label="Choose how to play">
      {(['create','join'] as const).map(kind=><button key={kind} className={`menu-mode-card menu-tile menu-mode-${kind}`} type="button" onClick={()=>navigate(kind)}><MenuGlyph kind={kind}/><h2>{kind === 'create' ? 'Host game night' : 'Meet your friends'}</h2><p>{kind === 'create' ? 'Make a room and share its code.' : 'Enter the code your friend sent.'}</p><span className="menu-pill">{kind === 'create' ? 'CREATE ROOM' : 'JOIN ROOM'} <span aria-hidden="true">›</span></span></button>)}
    </section> : <form className="mobile-player-setup" onSubmit={event=>{event.preventDefault();submit();}}>
      <section className="menu-player-card" style={{'--player-color':color} as CSSProperties} aria-label="Your player details">
        <div className="menu-player-token"><img src={`${import.meta.env.BASE_URL}art/menu-car.webp`} alt=""/><span style={{background:color}}/></div>
        <div className="menu-player-fields"><label htmlFor="mobile-player-name">Your name</label><input id="mobile-player-name" value={name} onChange={e=>onName(e.target.value)} maxLength={24} autoComplete="nickname" placeholder="What should we call you?" required/>{colorPicker}</div>
      </section>
      <section className="menu-room-ticket">
        {page === 'join' ? <><label htmlFor="mobile-room-code">Room code</label><input id="mobile-room-code" value={roomCode} onChange={e=>onRoomCode(e.target.value.toUpperCase())} maxLength={4} placeholder="ABCD" spellCheck={false} autoComplete="off" autoCapitalize="characters" aria-describedby="mobile-room-status"/><div id="mobile-room-status" className="menu-room-status" role="status">{roomStatus || 'Ask your friend for their four-letter code.'}</div></> : <><MenuGlyph kind="create"/><h2>{page === 'profile' ? 'Your seat, your colour.' : 'Bring everyone to the table.'}</h2><p>{page === 'profile' ? 'Friends will see this name when you play.' : 'Get a four-letter code to share. Choose the rules together in the lobby.'}</p></>}
        <button className="menu-pill menu-submit" type="submit" disabled={!name.trim() || page === 'join' && !joinReady}>{page === 'profile' ? 'SAVE PLAYER' : page === 'join' ? 'JOIN ROOM' : 'CREATE ROOM'} <span aria-hidden="true">›</span></button>
      </section>
    </form>}
    {error && <div className="mobile-menu-error" role="status">{error}</div>}
    <footer className="mobile-front-footer"><button className="menu-guest-link" type="button" onClick={publisher.openAccount}>Guest profile</button>{page==='home' && resumeCode && <button type="button" className="menu-resume" onClick={onResume}>Return to {resumeCode} <span aria-hidden="true">↗</span></button>}<span>Phone + PC · Same table{import.meta.env.VITE_APP_VERSION && ` · ${storeCandidate ? "Play test" : "Preview"} ${import.meta.env.VITE_APP_VERSION}`}</span></footer>
    {!storeCandidate&&page==='home'&&!owns(publisher.wallet,'remove_ads')&&<div className="sample-ad-placement" aria-label="Sample ad placement">AD PLACEMENT PREVIEW <span>No live ads in this test build</span></div>}
  </main>;
}
