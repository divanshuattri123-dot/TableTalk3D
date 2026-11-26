import { describe, expect, it, vi } from "vitest";
import { prepareSplitUnityData } from "./splitUnityData";

const path = "unity/Build/hash/AppsWeb.data.gz";
const host = "https://assets.example/";
describe("split Unity data", () => {
  it("assembles and decodes the parts in order with a retry on a truncated part", async () => {
    const original = "A full Unity data file";
    const encoded = new Uint8Array(await new Response(new Blob([original]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
    const parts = [encoded.slice(0, 12), encoded.slice(12)];
    let tried = 0;
    const get = vi.fn(async (request: RequestInfo | URL) => {
      const url = String(request);
      if (url.endsWith("data-parts.json")) return Response.json({
        ["/" + path]: { parts: ["/" + path + ".part0", "/" + path + ".part1"], bytes: encoded.length }
      });
      if (url.endsWith("part0")) return new Response(parts[0]);
      tried++;
      return new Response(tried === 1 ? parts[1]!.slice(1) : parts[1], { headers: { "Content-Length": String(parts[1]!.length) } });
    });
    const progress = vi.fn();
    const lease = await prepareSplitUnityData(path, asset => host + asset, progress, new AbortController().signal, get);
    expect(tried).toBe(2);
    expect(lease).toBeTruthy();
    try {
      await expect((await fetch(lease!.url)).text()).resolves.toBe(original);
      expect(progress).toHaveBeenLastCalledWith(.7);
    } finally { lease?.release(); }
  });

  it("leaves older unsplit files on their ordinary URL", async () => {
    const get = vi.fn(async () => Response.json({}));
    expect(await prepareSplitUnityData(path, asset => host + asset, () => {}, new AbortController().signal, get)).toBeUndefined();
    expect(get).toHaveBeenCalledTimes(1);
  });
});
