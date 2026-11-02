import { createRoot } from "react-dom/client";
import App from "./App";
import { AssetProvider } from "./assets";
import "./styles.css";
import "./upgrade.css";
import "./play.css";
import "./cinematic.css";
import "./india.css";
import "./immersive.css";
import "./classic.css";
import "./mobileHud.css";
import "./application.css";
import "./mobileMenu.css";
import "./view/celebration.css";
import PublisherShell from "./publisher/PublisherShell";
import "./publisher/publisher.css";
import './view/maps.css';

createRoot(document.getElementById("root") as HTMLElement).render(
  <AssetProvider><PublisherShell><App /></PublisherShell></AssetProvider>
);
