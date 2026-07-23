import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import rough from 'roughjs/bundled/rough.esm.js';
import { FloatingInput } from './components/ui/floating-input';
import { renderRoomPreview } from '../iso-preview.js';
import './index.css';

(window as Window & { rough?: typeof rough }).rough = rough;

type LoginFurnitureItem = {
  category: string;
  x: number;
  y: number;
  rotation?: number;
  scale?: number;
  color?: string;
  item?: {
    widthIn?: number;
    depthIn?: number;
    color?: string;
  };
};

type LoginRoomMockup = {
  _id: string;
  name: string;
  widthFt: number;
  lengthFt: number;
  heightFt: number;
  furnitureLayout: {
    items: LoginFurnitureItem[];
  };
};

const blue = '#a7bdd6';
const blueDark = '#6f8fb2';
const wood = '#c4a574';
const deepWood = '#8b7355';
const cream = '#e8d9a8';
const green = '#5d8a62';

function furniture(
  category: string,
  x: number,
  y: number,
  color: string,
  options: Partial<Pick<LoginFurnitureItem, 'rotation' | 'scale'>> & {
    widthIn?: number;
    depthIn?: number;
  } = {},
): LoginFurnitureItem {
  return {
    category,
    x,
    y,
    rotation: options.rotation ?? 0,
    scale: options.scale ?? 1,
    color,
    item: {
      ...(options.widthIn ? { widthIn: options.widthIn } : {}),
      ...(options.depthIn ? { depthIn: options.depthIn } : {}),
      color,
    },
  };
}

