import { useMemo, useState, type ReactNode } from 'react';
import type { FurnitureItem, FurnitureNotice, Style } from '../types';
import { orderedFurniture } from '../utils/furnitureLayout';
import FurnitureCard, { CARD_ACCENTS } from './FurnitureCard';

interface Props {
  slots:            Record<string, FurnitureItem>;
  onSwap:           (category: string) => void;
  style:            Style;
  loading:          boolean;
  roomType?:        string;
  centerContent?:   ReactNode;
  isoContent?:      ReactNode;
  linkedCategory?:  string | null;
  onLinkCategory?:  (category: string | null) => void;
  hiddenCategories: Set<string>;
  onToggleInRoom:   (category: string) => void;
  /** The piece just clicked on the floor plan; its card pulses. */
  pickedCategory?:  string | null;
  /** Re-runs the search, trimming pieces until the set actually fits. */
  onGenerateUnderBudget?: () => void;
  /** True once a trim-to-fit run has already been tried for this room. */
  underBudgetTried?: boolean;
  /** Photo rooms: what the picture already holds, and what that changed. */
  notice?: FurnitureNotice | null;
}

export default function FurniturePanel({
  slots,
  onSwap,
  style,
  loading,
  roomType,
  centerContent,
  isoContent,
  linkedCategory,
  onLinkCategory,
  hiddenCategories,
  onToggleInRoom,
  pickedCategory = null,
  notice = null,
}: Props) {
  // Room order follows the plan (big pieces first); Price is cheapest first.
  const [sort, setSort] = useState<'room' | 'price'>('room');
  const displayed = orderedFurniture(slots, roomType);
  // Chip colours follow room order so a piece keeps its colour when re-sorted.
  const accentFor = useMemo(() => {
    const map = new Map<string, string>();
    displayed.forEach((item, i) => map.set(item.category, CARD_ACCENTS[i % CARD_ACCENTS.length]));
    return map;
  }, [displayed]);
  const shown = sort === 'price' ? [...displayed].sort((a, b) => a.price - b.price) : displayed;
  const total = displayed
    .filter((item) => !hiddenCategories.has(item.category))
    .reduce((sum, item) => sum + item.price, 0);

  const budget = style.budgetTotal > 0 ? style.budgetTotal : 0;
  const overBudget = budget > 0 && total > budget;
  const overBy = overBudget ? total - budget : 0;

  // Hovering a piece on the floor plan only highlights its card; a click on
  // a piece scrolls the page to the card and pulses it (see RoomResult).
  // Hover itself deliberately does NOT scroll the grid.
  // scrollIntoView walks up every scrollable ancestor and yanked the page; the
  // selected card is highlighted through `linkedCategory` where it stands.

  const cards = shown.map((item, i) => (
    <FurnitureCard
      key={item.id}
      item={item}
      canSwap
      onSwap={() => onSwap(item.category)}
      animDelay={`${0.1 + i * 0.06}s`}
      linkedCategory={linkedCategory}
      onLinkCategory={onLinkCategory}
      inRoom={!hiddenCategories.has(item.category)}
      onToggleInRoom={() => onToggleInRoom(item.category)}
      picked={pickedCategory === item.category}
      accent={accentFor.get(item.category)}
    />
  ));

  const shopHeader = (
    <div className="shop-room__head">
      <div>
        <span className="shop-room__eyebrow">Shop the room</span>
        <h2 id="shop-room-title" className="shop-room__title">Buy the pieces</h2>
      </div>
      {/* Room order is the default; the Price tag sorts cheapest first and
          a second tap returns to room order. */}
      <button
        type="button"
        className={'shop-room__price-tag' + (sort === 'price' ? ' is-on' : '')}
        aria-pressed={sort === 'price'}
        title={sort === 'price' ? 'Back to room order' : 'Sort by price, lowest first'}
        onClick={() => setSort(sort === 'price' ? 'room' : 'price')}
      >
        <iconify-icon icon={sort === 'price' ? 'ph:sort-ascending-bold' : 'ph:currency-dollar-bold'} />
        Price
        {sort === 'price' && <span aria-hidden="true">· Low to high</span>}
      </button>
    </div>
  );

  const header = (
    <div className="flex items-center justify-end animate-reveal mb-4 shrink-0" style={{ animationDelay: '0.4s' }}>
      {total > 0 && (
        <div className="result-est">
          <div className="result-est__pill">
            <span className="result-est__label">Est.</span>
            <span className="result-est__total">${total.toLocaleString()}</span>
            {budget > 0 && (
              <span className="result-est__budget">/ ${budget.toLocaleString()}</span>
            )}
          </div>
          {overBudget && (
            <p className="result-est__note">* ${overBy.toLocaleString()} over your budget</p>
          )}
        </div>
      )}
    </div>
  );

  // Shown only when the real total genuinely exceeds the budget. Until now the
  // server quietly scaled prices down so this could almost never happen.
  // For photo rooms. Amber when the room is full and only accents are
  // offered; neutral when we simply skipped what the picture already has.
  // The "we kept what is already in your photo" variant is intentionally not shown.
  const photoNotice = notice && notice.kind === 'full' && (
    <div
      role="status"
      className={`animate-reveal mb-4 rounded-2xl border px-4 py-3 ${
        notice.kind === 'full'
          ? 'border-[#D3968C]/30 bg-[#D3968C]/10'
          : 'border-[#839958]/30 bg-[#839958]/10'
      }`}
      style={{ animationDelay: '0.4s' }}
    >
      <div className="flex items-start gap-3">
        <span className={`text-lg leading-none mt-0.5 shrink-0 ${notice.kind === 'full' ? 'text-[#D3968C]' : 'text-[#839958]'}`}>
          <iconify-icon icon={notice.kind === 'full' ? 'ph:warning-circle-duotone' : 'ph:eye-duotone'} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[#F7F4D5]">
            {notice.kind === 'full' ? 'Your room is already well furnished' : 'We kept what is already in your photo'}
          </p>
          <p className="text-xs text-[#F7F4D5]/60 mt-1 leading-relaxed">{notice.message}</p>
        </div>
      </div>
    </div>
  );

  const views = (
    <div className="result-dual-pane">
      <div className="result-dual-pane__view result-dual-pane__view--iso">
        {isoContent}
      </div>
      <div className="result-dual-pane__view">
        {centerContent}
      </div>
    </div>
  );

  if (loading) {
    return (
      <section className="mb-10 result-furniture-section">
        {header}
        <div className="result-dual-pane">
          <div className="rounded-2xl aspect-[4/3] animate-pulse bg-[#EDE8E1]" />
          <div className="rounded-2xl aspect-[4/3] animate-pulse bg-[#EDE8E1]" />
        </div>
        <div className="shop-room shop-room--loading">
          <div className="shop-room__grid">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="shop-card shop-card--skeleton animate-pulse" aria-hidden="true">
                <div className="shop-card__media" />
                <div className="shop-card__body"><span /><span /></div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-[#F7F4D5]/30 text-center animate-pulse mt-4">
          Searching for your {style.styleTag} style...
        </p>
      </section>
    );
  }

  if (displayed.length === 0) {
    return (
      <section className="mb-10 result-furniture-section">
        {header}
        {photoNotice}
        {views}
        <p className="text-[#F7F4D5]/40 text-center py-8">
          {notice?.kind === 'full' ? 'Nothing more fits comfortably in this room.' : 'No furniture found. Try re-analyzing your room.'}
        </p>
      </section>
    );
  }

  return (
    <section className="mb-10 result-furniture-section">
      {header}
      {photoNotice}
      {views}
      <section className="shop-room animate-reveal" style={{ animationDelay: '0.5s' }} aria-labelledby="shop-room-title">
        {shopHeader}
        <div className="shop-room__grid">
          {cards}
        </div>
      </section>
    </section>
  );
}
