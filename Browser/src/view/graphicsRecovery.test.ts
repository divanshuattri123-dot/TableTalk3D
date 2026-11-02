import {describe,it,expect,vi} from 'vitest';
import {watchGraphicsLoss} from './graphicsRecovery';

describe('graphics interruption recovery',()=>{
  it('allows browser context restoration and reports the interruption',()=>{
    const canvas=new EventTarget(),lost=vi.fn();watchGraphicsLoss(canvas,lost);
    const event=new Event('webglcontextlost',{cancelable:true});canvas.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);expect(lost).toHaveBeenCalledOnce();
  });
  it('removes the old player listener when its canvas is replaced',()=>{
    const canvas=new EventTarget(),old=vi.fn(),current=vi.fn();
    const stop=watchGraphicsLoss(canvas,old);stop();watchGraphicsLoss(canvas,current);
    canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));
    expect(old).not.toHaveBeenCalled();expect(current).toHaveBeenCalledOnce();
  });
});
