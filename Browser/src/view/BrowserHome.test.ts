import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import BrowserHome, { BrowserMenuPanel } from "./BrowserHome";
import type { BrowserHomeProps } from "./BrowserHome";
import type { ViewSettings } from "../assets";

const baseHomeProps = (overrides: Partial<BrowserHomeProps> = {}): BrowserHomeProps => ({
  name: "Aarav",
  color: "#e85c54",
  roomCode: "",
  onName: vi.fn(),
  onRoomCode: vi.fn(),
  colorPicker: createElement("div", { className: "mock-colors" }, "Colours"),
  joinReady: false,
  onCreate: vi.fn(),
  onJoin: vi.fn(),
  world: "theme000",
  city: "india",
  tokenLabel: "sportscar",
  diceLabel: "Paris Dice",
  menuOpen: false,
  onOpenMenu: vi.fn(),
  onOpenMaps: vi.fn(),
  onOpenStudio: vi.fn(),
  ...overrides
});

const defaultSettings: ViewSettings = {
  view: "3d",
  quality: "auto",
  renderer: "unity",
  camera: "top",
  theme: "day",
  sound: true,
  volume: 0.35
};

it("focuses the browser home on city panorama, Create, Join, and saved-seat Return without catalogue totals or 3D preview canvas", () => {
  const html = renderToStaticMarkup(createElement(BrowserHome, baseHomeProps({ resumeCode: "SAVE", onResume: vi.fn() })));
  expect(html.match(/<h1\b/g)).toHaveLength(1);
  for (const expected of [
    "browser-home-city.webp",
    "Create a table",
    "Join with a code",
    "Return to SAVE",
    "Your table name",
    "Sportscar",
    "Paris Dice"
  ]) {
    expect(html).toContain(expected);
  }
  expect(html).not.toMatch(/Explore 1,044|Browse all|6,430|model-preview|unity-canvas/);
});

it("keeps a supplied ?room=ABCD invite populated and surfaces seat/colour status right beside Join", () => {
  const html = renderToStaticMarkup(
    createElement(
      BrowserHome,
      baseHomeProps({
        name: "",
        roomCode: "ABCD",
        inviteCode: "ABCD",
        joinReady: true,
        roomStatus: "2 / 6 players · Your colour is available.",
        roomStatusTone: "ready"
      })
    )
  );
  expect(html).toContain('value="ABCD"');
  expect(html).toContain("Invite prefilled");
  expect(html).toContain("2 / 6 players · Your colour is available. Enter your name above to join.");
});

it("exposes view, quality, sound, maps, pieces, guest profile, store, and privacy inside the closeable browser menu", () => {
  const html = renderToStaticMarkup(
    createElement(BrowserMenuPanel, {
      settings: { ...defaultSettings, view: "2d", quality: "high", sound: false, volume: 0.6 },
      onUpdate: vi.fn(),
      world: "theme000",
      city: "india",
      tokenLabel: "sportscar",
      diceLabel: "Paris Dice",
      onClose: vi.fn(),
      onOpenMaps: vi.fn(),
      onOpenStudio: vi.fn()
    })
  );
  for (const label of [
    'role="dialog"',
    'aria-modal="true"',
    'aria-label="Close table menu"',
    "Board view",
    "Graphics",
    "Game sounds",
    "Volume",
    "Maps &amp; editions",
    "Change token",
    "Change dice",
    "Guest profile",
    "Store",
    "Privacy &amp; support"
  ]) {
    expect(html).toContain(label);
  }
  expect(html).toContain('<option value="2d" selected="">2D board</option>');
  expect(html).toContain('<option value="high" selected="">High detail</option>');
});
