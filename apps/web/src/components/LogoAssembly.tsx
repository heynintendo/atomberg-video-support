import { useEffect } from 'react';
import logoUrl from '../assets/atomberg-logo.svg';

interface Props {
  /** Caption shown beneath the logo (e.g. while connecting). */
  caption?: string;
  /** Called after the ~1.7s sequence (used to auto-dismiss the brand beat). */
  onDone?: () => void;
  /** Allow click-to-skip (brand beat). */
  onSkip?: () => void;
}

// SVG/CSS-driven self-assembly: a yellow disc pops in, the wordmark slides in
// beside it, "Why not?" fades in underneath, then it resolves (cross-fades) to
// the exact real logo asset. No raster frames — crisp at any size.
export function LogoAssembly({ caption, onDone, onSkip }: Props) {
  useEffect(() => {
    if (!onDone) return undefined;
    const t = setTimeout(onDone, 1750);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="aq-assembly" onClick={onSkip} role={onSkip ? 'button' : undefined}>
      <div className="aq-assembly-stage">
        <div className="aq-assembly-build">
          <div className="aq-assembly-row">
            <span className="aq-assembly-disc">a</span>
            <span className="aq-assembly-word">atomberg</span>
          </div>
          <span className="aq-assembly-tag">
            Why <em>not?</em>
          </span>
        </div>
        <img className="aq-assembly-real" src={logoUrl} alt="Atomberg" />
      </div>
      {caption && <p className="aq-assembly-caption">{caption}</p>}
      {caption && <span className="aq-assembly-spinner" aria-hidden="true" />}
      {onSkip && <span className="aq-assembly-skip">tap to skip</span>}
    </div>
  );
}
