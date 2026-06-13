import type { ReactNode } from 'react';
import logoUrl from '../assets/atomberg-logo.svg';

// Consistent header with the Atomberg wordmark top-left on every non-call screen.
export function Header({ right, onHome }: { right?: ReactNode; onHome?: () => void }) {
  return (
    <header className="aq-header">
      <button
        type="button"
        className="aq-logo"
        onClick={onHome}
        aria-label="Atomberg home"
        style={{ background: 'none', border: 'none', padding: 0, cursor: onHome ? 'pointer' : 'default' }}
      >
        <img src={logoUrl} alt="Atomberg" />
      </button>
      {right && <div className="aq-header-right">{right}</div>}
    </header>
  );
}
