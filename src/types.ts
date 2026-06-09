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
  style:    string[];
  price:    number;
  widthIn:  number;
  depthIn:  number;
  heightIn: number;
  imageUrl: string;
  buyUrl:   string;
  brand:    string;
}
