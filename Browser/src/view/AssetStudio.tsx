import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { assetUrl, useAssets } from "../assets";
import type { GameAsset } from "../assets";
const ModelPreview = lazy(() => import("./ModelPreview"));

export type AssetUse = "token" | "dice" | "city" | "art" | "music";
const CATEGORIES = [["all", "Everything"], ["token", "Tokens"], ["dice", "Dice"], ["building", "Houses & hotels"], ["scenery", "City & props"], ["sprite", "Artwork"], ["texture", "Textures"], ["music", "Music"], ["sound", "Sounds"], ["data", "Game data"]];
const sizeLabel = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;

export default function AssetStudio({ onClose, onChoose, initialCategory = "token", selectedId, color }: {
  onClose: () => void; onChoose: (asset: GameAsset, use: AssetUse) => void; initialCategory?: string; selectedId?: string; color?: string;
}) {
  const { catalog, byId, error, reload } = useAssets();
  const [category, setCategory] = useState(initialCategory);
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const [page, setPage] = useState(0);
  const [id, setId] = useState(selectedId ?? "");
  const [text, setText] = useState("");
  const audio = useRef<HTMLAudioElement>(null);
  const matches = useMemo(() => catalog?.assets.filter((asset) => (category === "all" || asset.category === category) && `${asset.label} ${asset.name}`.toLowerCase().includes(deferred.toLowerCase())) ?? [], [catalog, category, deferred]);
  const pageCount = Math.max(1, Math.ceil(matches.length / 24));
  const asset = byId.get(id) ?? matches[0];
  useEffect(() => { setPage(0); }, [deferred, category]);
  useEffect(() => {
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", escape);
    return () => { document.body.style.overflow = overflow; window.removeEventListener("keydown", escape); };
  }, [onClose]);
  useEffect(() => {
    audio.current?.pause();
    if (asset?.kind !== "data") return;
    const controller = new AbortController(); setText("Loading the source data…");
    fetch(assetUrl(asset.src), { signal: controller.signal }).then((response) => response.text()).then((value) => setText(value.slice(0, 12000))).catch(() => {});
    return () => controller.abort();
  }, [asset?.id]);

  return <div className="studio-backdrop"><section className="asset-studio" role="dialog" aria-modal="true" aria-labelledby="studio-title">
    <header className="studio-header"><div><p className="eyebrow">Your collection</p><h2 id="studio-title">Make the table yours.</h2><p>{catalog ? `${catalog.counts.model.toLocaleString()} models · ${catalog.counts.image.toLocaleString()} images · ${catalog.counts.audio} sounds` : "Opening the asset collection…"}</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close collection">×</button></header>
    <div className="studio-filters"><label>Collection<select value={category} onChange={(event) => { setCategory(event.target.value); setId(""); }}>{CATEGORIES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Find an asset<input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setId(""); }} placeholder="Sports car, Paris, dragon…" /></label><span>{matches.length.toLocaleString()} matches</span></div>
    {error && <p className="inline-error">{error} <button type="button" onClick={reload}>Retry assets</button></p>}
    <div className="studio-content">
      <div className="studio-results"><div className="asset-grid">
        {matches.slice(page * 24, page * 24 + 24).map((entry) => {
          const preview = entry.kind === "image" ? entry : byId.get(entry.previewId ?? "");
          return <button type="button" className={`asset-tile ${asset?.id === entry.id ? "selected" : ""}`} key={entry.id} onClick={() => setId(entry.id)}>
            {preview ? <img loading="lazy" decoding="async" src={assetUrl(preview.src)} alt="" /> : <span className={`asset-glyph ${entry.category}`}>{entry.kind === "model" ? "◇" : entry.kind === "audio" ? "♫" : "≡"}</span>}
            <b>{entry.label}</b><small>{entry.category} · {sizeLabel(entry.bytes)}</small>
          </button>;
        })}
      </div>{matches.length === 0 && <p className="waiting-note">No assets match that search. Try another name or collection.</p>}<nav className="asset-pagination" aria-label="Collection pages"><button type="button" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Previous</button><span>{Math.min(page + 1, pageCount)} / {pageCount}</span><button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => value + 1)}>Next</button></nav></div>
      <aside className="asset-detail">
        {asset?.kind === "model" && <Suspense fallback={<p>Opening 3D preview…</p>}><ModelPreview asset={asset} color={color} /></Suspense>}
        {asset?.kind === "image" && <div className="image-preview"><img src={assetUrl(asset.src)} alt={asset.label} /></div>}
        {asset?.kind === "audio" && <div className="sound-preview"><span>♫</span><audio key={asset.id} ref={audio} controls preload="none" src={assetUrl(asset.src)} /></div>}
        {asset?.kind === "data" && <pre className="data-preview">{text}</pre>}
        {asset && <><p className="eyebrow">{asset.category}</p><h3>{asset.label}</h3><p className="asset-description">{asset.kind === "model" ? `${asset.triangles?.toLocaleString()} triangles · optimized 3D model` : asset.kind === "image" ? `${asset.width} × ${asset.height} source image · web-optimized` : asset.kind === "audio" ? "Ready for browser playback" : "Source game data · read-only reference"}</p>
          <div className="asset-use-actions">
            {asset.kind === "model" && <><button className="primary-button" type="button" onClick={() => onChoose(asset, category === "dice" ? "dice" : "token")}>{category === "dice" ? "Use these dice" : "Use as my token"}</button><button className="secondary-button" type="button" onClick={() => onChoose(asset, "city")}>Use as city scenery</button>{category !== "dice" && <button className="quiet-button" type="button" onClick={() => onChoose(asset, "dice")}>Use as dice</button>}</>}
            {asset.kind === "image" && <button className="primary-button" type="button" onClick={() => onChoose(asset, "art")}>Use as table artwork</button>}
            {asset.kind === "audio" && <button className="primary-button" type="button" onClick={() => onChoose(asset, "music")}>Play at my table</button>}
            <a className="asset-download" href={assetUrl(asset.src)} download>Download this asset</a>
          </div>
        </>}
      </aside>
    </div>
  </section></div>;
}
