import type { Room, RoomArchitectureLayout, RoomPoint } from '../types';
import {
  calculateCutoutAreaSqFt,
  createFallbackRoomLayout,
  getRoomDimensionsFromPoints,
  ROOM_LAYOUT_VIEWBOX,
} from '../utils/roomLayout';

interface Props {
  room: Room;
  layout?: RoomArchitectureLayout | null;
}

function buildClosedPath(points: RoomPoint[]) {
  if (points.length < 3) return '';
  return `${points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')} Z`;
}

function getBounds(points: RoomPoint[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

export default function RoomBlueprintPreview({ room, layout }: Props) {
  const resolvedLayout = layout && layout.roomPoints.length >= 3 ? layout : createFallbackRoomLayout(room);
  const viewBox = resolvedLayout.viewBox ?? ROOM_LAYOUT_VIEWBOX;
  const dimensions = getRoomDimensionsFromPoints(resolvedLayout.roomPoints, resolvedLayout.scale);
  const widthFt = dimensions.widthFt || resolvedLayout.widthFt || room.widthFt;
  const lengthFt = dimensions.lengthFt || resolvedLayout.lengthFt || room.lengthFt;
  const bounds = getBounds(resolvedLayout.roomPoints);
  const totalArea = widthFt * lengthFt;
  const cutoutArea = calculateCutoutAreaSqFt(resolvedLayout.cutouts, resolvedLayout.scale);
  const usableArea = Math.max(0, totalArea - cutoutArea);
  const roomPath = buildClosedPath(resolvedLayout.roomPoints);
  const roomWithCutouts = `${roomPath} ${resolvedLayout.cutouts
    .map((cutout) => buildClosedPath(cutout.points))
    .filter(Boolean)
    .join(' ')}`;

  return (
    <div className="garden-card ghibli-border p-4 animate-reveal w-full" style={{ animationDelay: '0.4s' }}>
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-base font-bold flex items-center gap-2">
          <iconify-icon icon="ph:layout-duotone" class="text-[#D3968C]" />
          2D Room Layout
        </h3>
      </div>

      <div
        className="relative bg-[#F7F4D5] rounded-2xl overflow-hidden shadow-2xl"
        style={{
          aspectRatio: `${viewBox.width} / ${viewBox.height}`,
          border: '8px solid rgba(10,51,35,0.05)',
        }}
      >
        <svg
          viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-full p-2 select-none"
        >
          <defs>
            <pattern id="bp-small-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(247,244,213,0.03)" strokeWidth="1" />
            </pattern>
            <pattern id="bp-large-grid" width="100" height="100" patternUnits="userSpaceOnUse">
              <rect width="100" height="100" fill="url(#bp-small-grid)" />
              <path d="M 100 0 L 0 0 0 100" fill="none" stroke="rgba(247,244,213,0.08)" strokeWidth="1.5" />
            </pattern>

            <symbol id="bp-door-template">
              <path d="M 0 0 L 40 0" stroke="#F7F4D5" strokeWidth="3" />
              <path d="M 40 0 A 40 40 0 0 1 0 40" stroke="#F7F4D5" strokeWidth="1.5" strokeDasharray="4 4" fill="none" />
              <path d="M 0 0 L 0 40" stroke="#D3968C" strokeWidth="4" />
            </symbol>
            <symbol id="bp-window-template">
              <rect x="0" y="-4" width="50" height="8" fill="#0A3323" stroke="#F7F4D5" strokeWidth="1.5" />
              <line x1="5" y1="-1.5" x2="45" y2="-1.5" stroke="#F7F4D5" strokeWidth="1" />
              <line x1="5" y1="1.5" x2="45" y2="1.5" stroke="#F7F4D5" strokeWidth="1" />
            </symbol>
          </defs>

          <rect width="100%" height="100%" fill="url(#bp-large-grid)" />

          <path
            d={roomWithCutouts}
            fillRule="evenodd"
            fill="rgba(211, 150, 140, 0.05)"
            stroke="#D3968C"
            strokeWidth="3.5"
          />

          {resolvedLayout.elements.map((element) => {
            const offset = element.type === 'door' ? -20 : -25;
            return (
              <g key={String(element.id)}>
                <use
                  href={`#bp-${element.type}-template`}
                  transform={`translate(${element.x},${element.y}) rotate(${element.angle}) translate(${offset}, 0)`}
                />
              </g>
            );
          })}

          {resolvedLayout.cutouts.map((cutout) => (
            <g key={String(cutout.id)}>
              <path
                d={buildClosedPath(cutout.points)}
                fill="rgba(211, 150, 140, 0.15)"
                stroke="#D3968C"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
              {cutout.points.map((point, index) => (
                <circle
                  key={`${String(cutout.id)}-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r="4"
                  fill="#D3968C"
                  stroke="white"
                  strokeWidth="1"
                  pointerEvents="none"
                />
              ))}
            </g>
          ))}

          <text
            x={(bounds.minX + bounds.maxX) / 2}
            y={bounds.minY - 15}
            textAnchor="middle"
            fill="#D3968C"
            className="font-bold text-[10px] uppercase tracking-widest"
          >
            {widthFt.toFixed(1)} ft
          </text>
          <text
            x={bounds.minX - 15}
            y={(bounds.minY + bounds.maxY) / 2}
            textAnchor="middle"
            transform={`rotate(-90, ${bounds.minX - 15}, ${(bounds.minY + bounds.maxY) / 2})`}
            fill="#D3968C"
            className="font-bold text-[10px] uppercase tracking-widest"
          >
            {lengthFt.toFixed(1)} ft
          </text>
        </svg>

        <div className="absolute bottom-4 right-4">
          <div className="px-4 py-2 rounded-full bg-white/90 border border-[#0A3323]/10 text-[10px] font-bold text-[#0A3323]/70 uppercase tracking-widest shadow-lg">
            Total Area: {totalArea.toFixed(1)} SQ FT <span className="mx-2 opacity-30">|</span> Usable Area: {usableArea.toFixed(1)} SQ FT
          </div>
        </div>
      </div>
    </div>
  );
}
