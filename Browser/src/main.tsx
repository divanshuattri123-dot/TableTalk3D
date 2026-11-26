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
import './view/motionHud.css';
import './view/browserHome.css';
import { loadCloudAccount } from "./network/accountStorage";
import { PUBLIC_GAME_URL } from "./platform";

const root = createRoot(document.getElementById("root") as HTMLElement);
void loadCloudAccount().then(() => root.render(
  <AssetProvider><PublisherShell><App /></PublisherShell></AssetProvider>
)).catch(() => root.render(
  <main className="publisher-login"><section className="login-card" role="alert">
    <h1>Couldn’t load your saved profile</h1>
    <button className="publisher-primary" onClick={() => window.location.reload()}>Retry</button>
    <p><a href={PUBLIC_GAME_URL + window.location.search}>Play as a guest</a></p>
  </section></main>
));
