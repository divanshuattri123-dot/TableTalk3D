import { describe, expect, it, vi } from "vitest";
import { lockGameLandscape, phoneNeedsLandscape, releaseGameOrientation } from "./fullscreen";

describe("landscape-first phone play", () => {
  it("asks a portrait phone to rotate but leaves desktops and landscape alone", () => {
    expect(phoneNeedsLandscape(390, 844, true)).toBe(true);
    expect(phoneNeedsLandscape(844, 390, true)).toBe(false);
    expect(phoneNeedsLandscape(600, 900, false)).toBe(false);
    expect(phoneNeedsLandscape(1024, 1366, true)).toBe(false);
  });
  it("requests landscape and tolerates browsers that cannot lock", async () => {
    const lock = vi.fn().mockResolvedValue(undefined);
    expect(await lockGameLandscape({ lock })).toBe(true); expect(lock).toHaveBeenCalledWith("landscape");
    expect(await lockGameLandscape({})).toBe(false);
    expect(await lockGameLandscape({ lock: vi.fn().mockRejectedValue(new Error("Not supported")) })).toBe(false);
  });
  it("releases the lock when leaving the game", () => {
    const unlock = vi.fn(); releaseGameOrientation({ unlock }); expect(unlock).toHaveBeenCalledOnce();
    expect(() => releaseGameOrientation({ unlock: () => { throw new Error("Unavailable"); } })).not.toThrow();
  });
});
