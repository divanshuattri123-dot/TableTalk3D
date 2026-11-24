import { expect, it } from 'vitest';
import { isPackagedHome, roomShareUrl, PUBLIC_GAME_URL } from './platform';
it('shares public room links from installed apps, never private app origins', () => {
  for (const origin of ['tabletalk://game/?build=old', 'https://localhost/index.html']) expect(roomShareUrl('ABCD', origin, true)).toBe(PUBLIC_GAME_URL + '?room=ABCD');
});
it('retains browser and local-development links outside the app', () => {
  expect(roomShareUrl('WXYZ', 'http://127.0.0.1:5173/?room=OLD&build=old#old', false)).toBe('http://127.0.0.1:5173/?room=WXYZ');
});
it('routes packaged builds and native mobile shells to the packaged home while keeping browser builds on browser home', () => {
  expect(isPackagedHome(true, false)).toBe(true);
  expect(isPackagedHome(false, true)).toBe(true);
  expect(isPackagedHome(false, false)).toBe(false);
});
