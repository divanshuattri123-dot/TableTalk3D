import {useState} from 'react';
import type {CSSProperties} from 'react';
import {CITIES,cityInfo} from '../engine/cities';
import type {CityId} from '../engine/cities';

function CitySign({city}:{city:CityId}) {
  return <svg viewBox="0 0 120 90" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 82h104"/>
    {city==='paris'?<><path d="m60 6-9 34-22 42m31-76 9 34 22 42M44 52h32M38 64h44M51 40h18M48 82q12-29 24 0M54 28h12M60 2v8"/><path d="m48 47 28 19M72 47 44 66"/></>:city==='london'?<><path d="M38 82V26h44v56M44 26V15h32v11M50 15 60 4l10 11M45 52h30M45 61h30M45 70h30"/><circle cx="60" cy="38" r="10"/><path d="M60 31v8l5 3M30 82V59h8M82 59h9v23"/></>:city==='tokyo'?<><path d="M42 82V68h36v14M34 68h52L60 53 34 68ZM41 53h38L60 39 41 53ZM47 39h26L60 24 47 39ZM60 5v19M48 68v-9M72 68v-9M50 53v-9M70 53v-9M53 39v-8M67 39v-8"/></>:city==='new-york'?<><path d="M19 82V48h23v34M47 82V23h31v59M53 23V13h19v10M62 2v11M83 82V36h20v46M25 56h10M25 65h10M55 34h15M55 44h15M55 54h15M55 64h15M89 45h8M89 55h8M89 65h8"/></>:city==='atlantic'?<><circle cx="60" cy="39" r="30"/><circle cx="60" cy="39" r="5"/><path d="m60 39-18 43m18-43 18 43M60 9v60M30 39h60M39 18l42 42M81 18 39 60M27 82h66"/><path d="M21 76H9v6m90-6h12v6"/></>:<><path d="M25 82V26h70v56M19 26h82M31 17h58v9M40 17V8h40v9M40 82V57q20-24 40 0v25M34 37h8M55 37h10M78 37h8"/></>}
  </svg>;
}
export default function CityPicker({value,disabled,onSelect}:{value?:CityId;disabled?:boolean;onSelect:(id:CityId)=>void}) {
  const [open,setOpen]=useState(false),selected=cityInfo(value);
  return <><button type="button" className="lobby-city-trigger" aria-label="Choose city" aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}><span aria-hidden="true">◇</span> {selected.name} <span aria-hidden="true">⌄</span></button>
    {open && <div className="lobby-choice-backdrop" onClick={()=>setOpen(false)}><section className="city-picker-dialog menu-paper" role="dialog" aria-modal="true" aria-labelledby="city-picker-title" onClick={e=>e.stopPropagation()}><header><div><h2 id="city-picker-title">Choose your city</h2><p>{disabled?'The host chooses the city for everyone.':'One city for everyone at the table. All themes are free.'}</p></div><button type="button" className="menu-round-back" aria-label="Close city picker" autoFocus onClick={()=>setOpen(false)}>×</button></header><div className="city-picker-grid">{CITIES.map(city=><button key={city.id} type="button" className="city-choice menu-tile" style={{'--city-accent':city.accent} as CSSProperties} disabled={disabled} aria-pressed={city.id===selected.id} onClick={()=>{onSelect(city.id);setOpen(false);}}><span className="city-country">{city.country}</span><CitySign city={city.id}/><span className="menu-pill">{city.name}{city.id===selected.id && <span aria-hidden="true">✓</span>}</span><small>{city.tag}</small></button>)}</div><p className="city-picker-note">City-themed places with the same prices and rules. ₹ keeps the shared game economy consistent. Your existing match stays unchanged.</p></section></div>}
  </>;
}
