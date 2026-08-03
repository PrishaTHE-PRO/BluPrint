// furniture-catalog.js
// Real-world standard dimensions per BluPrint category key. Dimensions are in
// INCHES (W = along-wall width, D = depth, H = height) and are stable facts you
// can rely on for correct 3D scale and for filtering products by fit.
//
// - archetype: which 3D model shape room3d.js draws for this category
// - dimsIn:    typical real product size [W, D, H] in inches
// - priceUsd:  rough typical price range (verify/override with live Serper data)
// - styleTags: default style descriptors (GPT/Serper can refine per product)
// - buyUrl(style): a reliable search link (never 404s) — swap for a real
//                  product URL when your Serper result has one.
const g = (label, archetype, dimsIn, priceUsd, styleTags, query) => ({
  label, archetype, dimsIn, priceUsd, styleTags,
  buyUrl: (style = '') =>
    `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(`${style} ${query}`.trim())}`,
});

export const FURNITURE_CATALOG = {
  // Living room
  sofa:            g('Sofa', 'sofa', [84, 36, 34], [499, 1499], ['seating'], 'sofa couch'),
  coffee_table:    g('Coffee table', 'table_low', [48, 24, 18], [99, 399], ['living'], 'coffee table'),
  rug:             g('Area rug', 'rug', [96, 60, 0.6], [79, 399], ['textile'], 'area rug'),
  floor_lamp:      g('Floor lamp', 'lamp_floor', [14, 14, 60], [49, 199], ['lighting'], 'floor lamp'),
  accent_chair:    g('Accent chair', 'chair', [30, 32, 34], [149, 599], ['seating'], 'accent chair'),
  side_table:      g('Side table', 'table_low', [20, 20, 24], [59, 249], ['living'], 'side table'),
  // Bedroom
  bed:             g('Bed', 'bed', [64, 84, 42], [299, 1299], ['bedroom'], 'bed frame with headboard'),
  nightstand:      g('Nightstand', 'storage_sm', [24, 16, 26], [79, 299], ['bedroom'], 'nightstand'),
  bedroom_rug:     g('Bedroom rug', 'rug', [96, 60, 0.6], [79, 399], ['textile'], 'bedroom area rug'),
  bedside_lamp:    g('Bedside lamp', 'lamp_table', [12, 12, 24], [29, 129], ['lighting'], 'bedside table lamp'),
  dresser:         g('Dresser', 'storage', [60, 18, 32], [199, 799], ['bedroom'], 'dresser'),
  // Kitchen
  island_cart:     g('Kitchen island cart', 'storage', [42, 20, 36], [149, 499], ['kitchen'], 'kitchen island cart'),
  bar_stool:       g('Bar stool', 'stool', [16, 16, 28], [49, 199], ['seating'], 'bar stool'),
  kitchen_rug:     g('Kitchen runner', 'rug', [60, 24, 0.5], [29, 99], ['textile'], 'kitchen runner rug'),
  kitchen_storage: g('Kitchen cabinet', 'storage_tall', [36, 18, 72], [199, 699], ['kitchen'], 'kitchen storage cabinet'),
  kitchen_shelf:   g('Kitchen shelf', 'shelf', [36, 12, 36], [59, 199], ['kitchen'], 'kitchen shelf'),
  pendant_light:   g('Pendant light', 'pendant', [14, 14, 16], [49, 249], ['lighting'], 'pendant light'),
  // Bathroom
  vanity:          g('Bathroom vanity', 'storage', [36, 21, 32], [249, 899], ['bathroom'], 'bathroom vanity'),
  bath_mirror:     g('Bath mirror', 'mirror', [30, 1.5, 36], [59, 249], ['bathroom'], 'bathroom mirror'),
  bath_storage:    g('Bath storage', 'storage_tall', [24, 14, 68], [99, 349], ['bathroom'], 'bathroom storage cabinet'),
  bath_mat:        g('Bath mat', 'rug', [24, 17, 0.6], [19, 59], ['textile'], 'bath mat'),
  bath_light:      g('Vanity light', 'pendant', [24, 5, 5], [39, 179], ['lighting'], 'bathroom vanity light'),
  shower_curtain:  g('Shower curtain', 'panel', [72, 1, 72], [19, 79], ['bathroom'], 'shower curtain'),
  bathtub:         g('Bathtub', 'bathtub', [60, 30, 24], [499, 1999], ['bathroom'], 'freestanding bathtub'),
  standing_shower: g('Shower', 'shower', [36, 36, 78], [499, 1499], ['bathroom'], 'walk in shower enclosure'),
  // Home office
  desk:            g('Desk', 'table_tall', [48, 24, 30], [129, 499], ['office'], 'desk'),
  office_chair:    g('Office chair', 'chair', [26, 26, 40], [99, 399], ['seating'], 'office chair'),
  bookshelf:       g('Bookshelf', 'shelf_tall', [32, 12, 72], [99, 399], ['office'], 'bookshelf'),
  desk_lamp:       g('Desk lamp', 'lamp_table', [8, 8, 18], [25, 99], ['lighting'], 'desk lamp'),
  storage_cabinet: g('Storage cabinet', 'storage_tall', [36, 18, 72], [149, 599], ['office'], 'storage cabinet'),
  monitor_stand:   g('Monitor stand', 'table_low', [22, 9, 5], [25, 89], ['office'], 'monitor stand riser'),
  // Dining
  dining_table:    g('Dining table', 'table_tall', [72, 36, 30], [299, 1199], ['dining'], 'dining table'),
  dining_chair:    g('Dining chair', 'chair', [18, 20, 36], [59, 249], ['seating'], 'dining chair'),
  dining_rug:      g('Dining rug', 'rug', [96, 72, 0.6], [99, 449], ['textile'], 'dining room rug'),
  sideboard:       g('Sideboard', 'storage', [60, 18, 32], [249, 899], ['dining'], 'sideboard buffet'),
  dining_light:    g('Dining pendant', 'pendant', [30, 30, 16], [99, 499], ['lighting'], 'dining pendant chandelier'),
  bar_cabinet:     g('Bar cabinet', 'storage_tall', [36, 18, 60], [199, 699], ['dining'], 'bar cabinet'),
  // Nursery
  crib:            g('Crib', 'crib', [54, 30, 36], [149, 599], ['nursery'], 'crib'),
  nursery_dresser: g('Nursery dresser', 'storage', [48, 18, 34], [199, 699], ['nursery'], 'nursery dresser'),
  rocking_chair:   g('Rocking chair', 'chair', [26, 34, 40], [149, 599], ['seating'], 'nursery rocking chair'),
  nursery_rug:     g('Nursery rug', 'rug', [60, 84, 0.6], [59, 249], ['textile'], 'nursery rug'),
  nursery_shelf:   g('Nursery shelf', 'shelf', [30, 10, 30], [49, 179], ['nursery'], 'nursery shelf'),
  nursery_lamp:    g('Nursery lamp', 'lamp_table', [10, 10, 20], [29, 99], ['lighting'], 'nursery lamp'),
  // Features
  reading_nook:    g('Reading chair', 'chair', [34, 34, 32], [199, 799], ['seating'], 'reading nook armchair'),
  smart_lighting:  g('Smart light', 'pendant', [12, 12, 12], [29, 149], ['lighting'], 'smart light'),
  floating_shelves:g('Floating shelves', 'wall_shelf', [36, 8, 2], [39, 149], ['storage'], 'floating wall shelves'),
  indoor_plants:   g('Indoor plant', 'plant', [22, 22, 40], [39, 149], ['decor'], 'indoor plant with planter'),
  full_length_mirror: g('Full-length mirror', 'mirror', [24, 2, 65], [79, 299], ['decor'], 'full length mirror'),
  wall_art:        g('Wall art', 'wall_art', [36, 2, 24], [39, 199], ['decor'], 'framed wall art'),
  workspace_desk:  g('Workspace desk', 'table_tall', [48, 24, 30], [129, 499], ['office'], 'workspace desk'),
  vanity_station:  g('Vanity table', 'storage', [40, 18, 30], [149, 599], ['bedroom'], 'vanity table with mirror'),
};

// Fallback for any unmapped key.
export const DEFAULT_ENTRY = g('Furniture', 'box', [24, 24, 24], [49, 199], [], 'furniture');

export function catalogEntry(category) {
  return FURNITURE_CATALOG[category] || DEFAULT_ENTRY;
}
