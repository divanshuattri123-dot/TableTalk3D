interface FileParts {
  parts: string[];
  bytes: number;
}

export interface UnityDataLease { url: string; release(): void }

export async function prepareSplitUnityData(
  path: string,
  resolveAsset: (path: string) => string,
  report: (progress: number) => void,
  signal: AbortSignal,
  get: typeof fetch = fetch
): Promise<UnityDataLease | undefined> {
  if (typeof DecompressionStream === "undefined") return;
  const response = await get(resolveAsset("unity/data-parts.json"), { signal });
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return;
  const index = await response.json() as Record<string, FileParts>;
  const match = index["/" + path];
  if (!match) return;
  if (!match.parts.length || !match.parts.every(part => part.startsWith("/" + path + ".part")) || !Number.isSafeInteger(match.bytes)) {
    throw new Error("Invalid 3D data manifest.");
  }

  let received = 0;
  const bodies = await Promise.all(match.parts.map(async part => {
    const url = resolveAsset(part.slice(1));
    let error: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const entry = await get(url, { signal, cache: attempt === 0 ? "default" : "reload" });
        if (!entry.ok || entry.headers.get("content-type")?.includes("text/html")) throw new Error("A 3D board download part is unavailable.");
        const data = await entry.blob();
        const declared = Number(entry.headers.get("content-length"));
        if (!data.size || (declared > 0 && data.size !== declared)) throw new Error("A 3D board download part stopped early.");
        received += data.size;
        report(Math.min(.66, .66 * received / match.bytes));
        return data;
      } catch (failure) {
        if (signal.aborted) throw failure;
        error = failure;
      }
    }
    throw error;
  }));
  if (received !== match.bytes) throw new Error("The 3D board download did not complete.");
  // Direct part responses avoid dependence on a single long-lived edge stream.
  const compressed = new Blob(bodies, { type: "application/gzip" });
  const data = await new Response(compressed.stream().pipeThrough(new DecompressionStream("gzip")), {
    headers: { "Content-Type": "application/octet-stream" }
  }).blob();
  if (signal.aborted) return;
  const url = URL.createObjectURL(data);
  report(.7);
  return { url, release: () => URL.revokeObjectURL(url) };
}
