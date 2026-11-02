import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {PublisherIntro} from '../publisher/PublisherShell';
import MobileWelcome from './MobileWelcome';
import {MapPickerPanel} from './MapPicker';
import {WORLDS} from '../engine/worlds';

it('shows a named publisher screen with a visible title and an explicit continue control',()=>{
  const html=renderToStaticMarkup(createElement(PublisherIntro,{onContinue:vi.fn()}));
  expect(html).toContain('<h1>Da Publications</h1>');expect(html).toContain('publisher-mark');expect(html).toContain('Skip publisher intro');
});
it('keeps Play, Maps, Store and Settings on Home alongside explicit saved-game resume',()=>{
  const html=renderToStaticMarkup(createElement(MobileWelcome,{name:'QA Guest',color:'red',roomCode:'',onName:vi.fn(),onRoomCode:vi.fn(),colorPicker:null,joinReady:false,onCreate:vi.fn(),onJoin:vi.fn(),onMenu:vi.fn(),onMaps:vi.fn(),onSaveProfile:vi.fn(),resumeCode:'SAVE',onResume:vi.fn()}));
  for(const control of ['Play with friends','Choose maps','Open store','Open settings','Return to SAVE'])expect(html).toContain(control);
  expect(html).not.toContain('ROLL');expect(html).not.toContain('unity-canvas');
});
it('lists all eleven native worlds as distinct choices and identifies the selected map',()=>{
  const html=renderToStaticMarkup(createElement(MapPickerPanel,{world:'theme010',onWorld:vi.fn(),onCity:vi.fn(),onClose:vi.fn()}));
  for(const world of WORLDS){expect(html).toContain(world.name);expect(html).toContain(`${world.id}.jpg`);}
  expect(html.match(/aria-pressed="true"/g)).toHaveLength(2);
});
