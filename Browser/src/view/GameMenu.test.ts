import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import GameMenu from "./GameMenu";

const options=()=>({roomCode:"TEST",copied:false,fullscreen:false,onPanel:vi.fn(),onCopy:vi.fn(),onFullscreen:vi.fn(),onPrivacy:vi.fn()});
it("offers Settings and help from the menu without exposing the log or camera controls",()=>{
  const html=renderToStaticMarkup(createElement(GameMenu,options()));
  for(const label of ["Settings","Select pieces","Rules &amp; help","Copy room link"])expect(html).toContain(label);
  expect(html).toContain("TEST");expect(html).not.toMatch(/Players &amp; deeds|Property guide|Game history|Event log|Zoom|Roll|End turn|Buy property/);
});
it("routes each menu choice to UI callbacks only",()=>{
  const props=options(), buttons=GameMenu(props).props.children[1].props.children;
  buttons.forEach((button:{props:{onClick:()=>void}})=>button.props.onClick());
  expect(props.onPanel.mock.calls).toEqual([["settings"],["pieces"],["help"],["leave"]]);
  for(const callback of [props.onCopy,props.onFullscreen,props.onPrivacy])expect(callback).toHaveBeenCalledOnce();
});
it("reflects fullscreen and copied-link state without replacing the saved room",()=>{
  const html=renderToStaticMarkup(createElement(GameMenu,{...options(),fullscreen:true,copied:true}));
  expect(html).toContain("Exit full screen");expect(html).toContain("Link copied");expect(html).toContain("TEST");
});
