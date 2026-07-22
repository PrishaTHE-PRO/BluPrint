import { useEffect, useId, useRef } from 'react';
import { renderIsoIntoSvg, type IsoRoomInput } from '../utils/isoRoomRender';

interface Props {
  room: IsoRoomInput;
  className?: string;
  label?: string;
}

/** View-only isometric preview — same ink-pen style as dashboard project cards. */
export default function IsoRoomPreview({ room, className = '', label = '3D preview' }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const reactId = useId().replace(/:/g, '');

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    try {
      renderIsoIntoSvg(svg, {
        ...room,
        id: room.id || `live-${reactId}`,
      });
    } catch (err) {
      console.error('[IsoRoomPreview] render failed', err);
    }
  }, [room, reactId]);

  return (
    <div className={`iso-room-preview room-layout-canvas ${className}`.trim()}>
      <div className="iso-room-preview__label">{label}</div>
      <svg ref={svgRef} className="w-full h-full select-none" aria-hidden={false} />
    </div>
  );
}
