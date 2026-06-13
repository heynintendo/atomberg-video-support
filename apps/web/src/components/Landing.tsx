import { Header } from './Header';

interface Props {
  onStart: () => void;
  onAgent: () => void;
}

export function Landing({ onStart, onAgent }: Props) {
  return (
    <div className="aq-app aq-hero">
      <Header
        right={
          <button type="button" className="aq-link" onClick={onAgent} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            Agent sign-in
          </button>
        }
      />
      <span className="aq-hero-glow" aria-hidden="true" />
      <main className="aq-hero-inner">
        <span className="aq-eyebrow">Atomberg Support · Live video</span>
        <h1 className="rise">
          Talk to a real expert, live on video. <span className="whynot">Why not?</span>
        </h1>
        <p className="aq-hero-sub rise" style={{ animationDelay: '0.08s' }}>
          Skip the chatbots and the hold music. Get face-to-face with an Atomberg
          specialist for setup, troubleshooting, or buying advice — in seconds, right
          from your browser.
        </p>
        <div className="aq-hero-cta rise" style={{ animationDelay: '0.16s' }}>
          <button type="button" className="btn btn-primary btn-lg" onClick={onStart}>
            Talk to an expert
          </button>
        </div>
        <p className="aq-hero-foot rise" style={{ animationDelay: '0.24s' }}>
          No app to install · Works in any modern browser
        </p>
      </main>
    </div>
  );
}
