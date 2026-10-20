import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";

export interface GameAsset {
  id: string;
  kind: "model" | "image" | "audio" | "data";
  category: string;
  name: string;
  label: string;
  source: string;
  src: string;
  bytes: number;
  triangles?: number;
  dimensions?: [number, number, number];
  width?: number;
  height?: number;
  previewId?: string;
  textureId?: string;
}
export interface AssetCatalog {
  assets: GameAsset[];
  featured: { tokens: string[]; dice: string[]; house?: string; hotel?: string; cities: string[]; sounds: Record<string, string> };
  counts: Record<string, number>;
  bytes: number;
}
const assetHost = import.meta.env.VITE_ASSET_HOST?.replace(/\/$/, "");
export const assetUrl = (src: string) => assetHost ? `${assetHost}/${src}` : `${import.meta.env.BASE_URL}${src}`;

interface AssetContextValue {
  catalog?: AssetCatalog;
  byId: Map<string, GameAsset>;
  error?: string;
  reload: () => void;
}
const AssetContext = createContext<AssetContextValue>({ byId: new Map(), reload: () => {} });
export function AssetProvider({ children }: PropsWithChildren) {
  const [catalog, setCatalog] = useState<AssetCatalog>();
  const [error, setError] = useState<string>();
  const reload = useCallback(() => {
    setError(undefined);
    fetch(assetUrl("assets/catalog.json")).then((response) => {
      if (!response.ok) throw new Error("The asset collection is still loading. You can play in 2D or retry.");
      return response.json() as Promise<AssetCatalog>;
    }).then(setCatalog).catch((reason: unknown) => setError(String(reason instanceof Error ? reason.message : reason)));
  }, []);
  useEffect(reload, [reload]);
  const byId = useMemo(() => new Map(catalog?.assets.map((asset) => [asset.id, asset]) ?? []), [catalog]);
  return <AssetContext.Provider value={{ catalog, byId, error, reload }}>{children}</AssetContext.Provider>;
}
export const useAssets = () => useContext(AssetContext);

export interface ViewSettings {
  quality: "auto" | "low" | "high";
  theme: "day" | "night";
  view: "3d" | "2d";
  renderer: "unity" | "collection";
  camera: "perspective" | "top";
  cityId?: string;
  tableArtId?: string;
  musicId?: string;
  sound: boolean;
  volume: number;
}
const DEFAULT_SETTINGS: ViewSettings = { quality: "auto", theme: "day", view: "3d", renderer: "unity", camera: "top", sound: true, volume: .35 };
export function useViewSettings() {
  const [settings, setSettings] = useState<ViewSettings>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("table-talk-view") ?? "{}");
      return { ...DEFAULT_SETTINGS, ...saved, camera: saved.schema === 2 ? saved.camera : "top", cityId: saved.schema === 2 ? saved.cityId : undefined };
    }
    catch { return DEFAULT_SETTINGS; }
  });
  const update = (patch: Partial<ViewSettings>) => setSettings((previous) => {
    const next = { ...previous, ...patch };
    try { localStorage.setItem("table-talk-view", JSON.stringify({ ...next, schema: 2 })); } catch { /* Playing does not depend on storage. */ }
    return next;
  });
  return { settings, update };
}
