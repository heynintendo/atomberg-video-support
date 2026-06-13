import { Header } from './Header';

interface Props {
  onAgent: () => void;
  onCustomer: () => void;
  onHome: () => void;
}

export function RoleChooser({ onAgent, onCustomer, onHome }: Props) {
  return (
    <div className="aq-app">
      <Header onHome={onHome} />
      <div className="aq-center">
        <div style={{ textAlign: 'center', width: '100%', maxWidth: 720 }}>
          <h2 className="rise" style={{ fontSize: 'clamp(1.7rem, 4vw, 2.2rem)', margin: 0 }}>
            How can we help?
          </h2>
          <p className="muted rise" style={{ margin: '0.5rem 0 2.2rem' }}>
            Choose how you&apos;re joining the call.
          </p>
          <div className="aq-choices" style={{ marginInline: 'auto' }}>
            <button type="button" className="aq-choice rise" onClick={onCustomer}>
              <div className="aq-choice-icon" style={{ background: 'var(--yellow-tint)', color: 'var(--yellow-strong)' }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="6" width="13" height="12" rx="3" />
                  <path d="M15 10l6-3.5v11L15 14" />
                </svg>
              </div>
              <h3>I&apos;m a customer</h3>
              <p>Join a live video call with an Atomberg expert using the invite link they sent you.</p>
            </button>
            <button type="button" className="aq-choice rise" style={{ animationDelay: '0.08s' }} onClick={onAgent}>
              <div className="aq-choice-icon" style={{ background: '#f2f2f2', color: 'var(--ink)' }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
                  <rect x="2.5" y="13" width="4.5" height="7" rx="2" />
                  <rect x="17" y="13" width="4.5" height="7" rx="2" />
                  <path d="M19 20a4 4 0 0 1-4 3h-2" />
                </svg>
              </div>
              <h3>I&apos;m an agent</h3>
              <p>Sign in to start support sessions, share invite links, and manage live calls.</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
