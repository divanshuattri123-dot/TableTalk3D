import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import TapDice from './TapDice';

it('presents dice themselves as an accessible touch target without the old Roll slab',()=>{
  const html=renderToStaticMarkup(createElement(TapDice,{onThrow:vi.fn()}));
  expect(html).toContain('aria-label="Roll dice"');expect(html).toContain('tap-dice-pair');expect(html).toContain('Tap the dice');expect(html).not.toContain('roll-button');expect(html).not.toContain('>ROLL<');
});
it('keeps utility rolls labelled and disabled states semantic',()=>{
  const html=renderToStaticMarkup(createElement(TapDice,{onThrow:vi.fn(),utility:true,disabled:true}));expect(html).toContain('Roll dice for utility rent');expect(html).toContain('disabled');
});
