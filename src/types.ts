export interface Room {
  roomId:   string;
  name:     string;
  widthFt:  number;
  lengthFt: number;
  heightFt: number;
  sqft:     number;
}

export interface Style {
  styleTag:     string;
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
  price:    number;
  widthIn?: number;
  depthIn?: number;
  heightIn?: number;
  imageUrl: string;
  buyUrl:   string;
  brand:    string;
}

/** One door or window placed on the room perimeter in the editor */
export interface RoomLayoutElement {
  id:    number;
  type:  'door' | 'window';
  x:     number;  // SVG px in editor space (20 px/ft scale, centered at 400,250)
  y:     number;
  angle: number;  // wall angle in degrees
}

/** A rectilinear cutout (nook, closet, etc.) in editor SVG space */
export interface RoomLayoutCutout {
  id:     number;
  points: Array<{ x: number; y: number }>;
}

/** Full room layout saved from the architecture editor */
export interface RoomLayout {
  roomPoints: Array<{ x: number; y: number }>; // polygon vertices in editor SVG space
  elements:   RoomLayoutElement[];
  cutouts:    RoomLayoutCutout[];
  widthFt:    number;
  lengthFt:   number;
}
