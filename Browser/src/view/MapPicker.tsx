import {useState} from 'react';
import type {CSSProperties} from 'react';
import {WORLDS,worldInfo} from '../engine/worlds';
import type {WorldId} from '../engine/worlds';
import {CITIES} from '../engine/cities';
import type {CityId} from '../engine/cities';

export function MapPickerPanel({world,city,onWorld,onCity,onClose,disabled=false}:{world?:WorldId;city?:CityId;onWorld:(id:WorldId)=>void;onCity:(id:CityId)=>void;onClose:()=>void;disabled?:boolean}) {
  const [tab,setTab]=useState<'worlds'|'cities'>('worlds');
  return <div className="map-picker-backdrop"><section className="map-picker menu-paper" role="dialog" aria-modal="true" aria-labelledby="map-picker-title"><header><div><small>YOUR NEXT TABLE</small><h1 id="map-picker-title">Choose your map</h1><p>{disabled?'The host chooses the map before starting.':'All worlds and city editions are included. Choose both, then create a table.'}</p></div><button type="button" className="menu-round-back" aria-label="Close maps" onClick={onClose}>×</button></header><nav aria-label="Map categories"><button type="button" aria-pressed={tab==='worlds'} onClick={()=>setTab('worlds')}>3D worlds · {WORLDS.length}</button><button type="button" aria-pressed={tab==='cities'} onClick={()=>setTab('cities')}>City editions · {CITIES.length}</button></nav><div className="map-picker-grid">{tab==='worlds'?WORLDS.map(entry=><button type="button" key={entry.id} className="world-choice" style={{'--world-accent':entry.accent} as CSSProperties} disabled={disabled} aria-pressed={(world??'theme000')===entry.id} onClick={()=>onWorld(entry.id)}><img src={`${import.meta.env.BASE_URL}art/worlds/${entry.id}.jpg`} alt="" loading="lazy"/><span><b>{entry.name}</b><small>{entry.detail}</small></span>{(world??'theme000')===entry.id&&<i aria-label="Selected map">✓</i>}</button>):CITIES.map(entry=><button key={entry.id} type="button" className="city-edition-choice" disabled={disabled} aria-pressed={(city??'india')===entry.id} onClick={()=>onCity(entry.id)}><small>{entry.country}</small><b>{entry.name}</b><span>{entry.tag}</span>{(city??'india')===entry.id&&<i aria-label="Selected city">✓</i>}</button>)}</div><footer><p><b>{worldInfo(world).name}</b><span>{CITIES.find(entry=>entry.id===(city??'india'))?.name} places · Same prices and rules</span></p><button type="button" className="menu-pill" onClick={onClose}>DONE</button></footer></section></div>;
}

export default function MapPicker(props:Parameters<typeof MapPickerPanel>[0]) {return <MapPickerPanel {...props}/>;}
