import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import RollReadout from './RollReadout';
import EventStage from './EventStage';
import {createInitialState,reduceGame} from '../engine/reducer';
import type {PresentationFrame} from '../presentation/plan';

const game=()=>reduceGame(reduceGame(createInitialState('DICE'),{type:'JOIN',player:{id:'a',name:'Asha',color:'red'}}),{type:'JOIN',player:{id:'b',name:'Bryn',color:'blue'}});
const frame=(kind:PresentationFrame['kind']='dice'):PresentationFrame=>({id:'roll',kind,duration:1450,playerId:'a',dice:[6,5],text:'Asha rolled 6 + 5'});
it('shows every legal dice pair and its total as an edge readout, without a modal',()=>{
  for(let a=1;a<=6;a++)for(let b=1;b<=6;b++){
    const html=renderToStaticMarkup(createElement(RollReadout,{frame:{...frame(),dice:[a,b]},name:'Asha',color:'red'}));
    expect(html).toContain(`Total ${a+b}`);expect(html).toContain(`Die 1: ${a}`);expect(html).toContain(`Die 2: ${b}`);
    expect(html.includes('>Doubles<')).toBe(a===b);expect(html).not.toContain('aria-modal');expect(html).not.toContain('settled-dice');
  }
});
it('keeps the dice visible as a small status even if a newer server state has opened an auction',()=>{
  const s=game();s.phase='awaitingAuction';s.auction={propertyId:3,landingPlayerId:'a',currentBid:0,eligiblePlayerIds:['a','b'],passedPlayerIds:[]};
  const html=renderToStaticMarkup(createElement(EventStage,{game:s,frame:frame(),busy:true,localId:'a',sendAction:vi.fn(),onCardRead:vi.fn()}));
  expect(html).toContain('roll-readout');expect(html).not.toContain('Live property auction');expect(html).not.toContain('motion-event');
});
it('lets the token movement finish before covering the board with an auction',()=>{
  const s=game();s.phase='awaitingAuction';s.auction={propertyId:3,landingPlayerId:'a',currentBid:0,eligiblePlayerIds:['a','b'],passedPlayerIds:[]};
  const props={game:s,busy:true,localId:'a',sendAction:vi.fn(),onCardRead:vi.fn()};
  expect(renderToStaticMarkup(createElement(EventStage,{...props,frame:frame('move')}))).not.toContain('Live property auction');
  expect(renderToStaticMarkup(createElement(EventStage,{...props,busy:false}))).toContain('Live property auction');
  expect(renderToStaticMarkup(createElement(EventStage,{...props,frame:{...frame('bid'),tileId:3}}))).toContain('Live property auction');
});
