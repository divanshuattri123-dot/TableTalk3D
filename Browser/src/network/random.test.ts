import {describe,it,expect,vi} from 'vitest';
import {randomIndex,rollDice} from './random';

describe('dice entropy outside the game reducer',()=>{
  it('maps complete groups of words equally to all six faces',()=>{
    for(let i=0;i<36;i++)expect(randomIndex(6,()=>i)).toBe(i%6);
  });
  it('rejects every value in the short final group',()=>{
    const source=vi.fn().mockReturnValueOnce(0xffffffff).mockReturnValueOnce(0xfffffffe).mockReturnValueOnce(0xfffffffd).mockReturnValueOnce(0xfffffffc).mockReturnValueOnce(5);
    expect(randomIndex(6,source)).toBe(5);expect(source).toHaveBeenCalledTimes(5);
  });
  it('rolls two separate dice without reading game finances or cosmetics',()=>{
    let n=0;const getRandomValues=vi.fn((array:Uint32Array)=>{array[0]=n++===0?0:5;return array;});
    vi.stubGlobal('crypto',{getRandomValues});
    try{expect(rollDice()).toEqual([1,6]);expect(getRandomValues).toHaveBeenCalledTimes(2);}finally{vi.unstubAllGlobals();}
  });
});
