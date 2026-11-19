import { useState, useEffect } from 'react';
import type { FurnitureItem } from '../types';
import { CATEGORY_LABELS } from '../utils/furnitureLayout';
import { proxiedImageUrl } from '../utils/furnitureColor';

/**
 * One product in the "Shop the room" grid under the plan: picture with the
 * category chip and an in-room toggle on it, then brand, name, price, Swap
 * and Buy. Hovering a card highlights the same piece on the floor plan and
 * the other way round (linkedCategory).
 */

interface Props {
  item:             FurnitureItem;
  canSwap:          boolean;
  onSwap:           () => void;
  animDelay:        string;
  /** Kept for callers that still pass it; every card now has the one layout. */
  variant?:         'compact' | 'featured';
  linkedCategory?:  string | null;
  onLinkCategory?:  (category: string | null) => void;
  inRoom:           boolean;
  onToggleInRoom:   () => void;
  /** Just clicked on the floor plan: pulse so the eye lands here. */
  picked?:          boolean;
  /** Small square in the category chip, matched to the piece on the plan. */
  accent?:          string;
}

const BUY_BTN_CLASS =
  'buy-btn group relative inline-flex items-center justify-center overflow-hidden ' +
  'card-action font-bold transition-colors whitespace-nowrap';

/** Used by the render pane's hover cards. The shop cards draw their own Buy link. */
export function BuyButton({ href, className = '' }: { href: string; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${BUY_BTN_CLASS} ${className}`.trim()}
    >
      <span className="inline-block transition-transform duration-300 ease-out group-hover:-translate-x-1.5">
        Buy
      </span>
      <svg
        className="pointer-events-none absolute right-1.5 size-[0.7em] opacity-0 translate-x-1 transition-all duration-300 ease-out group-hover:opacity-100 group-hover:translate-x-0"
        fill="none"
        viewBox="0 0 10 10"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M1.004 9.166 9.337.833m0 0v8.333m0-8.333H1.004"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </a>
  );
}

const CATEGORY_FALLBACK: Record<string, string> = {
  sofa:         'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&q=80&w=400',
  coffee_table: 'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&q=80&w=400',
  rug:          'https://images.unsplash.com/photo-1600166898405-da9535204843?auto=format&fit=crop&q=80&w=400',
  floor_lamp:   'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&q=80&w=400',
  accent_chair: 'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&q=80&w=400',
  side_table:   'https://images.unsplash.com/photo-1532372320572-cda25653a26d?auto=format&fit=crop&q=80&w=400',
  bed:          'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&q=80&w=400',
  nightstand:   'https://images.unsplash.com/photo-1615529328331-f8917597711f?auto=format&fit=crop&q=80&w=400',
  dresser:      'https://images.unsplash.com/photo-1594620302200-9a7622441566?auto=format&fit=crop&q=80&w=400',
  bedroom_rug:  'https://images.unsplash.com/photo-1600166898405-da9535204843?auto=format&fit=crop&q=80&w=400',
  wardrobe:     'https://images.unsplash.com/photo-1558997519-83ea9252edf8?auto=format&fit=crop&q=80&w=400',
  bedside_lamp: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&q=80&w=400',
  island_cart:  'https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&q=80&w=400',
  bar_stool:    'https://images.unsplash.com/photo-1503602642458-232111445657?auto=format&fit=crop&q=80&w=400',
  kitchen_rug:  'https://images.unsplash.com/photo-1600166898405-da9535204843?auto=format&fit=crop&q=80&w=400',
  kitchen_storage: 'https://images.unsplash.com/photo-1558997519-83ea9252edf8?auto=format&fit=crop&q=80&w=400',
  kitchen_shelf:   'https://images.unsplash.com/photo-1594620302200-9a7622441566?auto=format&fit=crop&q=80&w=400',
  pendant_light:   'https://images.unsplash.com/photo-1524484485831-a92ffc0de03f?auto=format&fit=crop&q=80&w=400',
  vanity:          'https://images.unsplash.com/photo-1620626011761-996317b8d101?auto=format&fit=crop&q=80&w=400',
  bath_mirror:     'https://images.unsplash.com/photo-1620626011761-996317b8d101?auto=format&fit=crop&q=80&w=400',
  bath_storage:    'https://images.unsplash.com/photo-1594620302200-9a7622441566?auto=format&fit=crop&q=80&w=400',
  bath_mat:        'https://images.unsplash.com/photo-1600166898405-da9535204843?auto=format&fit=crop&q=80&w=400',
  bath_light:      'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&q=80&w=400',
  shower_curtain:  'https://images.unsplash.com/photo-1620626011761-996317b8d101?auto=format&fit=crop&q=80&w=400',
  desk:            'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?auto=format&fit=crop&q=80&w=400',
  office_chair:    'https://images.unsplash.com/photo-1505843490701-5be5d0b19d58?auto=format&fit=crop&q=80&w=400',
  bookshelf:       'https://images.unsplash.com/photo-1594620302200-9a7622441566?auto=format&fit=crop&q=80&w=400',
  desk_lamp:       'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&q=80&w=400',
  storage_cabinet: 'https://images.unsplash.com/photo-1558997519-83ea9252edf8?auto=format&fit=crop&q=80&w=400',
  monitor_stand:   'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&q=80&w=400',
  dining_table:    'https://images.unsplash.com/photo-1617806118233-18e1de247200?auto=format&fit=crop&q=80&w=400',
  dining_chair:    'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&q=80&w=400',
  dining_rug:      'https://images.unsplash.com/photo-1600166898405-da9535204843?auto=format&fit=crop&q=80&w=400',
  sideboard:       'https://images.unsplash.com/photo-1594620302200-9a7622441566?auto=format&fit=crop&q=80&w=400',
  dining_light:    'https://images.unsplash.com/photo-1524484485831-a92ffc0de03f?auto=format&fit=crop&q=80&w=400',
  bar_cabinet:     'https://images.unsplash.com/photo-1558997519-83ea9252edf8?auto=format&fit=crop&q=80&w=400',
  crib:            'https://images.unsplash.com/photo-1616627561839-074385245ff6?auto=format&fit=crop&q=80&w=400',
  nursery_dresser: 'https://images.unsplash.com/photo-1594620302200-9a7622441566?auto=format&fit=crop&q=80&w=400',
  rocking_chair:   'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&q=80&w=400',
  nursery_rug:     'https://images.unsplash.com/photo-1600166898405-da9535204843?auto=format&fit=crop&q=80&w=400',
  nursery_shelf:   'https://images.unsplash.com/photo-1594620302200-9a7622441566?auto=format&fit=crop&q=80&w=400',
  nursery_lamp:    'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&q=80&w=400',
};

/** Chip colours, cycled by position in the room order. */
export const CARD_ACCENTS = ['#a9c4dc', '#294f7d', '#6f9bc2', '#d3968c', '#5b7f6a', '#9fc0e0', '#c9a97a'];

function formatPrice(price: number): string {
  if (!(price > 0)) return '-';
  return '$' + Math.round(price).toLocaleString();
}

export default function FurnitureCard({
  item,
  canSwap,
  onSwap,
  animDelay,
  linkedCategory,
  onLinkCategory,
  inRoom,
  onToggleInRoom,
  picked = false,
  accent = CARD_ACCENTS[0],
}: Props) {
  const categoryFallback = CATEGORY_FALLBACK[item.category] || '';
  const productUrl = item.imageUrl || categoryFallback;
  const [imgFailed, setImgFailed] = useState(false);
  const [imgEpoch, setImgEpoch] = useState(0);

  useEffect(() => {
    setImgFailed(false);
    setImgEpoch((n) => n + 1);
  }, [item.id, item.imageUrl, item.category]);

  // Proxy retailer CDNs: mobile Safari often blocks hotlinked product photos,
  // which used to fall back to a generic shot that did not match the item.
  const imgSrc = imgFailed ? categoryFallback : proxiedImageUrl(productUrl);

  const isLinked = linkedCategory === item.category;
  const isDimmed = Boolean(linkedCategory && linkedCategory !== item.category);
  const categoryLabel = CATEGORY_LABELS[item.category] ?? item.category;

  const shellClass = [
    'shop-card',
    inRoom ? '' : 'is-out',
    isLinked ? 'is-linked' : '',
    isDimmed ? 'is-dimmed' : '',
    picked ? 'is-picked' : '',
  ].filter(Boolean).join(' ');

  return (
    <article
      className={shellClass}
      style={{ animationDelay: animDelay }}
      data-furniture-card={item.category}
      onMouseEnter={() => onLinkCategory?.(item.category)}
      onMouseLeave={() => onLinkCategory?.(null)}
      onClick={() => onLinkCategory?.(item.category)}
    >
      <div className="shop-card__media">
        <img
          key={`${item.id}-${imgEpoch}-${imgFailed ? 'fb' : 'src'}`}
          src={imgSrc}
          alt={item.name}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => {
            if (!imgFailed && categoryFallback && imgSrc !== categoryFallback && imgSrc !== proxiedImageUrl(categoryFallback)) {
              setImgFailed(true);
            }
          }}
        />
        <span className="shop-card__chip">
          <span className="shop-card__dot" style={{ background: accent }} aria-hidden="true" />
          {categoryLabel}
        </span>
        <button
          type="button"
          className="shop-card__toggle"
          onClick={(e) => { e.stopPropagation(); onToggleInRoom(); }}
          title={inRoom ? 'Take this piece off the floor plan' : 'Put this piece back on the floor plan'}
          aria-pressed={!inRoom}
        >
          <iconify-icon icon={inRoom ? 'ph:minus-bold' : 'ph:plus-bold'} />
        </button>
      </div>

      <div className="shop-card__body">
        <span className="shop-card__brand">{item.brand || ' '}</span>
        <h3 className="shop-card__name">{item.name}</h3>
        <div className="shop-card__row">
          <span className="shop-card__price">{formatPrice(item.price)}</span>
          <button
            type="button"
            className="shop-card__swap"
            onClick={(e) => { e.stopPropagation(); onSwap(); }}
            disabled={!canSwap}
            title={canSwap ? 'Try another product' : 'No other options yet'}
          >
            <iconify-icon icon="ph:shuffle" /> Swap
          </button>
          <a
            className="shop-card__buy"
            href={item.buyUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            Buy <iconify-icon icon="ph:arrow-up-right" />
          </a>
        </div>
      </div>
    </article>
  );
}
