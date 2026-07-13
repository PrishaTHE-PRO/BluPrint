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
