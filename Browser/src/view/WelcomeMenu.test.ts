import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { WelcomeMenuPanel } from "./WelcomeMenu";
import type { ViewSettings } from "../assets";

const settings: ViewSettings = { view: "3d", quality: "auto", renderer: "unity", camera: "top", theme: "day", sound: true, volume: .35 };
const render = (patch: Partial<ViewSettings> = {}) => renderToStaticMarkup(createElement(WelcomeMenuPanel, { settings: { ...settings, ...patch }, onUpdate: vi.fn(), onCustomize: vi.fn(), onClose: vi.fn() }));

it("keeps pre-game settings and appearance inside a named closeable menu", () => {
  const html = render();
  for (const text of ['role="dialog"', 'aria-modal="true"', 'aria-label="Close game menu"', "Game menu", "Settings", "Change token", "Change dice"]) expect(html).toContain(text);
  expect(html).not.toMatch(/Explore|Browse all|model-preview|ROLL|Zoom|End turn/);
});
it("shows the existing personal graphics, board and sound choices", () => {
  const html = render({ view: "2d", quality: "low", sound: false, volume: .7 });
  expect(html).toContain('<option value="2d" selected="">2D board</option>');
  expect(html).toContain('<option value="low" selected="">Battery saver</option>');
  expect(html).toContain('value="0.7"');
  expect(html).not.toContain('checked=""');
});
it("retains defaults without mounting a preview or changing a game", () => {
  const html = render();
  expect(html).toContain('<option value="auto" selected="">Automatic</option>');
  expect(html).toContain('checked=""');
  expect(html).toContain('value="0.35"');
  expect(html).toContain("They do not change anyone else’s view.");
});
