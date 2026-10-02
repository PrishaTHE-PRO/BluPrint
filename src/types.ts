/** One product's box in a generated render. Normalized 0..1, top-left origin. */
export interface RenderHotspot {
  category: string;
  itemId:   string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Product summary stored with a render so hover cards work on a revisit. */
export interface RenderItem {
  id:       string;
  category: string;
  name:     string;
  brand:    string;
  price:    number;
  imageUrl: string;
  buyUrl:   string;
  widthIn?: number;
  depthIn?: number;
}

/** Where a product sits on the floor plan, projected from the render.
 *  Top-left corner in feet, same space as the plan's Placement. */
export interface RenderPlacement {
  category:  string;
  itemId:    string;
  x:         number;
  y:         number;
  rotation?: number;
  /** True when the back wall could not be found and a typical camera was assumed. */
  approx?:   boolean;
}

export interface RoomRender {
  url:         string;
  createdAt:   string;
  itemIds:     string[];
  hotspots:    RenderHotspot[];
  items?:      RenderItem[];
  placements?: RenderPlacement[];
}

export interface Room {
  roomId:   string;
  name:     string;
  widthFt:  number;
  lengthFt: number;
  heightFt: number;
  sqft:     number;
  /** Cloudinary URL of the user's own room photo; null when the room was drawn. */
  photoUrl?: string | null;
  /** The last generated render into that photo, if any. */
  render?:   RoomRender | null;
}

export interface Style {
  styleTag:     string;
  roomType?:    string;
  moodTags:     string[];
  colorPalette: string[];
  roomFeatures: string[];
  confidence:   number;
  budgetTotal:  number;
}

export interface FurnitureItem {
  id:       string;
  name:     string;
  category: string;
  style?:   string[];
  styleTag?: string;
  price:    number;
  widthIn?: number;
  depthIn?: number;
  heightIn?: number;
  imageUrl: string;
  buyUrl:   string;
  brand:    string;
  /** Optional sampled product color for previews. */
  color?:   string;
}

export interface RoomPoint {
  x: number;
  y: number;
}

export interface ArchitectureElement {
  id:    number | string;
  type:  'door' | 'window';
  x:     number;
  y:     number;
  angle: number;
  width?: number;
}

export interface ArchitectureCutout {
  id:     number | string;
  type:   'cutout';
  points: RoomPoint[];
}

export interface RoomArchitectureLayout {
  version:    number;
  roomId?:    string;
  roomName:   string;
  widthFt:    number;
  lengthFt:   number;
  heightFt:   number;
  sqft:       number;
  scale:      number;
  viewBox:    {
    width:  number;
    height: number;
  };
  roomPoints: RoomPoint[];
  elements:   ArchitectureElement[];
  cutouts:    ArchitectureCutout[];
  savedAt:    string;
}

/** Subset used by the interactive 2D furniture floor plan */
export type RoomLayout = Pick<RoomArchitectureLayout, 'roomPoints' | 'elements' | 'cutouts'>;