const loginRoomMockups: Record<string, LoginRoomMockup> = {
  bedroom: {
    _id: 'login-bedroom',
    name: 'Bedroom',
    widthFt: 12,
    lengthFt: 13,
    heightFt: 8,
    furnitureLayout: {
      items: [
        furniture('bedroom_rug', 2.2, 5.6, '#93abc4', { rotation: 0, widthIn: 92, depthIn: 68 }),
        furniture('bed', 3.1, 3.2, blue, { rotation: 0 }),
        furniture('nightstand', 1.3, 3.3, wood),
        furniture('dresser', 7.4, 8.7, '#a08060', { rotation: 0 }),
        furniture('wardrobe', 8.4, 1.2, deepWood, { rotation: 0 }),
        furniture('bedside_lamp', 1.6, 3.45, cream, { scale: 0.75 }),
      ],
    },
  },
  living: {
    _id: 'login-living',
    name: 'Living Room',
    widthFt: 13,
    lengthFt: 12,
    heightFt: 8,
    furnitureLayout: {
      items: [
        furniture('rug', 2.4, 4.7, '#c9b8a0', { widthIn: 96, depthIn: 72 }),
        furniture('sofa', 2.5, 2.1, blueDark, { rotation: 0 }),
        furniture('coffee_table', 4.7, 5.5, wood, { rotation: 0 }),
        furniture('accent_chair', 8.8, 5.6, '#8ea7c4', { rotation: 45 }),
        furniture('side_table', 8.4, 2.6, wood),
        furniture('floor_lamp', 9.7, 2.2, cream, { scale: 0.9 }),
        furniture('indoor_plants', 10.6, 7.6, green, { scale: 0.85 }),
      ],
    },
  },
  kitchen: {
    _id: 'login-kitchen',
    name: 'Kitchen',
    widthFt: 12,
    lengthFt: 12,
    heightFt: 8,
    furnitureLayout: {
      items: [
        furniture('kitchen_rug', 1.5, 6.8, '#c9b8a0'),
        furniture('kitchen_storage', 1.2, 1.2, '#a08060', { widthIn: 66, depthIn: 18 }),
        furniture('kitchen_shelf', 7.4, 1.2, deepWood, { widthIn: 44, depthIn: 14 }),
        furniture('island_cart', 4.2, 5.3, wood, { rotation: 0, widthIn: 58, depthIn: 28 }),
        furniture('bar_stool', 4.3, 8.2, blue, { scale: 0.95 }),
        furniture('bar_stool', 6.1, 8.4, blue, { scale: 0.95 }),
      ],
    },
  },
  bath: {
    _id: 'login-bath',
    name: 'Bathroom',
    widthFt: 10,
    lengthFt: 11,
    heightFt: 8,
    furnitureLayout: {
      items: [
        furniture('bath_mat', 3.9, 6.5, '#c9b8a0'),
        furniture('bathtub', 1.2, 2.2, '#cfe0ee', { rotation: 0 }),
        furniture('standing_shower', 6.2, 1.4, blue, { scale: 0.95 }),
        furniture('vanity', 2.6, 8.1, '#a08060', { widthIn: 42, depthIn: 20 }),
        furniture('bath_storage', 7.4, 7.5, deepWood),
      ],
    },
  },
  office: {
    _id: 'login-office',
    name: 'Home Office',
    widthFt: 11,
    lengthFt: 12,
    heightFt: 8,
    furnitureLayout: {
      items: [
        furniture('rug', 2.2, 5.3, '#c9b8a0', { widthIn: 84, depthIn: 60 }),
        furniture('desk', 3.1, 2.2, wood, { widthIn: 64, depthIn: 30 }),
        furniture('office_chair', 5.0, 4.6, blueDark, { rotation: 180 }),
        furniture('bookshelf', 8.2, 1.3, deepWood),
        furniture('storage_cabinet', 8.4, 7.4, '#a08060'),
        furniture('desk_lamp', 3.4, 2.6, cream, { scale: 0.75 }),
      ],
    },
  },
  dining: {
    _id: 'login-dining',
    name: 'Dining Room',
    widthFt: 12,
    lengthFt: 12,
    heightFt: 8,
    furnitureLayout: {
      items: [
        furniture('dining_rug', 2.2, 4.1, '#c9b8a0', { widthIn: 96, depthIn: 72 }),
        furniture('dining_table', 4.1, 5.0, wood, { widthIn: 72, depthIn: 40 }),
        furniture('dining_chair', 4.2, 3.3, blue, { rotation: 0 }),
        furniture('dining_chair', 7.0, 7.5, blue, { rotation: 180 }),
        furniture('dining_chair', 2.7, 5.2, blue, { rotation: 90 }),
        furniture('dining_chair', 8.6, 5.1, blue, { rotation: -90 }),
        furniture('sideboard', 7.3, 1.4, '#a08060', { widthIn: 58, depthIn: 18 }),
      ],
    },
  },
  nursery: {
    _id: 'login-nursery',
    name: 'Nursery',
    widthFt: 11,
    lengthFt: 12,
    heightFt: 8,
    furnitureLayout: {
      items: [
        furniture('nursery_rug', 2.4, 5.3, '#c9b8a0', { widthIn: 78, depthIn: 60 }),
        furniture('crib', 2.0, 2.4, blue, { rotation: 0 }),
        furniture('rocking_chair', 7.3, 5.6, '#8ea7c4', { rotation: -30 }),
        furniture('nursery_dresser', 6.6, 1.5, '#a08060'),
        furniture('nursery_shelf', 8.2, 7.4, deepWood),
        furniture('nursery_lamp', 8.0, 5.0, cream, { scale: 0.8 }),
      ],
    },
  },
  studio: {
    _id: 'login-studio',
    name: 'Creative Room',
    widthFt: 12,
    lengthFt: 12,
    heightFt: 8,
    furnitureLayout: {
      items: [
        furniture('rug', 2.3, 5.2, '#c9b8a0', { widthIn: 88, depthIn: 64 }),
        furniture('workspace_desk', 2.2, 2.0, wood, { widthIn: 62, depthIn: 30 }),
        furniture('office_chair', 4.2, 4.7, blueDark, { rotation: 180 }),
        furniture('bookcase', 7.8, 1.3, deepWood),
        furniture('vanity_station', 7.4, 7.7, '#a08060', { widthIn: 42, depthIn: 20 }),
        furniture('indoor_plants', 1.5, 8.5, green, { scale: 0.85 }),
      ],
    },
  },
};

function renderLoginRoomMockups() {
  document.querySelectorAll<HTMLElement>('[data-login-room]').forEach((card, index) => {
    const key = card.dataset.loginRoom;
    const room = key ? loginRoomMockups[key] : undefined;

    if (!room) return;

    card.innerHTML = renderRoomPreview({
      ...room,
      _id: `${room._id}-${index}`,
    });
    card.classList.add('is-rendered');
  });
}

function LoginFields() {
  return (
    <>
      <FloatingInput
        label="Email address"
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        className="input-field login-float-field"
      />

      <div className="login-password-block">
        <div className="flex justify-end mb-1">
          <a href="#" id="forgot-link" className="text-xs font-medium">
            Forgot password?
          </a>
        </div>
        <FloatingInput
          label="Password"
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          className="input-field login-float-field"
        />
      </div>
    </>
  );
}

const rootEl = document.getElementById('login-fields-root');

if (rootEl) {
  flushSync(() => {
    createRoot(rootEl).render(<LoginFields />);
  });
}

renderLoginRoomMockups();

// Auth handlers need #email / #password / #forgot-link in the DOM.
await import('../main.js');
