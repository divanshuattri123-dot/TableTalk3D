import "./browserPublisherIntro.css";

const MONOGRAM_PATH =
  "M36 112V35h28c46 0 46 77 0 77H36Zm20-20h8c20 0 20-37 0-37h-8v37ZM93 113V35h25c37 0 37 49 0 49h-5v29H93Zm20-49h5c10 0 10-10 0-10h-5v10Z";
const ORBIT_HEX_PATH = "m80 7 66 38v61l-66 37-66-37V45L80 7Z";
const INNER_HEX_PATH = "m80 15.5 58.5 33.7v51.6L80 134.5 21.5 100.8V49.2L80 15.5Z";

export default function BrowserPublisherIntro({ onContinue }: { onContinue: () => void }) {
  return (
    <main className="bpi-stage" aria-label="Da Publications">
      <div className="bpi-board-frame" aria-hidden="true">
        <span className="bpi-rule bpi-rule-top" />
        <span className="bpi-rule bpi-rule-bottom" />
        <span className="bpi-rule bpi-rule-left" />
        <span className="bpi-rule bpi-rule-right" />
        <i className="bpi-corner bpi-corner-tl" />
        <i className="bpi-corner bpi-corner-tr" />
        <i className="bpi-corner bpi-corner-bl" />
        <i className="bpi-corner bpi-corner-br" />
      </div>

      <div className="bpi-center-slot">
        <div className="bpi-lockup">
          <div className="bpi-crest-wrap" aria-hidden="true">
            <svg className="bpi-mark" viewBox="0 0 160 150" fill="none">
              <defs>
                <linearGradient id="bpi-plinth-grad" x1="20" y1="12" x2="140" y2="138" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#163450" />
                  <stop offset="55%" stopColor="#0E2439" />
                  <stop offset="100%" stopColor="#081726" />
                </linearGradient>
                <linearGradient id="bpi-brass-grad" x1="14" y1="7" x2="146" y2="143" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#F6E3B4" />
                  <stop offset="45%" stopColor="#E7AE59" />
                  <stop offset="78%" stopColor="#B98032" />
                  <stop offset="100%" stopColor="#F1D493" />
                </linearGradient>
                <linearGradient id="bpi-paper-grad" x1="36" y1="32" x2="126" y2="115" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#FFFDF6" />
                  <stop offset="58%" stopColor="#F3E8CD" />
                  <stop offset="100%" stopColor="#DEC596" />
                </linearGradient>
                <linearGradient id="bpi-sheen-grad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#FFF8E3" stopOpacity="0" />
                  <stop offset="45%" stopColor="#FFF8E3" stopOpacity="0.68" />
                  <stop offset="55%" stopColor="#E7AE59" stopOpacity="0.52" />
                  <stop offset="100%" stopColor="#E7AE59" stopOpacity="0" />
                </linearGradient>
                <clipPath id="bpi-hex-clip">
                  <path d={ORBIT_HEX_PATH} />
                </clipPath>
              </defs>

              <path className="bpi-plinth" d={ORBIT_HEX_PATH} fill="url(#bpi-plinth-grad)" />
              <path
                className="bpi-inner-hex"
                d={INNER_HEX_PATH}
                stroke="#E7AE59"
                strokeOpacity="0.34"
                strokeWidth="1"
              />
              <path
                className="bpi-orbit"
                d={ORBIT_HEX_PATH}
                stroke="url(#bpi-brass-grad)"
                strokeWidth="2.4"
                strokeLinejoin="round"
              />

              <g className="bpi-monogram-group">
                <path
                  d={MONOGRAM_PATH}
                  fill="#06121F"
                  fillOpacity="0.62"
                  transform="translate(1.8 2.4)"
                />
                <path className="bpi-monogram" d={MONOGRAM_PATH} fill="url(#bpi-paper-grad)" />
              </g>

              <g clipPath="url(#bpi-hex-clip)">
                <rect
                  className="bpi-foil-sweep"
                  x="-90"
                  y="-20"
                  width="96"
                  height="190"
                  fill="url(#bpi-sheen-grad)"
                />
              </g>

              <circle className="bpi-pip" cx="143" cy="42" r="5" fill="#E7AE59" stroke="#0A1D30" strokeWidth="1.5" />
            </svg>
          </div>

          <div className="bpi-wordmark-block">
            <h1 className="bpi-title">
              <span className="bpi-word bpi-word-da">Da</span>{" "}
              <span className="bpi-word bpi-word-pub">Publications</span>
            </h1>
            <div className="bpi-colophon" aria-hidden="true">
              <span className="bpi-colophon-line" />
              <span className="bpi-colophon-gem" />
              <span className="bpi-colophon-line" />
            </div>
          </div>
        </div>
      </div>

      <div className="bpi-controls-row">
        <button type="button" className="bpi-skip" aria-label="Skip intro" onClick={onContinue}>
          <span>Skip intro</span>
          <span className="bpi-skip-chevron" aria-hidden="true">›</span>
        </button>
      </div>
    </main>
  );
}
