import { createRoot } from "react-dom/client";
import App from "./App";
import { AssetProvider } from "./assets";
import "./styles.css";
import "./upgrade.css";
import "./play.css";
import "./cinematic.css";
import "./india.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <AssetProvider><App /></AssetProvider>
);
