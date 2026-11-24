import {expect,it} from 'vitest';
import {unityDataUrl,unityFailureMessage} from './unityLoading';

it('bypasses the old truncated HTTP cache entry without changing local APK paths',()=>{
  expect(unityDataUrl('https://game.test/unity/hash/AppsWeb.data.gz')).toBe('https://game.test/unity/hash/AppsWeb.data.gz?download=length-checked-v1');
  expect(unityDataUrl('./unity/hash/AppsWeb.data')).toBe('./unity/hash/AppsWeb.data');
});
it('preserves existing data query parameters',()=>expect(unityDataUrl('https://game.test/AppsWeb.data.gz?v=3')).toContain('?v=3&download='));
it('explains the actual incomplete-download error instead of blaming the GPU',()=>{
  expect(unityFailureMessage('Invalid binary data file size! (offset=240, size=35587373, file length=14765791)')).toMatchObject({title:'Game download interrupted',retry:true});
});
it('distinguishes browser capability errors from interruptions',()=>{
  expect(unityFailureMessage('Your browser does not support WebAssembly 2023.').retry).toBe(false);
  expect(unityFailureMessage('Your browser does not support WebGL.').title).toBe('3D graphics unavailable');
});
