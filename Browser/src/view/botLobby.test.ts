import {it,expect,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import MobileLobby from './MobileLobby';
import BotLobbyControls from './BotLobbyControls';
import {createInitialState,reduceGame} from '../engine/reducer';

const host=()=>reduceGame(createInitialState('BOTS'),{type:'JOIN',player:{id:'h',name:'Human',color:'red'}});
it('offers AI beside invitations on an empty mobile seat',()=>{
  const html=renderToStaticMarkup(createElement(MobileLobby,{game:host(),localId:'h',isHost:true,sendAction:vi.fn(),onCopy:vi.fn(),copied:false,colorPicker:null}));
  expect(html).toContain('Add AI');expect(html).toContain('Invite friend');expect(html).toContain('ADD AI OR INVITE FRIEND');
});
it('labels the AI style, allows starting with one human, and reserves removal for the host',()=>{
  const game=reduceGame(host(),{type:'ADD_BOT',playerId:'h'});game.mode='classic';
  const props={game,localId:'h',isHost:true,sendAction:vi.fn(),onCopy:vi.fn(),copied:false,colorPicker:null};
  const html=renderToStaticMarkup(createElement(MobileLobby,props));expect(html).toContain('AI PLAYER');expect(html).toContain('Balanced');expect(html).toContain('Remove AI Mira');expect(html).toContain('START GAME');
  const peer=renderToStaticMarkup(createElement(MobileLobby,{...props,localId:'friend',isHost:false}));expect(peer).not.toContain('Remove AI Mira');expect(peer).not.toContain('>Add AI<');
});
it('includes an AI option in the desktop lobby and disables adding at six seats',()=>{
  let game=host();for(let i=0;i<5;i++)game=reduceGame(game,{type:'ADD_BOT',playerId:'h'});
  const html=renderToStaticMarkup(createElement(BotLobbyControls,{game,localId:'h',sendAction:vi.fn()}));expect(html).toContain('Add AI player');expect(html).toContain('disabled');expect(html).toContain('Remove AI Zoya');
});
