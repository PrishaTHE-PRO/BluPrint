import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { renderIsoIntoSvg, type IsoRoomInput, type IsoViewFacing } from '../utils/isoRoomRender';

interface Props {
  room: IsoRoomInput;
  className?: string;
  label?: string;
}

/** View-only isometric preview — same ink-pen style as dashboard project cards. */
export default function IsoRoomPreview({ room, className = '', label = '3D preview' }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const reactId = useId().replace(/:/g, '');
  const [facing, setFacing] = useState<IsoViewFacing>('from-left');

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    try {
      renderIsoIntoSvg(svg, {
        ...room,
        viewFacing: facing,
        id: room.id || `live-${reactId}`,
      });
    } catch (err) {
      console.error('[IsoRoomPreview] render failed', err);
    }
  }, [room, reactId, facing]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setFacing('from-left');
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setFacing('from-right');
    }
  };

  const facingLabel = facing === 'from-left' ? 'From left' : 'From right';

  return (
    <div
      className={`iso-room-preview room-layout-canvas ${className}`.trim()}
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label="3D room preview. Use left and right arrows to change view."
    >
      <div className="iso-room-preview__toolbar">
        <div className="iso-room-preview__label">{label}</div>
        <div className="iso-room-preview__view-controls" role="group" aria-label="3D view angle">
          <button
            type="button"
            className="iso-room-preview__view-btn"
            aria-label="Look in from the left wall"
            aria-pressed={facing === 'from-left'}
            title="View from left (←)"
            onClick={() => setFacing('from-left')}
          >
            <iconify-icon icon="ph:arrow-left-bold" />
          </button>
          <span className="iso-room-preview__view-hint">{facingLabel}</span>
          <button
            type="button"
            className="iso-room-preview__view-btn"
            aria-label="Look in from the right wall"
            aria-pressed={facing === 'from-right'}
            title="View from right (→)"
            onClick={() => setFacing('from-right')}
          >
            <iconify-icon icon="ph:arrow-right-bold" />
          </button>
        </div>
      </div>
      <svg ref={svgRef} className="w-full h-full select-none" aria-hidden={false} />
    </div>
  );
}
