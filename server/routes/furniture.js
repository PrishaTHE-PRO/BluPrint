const express = require("express");
const axios   = require("axios");
const Style   = require("../models/Style");
const Room    = require("../models/Room");

const router = express.Router();

const LIVING_ROOM = [
  { key: "sofa",         product: "sofa" },
  { key: "coffee_table", product: "coffee table" },
  { key: "rug",          product: "area rug" },
  { key: "floor_lamp",   product: "floor lamp" },
  { key: "accent_chair", product: "accent chair" },
  { key: "side_table",   product: "side table" },
];

const BEDROOM = [
  { key: "bed",          product: "bed frame" },
  { key: "nightstand",   product: "nightstand" },
  { key: "bedroom_rug",  product: "area rug" },
  { key: "bedside_lamp", product: "bedside lamp" },
  { key: "dresser",      product: "dresser" },
];

const KITCHEN = [
  { key: "island_cart",     product: "kitchen island cart" },
  { key: "bar_stool",       product: "bar stool" },
  { key: "kitchen_rug",     product: "kitchen runner rug" },
  { key: "kitchen_storage", product: "kitchen storage cabinet" },
  { key: "kitchen_shelf",   product: "kitchen shelf" },
  { key: "pendant_light",   product: "pendant light" },
];

const BATHROOM = [
  { key: "vanity",         product: "bathroom vanity" },
  { key: "bath_mirror",    product: "bathroom mirror" },
  { key: "bath_storage",   product: "bathroom storage" },
  { key: "bath_mat",       product: "bath mat" },
  { key: "bath_light",     product: "bathroom vanity light" },
  { key: "shower_curtain", product: "shower curtain" },
];

const BATHTUB = { key: "bathtub", product: "freestanding bathtub" };
const STANDING_SHOWER = { key: "standing_shower", product: "walk in shower enclosure" };

const HOME_OFFICE = [
  { key: "desk",            product: "desk" },
  { key: "office_chair",    product: "office chair" },
  { key: "bookshelf",       product: "bookshelf" },
  { key: "desk_lamp",       product: "desk lamp" },
  { key: "storage_cabinet", product: "storage cabinet" },
  { key: "monitor_stand",   product: "monitor stand" },
];

const DINING_ROOM = [
  { key: "dining_table", product: "dining table" },
  { key: "dining_chair", product: "dining chair" },
  { key: "dining_rug",   product: "dining room rug" },
  { key: "sideboard",    product: "sideboard" },
  { key: "dining_light", product: "dining pendant light" },
  { key: "bar_cabinet",  product: "bar cabinet" },
];

const NURSERY = [
  { key: "crib",            product: "crib" },
  { key: "nursery_dresser", product: "nursery dresser" },
  { key: "rocking_chair",   product: "rocking chair" },
  { key: "nursery_rug",     product: "nursery rug" },
  { key: "nursery_shelf",   product: "nursery shelf" },
  { key: "nursery_lamp",    product: "nursery lamp" },
];

const FEATURE_CATEGORIES = {
  "reading nook":            { key: "reading_nook",       product: "reading nook chair" },
  "smart lighting":          { key: "smart_lighting",     product: "smart home lighting" },
  "floating shelves":        { key: "floating_shelves",   product: "floating wall shelves" },
  "indoor plants":           { key: "indoor_plants",      product: "indoor plant with decorative planter" },
  "full-length mirror":      { key: "full_length_mirror", product: "full length mirror" },
  "wall art / gallery wall": { key: "wall_art",           product: "wall art set" },
  "accent chair":            { key: "accent_chair",       product: "accent chair" },
  "workspace desk":          { key: "workspace_desk",     product: "workspace desk" },
  "vanity station":          { key: "vanity_station",     product: "vanity table" },
  "bookcase / bookshelves":  { key: "bookcase",           product: "bookcase" },
  "bathtub":                 BATHTUB,
  "bath tub":                BATHTUB,
  "standing shower":         STANDING_SHOWER,
  "walk-in shower":          STANDING_SHOWER,
  "walk in shower":          STANDING_SHOWER,
};

/** Map UI labels + AI tags onto a canonical style id used for shopping queries. */
function normalizeStyleTag(raw) {
  const t = String(raw || "").trim().toLowerCase().replace(/[_/]+/g, " ").replace(/\s+/g, " ");
  if (!t) return "modern";
  if (t.includes("boho") || t.includes("bohem")) return "bohemian";
  if (t.includes("scand")) return "scandinavian";
  if (t.includes("mid") && t.includes("cent")) return "mid-century modern";
  if (t.includes("farm") || t.includes("rustic")) return "farmhouse";
  if (t.includes("indust")) return "industrial";
  if (t.includes("coast") || t.includes("beach")) return "coastal";
  if (t.includes("tradit") || t.includes("classic") || t.includes("transitional")) return "traditional";
  if (t.includes("maxim")) return "maximalist";
  if (t.includes("art") && t.includes("deco")) return "art deco";
  if (t.includes("minimal")) return "minimalist";
  if (t.includes("modern") || t.includes("contemporary")) return "modern";
  return t;
}

/** Extra shopping keywords so Serper returns on-style products, not generic ones. */
const STYLE_SEARCH = {
  bohemian: {
    phrase: "bohemian boho",
    accents: "rattan macrame eclectic patterned",
    match: ["boho", "bohemian", "rattan", "macrame", "eclectic", "moroccan", "woven", "global"],
  },
  scandinavian: {
    phrase: "scandinavian nordic",
    accents: "light wood hygge minimal",
    match: ["scandinavian", "nordic", "hygge", "light wood", "blond"],
  },
  modern: {
    phrase: "modern contemporary",
    accents: "sleek clean line",
    match: ["modern", "contemporary", "sleek"],
  },
  minimalist: {
    phrase: "minimalist modern",
    accents: "simple clean uncluttered",
    match: ["minimalist", "minimal", "simple"],
  },
  industrial: {
    phrase: "industrial loft",
    accents: "metal pipe reclaimed wood",
    match: ["industrial", "loft", "metal", "pipe", "reclaimed"],
  },
  coastal: {
    phrase: "coastal beach house",
    accents: "light airy linen",
    match: ["coastal", "beach", "nautical", "linen"],
  },
  farmhouse: {
    phrase: "farmhouse rustic",
    accents: "shiplap distressed wood",
    match: ["farmhouse", "rustic", "shiplap", "barn"],
  },
  traditional: {
    phrase: "traditional classic",
    accents: "elegant timeless",
    match: ["traditional", "classic", "elegant"],
  },
  "mid-century modern": {
    phrase: "mid century modern",
    accents: "walnut tapered legs retro",
    match: ["mid-century", "mid century", "mcm", "walnut", "retro"],
  },
  maximalist: {
    phrase: "maximalist bold",
    accents: "colorful patterned statement",
    match: ["maximalist", "bold", "colorful", "pattern"],
  },
  "art deco": {
    phrase: "art deco",
    accents: "geometric glam brass",
    match: ["art deco", "deco", "geometric", "brass"],
  },
};

function styleProfile(styleTag) {
  const key = normalizeStyleTag(styleTag);
  return STYLE_SEARCH[key] || {
    phrase: key,
    accents: "",
    match: key.split(/\s+/).filter(Boolean),
  };
}

function roomTypeSearchPhrase(roomType) {
  const t = String(roomType || "").toLowerCase();
  if (t.includes("bed")) return "bedroom";
  if (t.includes("kitchen")) return "kitchen";
  if (t.includes("bath")) return "bathroom";
  if (t.includes("office") || t.includes("study")) return "home office";
  if (t.includes("dining")) return "dining room";
  if (t.includes("nursery") || t.includes("baby")) return "nursery";
  if (t.includes("living")) return "living room";
  return "interior";
}

/** Build a Serper shopping query that keeps style + room type in the product search. */
function buildFurnitureQuery(styleTag, roomType, product, { short = false } = {}) {
  const style = styleProfile(styleTag);
  const room = roomTypeSearchPhrase(roomType);
  const parts = short
    ? [style.phrase, product]
    : [style.phrase, room, product, style.accents];
  return parts.map((part) => String(part || "").trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function styleMatchScore(title, styleTag) {
  const text = String(title || "").toLowerCase();
  const { match } = styleProfile(styleTag);
  if (!match.length) return 0;
  return match.reduce((score, keyword) => (
    text.includes(String(keyword).toLowerCase()) ? score + 1 : score
  ), 0);
}

function rankItemsForStyle(items, styleTag) {
  return [...items].sort((a, b) => {
    const scoreDiff = styleMatchScore(b.name, styleTag) - styleMatchScore(a.name, styleTag);
    if (scoreDiff !== 0) return scoreDiff;
    return 0;
  });
}

/** Prefer products whose titles actually mention the style; keep a soft fallback if none do. */
function preferStyleMatched(items, styleTag) {
  const ranked = rankItemsForStyle(items, styleTag);
  const matched = ranked.filter((item) => styleMatchScore(item.name, styleTag) > 0);
  return matched.length >= 2 ? matched : ranked;
}

function categoriesForRoomType(roomType) {
  const t = String(roomType || "").toLowerCase();
  if (t.includes("bed")) return BEDROOM;
  if (t.includes("kitchen")) return KITCHEN;
  if (t.includes("bath")) return BATHROOM;
  if (t.includes("office") || t.includes("study")) return HOME_OFFICE;
  if (t.includes("dining")) return DINING_ROOM;
  if (t.includes("nursery") || t.includes("baby")) return NURSERY;
  return LIVING_ROOM;
}

function pickBathFixture(features = []) {
  const normalized = features.map((f) => String(f || "").trim().toLowerCase());
  const wantsShower = normalized.some((f) => f.includes("standing shower") || f.includes("walk-in shower") || f.includes("walk in shower"));
  const wantsTub = normalized.some((f) => f.includes("bathtub") || f.includes("bath tub"));
  if (wantsShower && !wantsTub) return STANDING_SHOWER;
  return BATHTUB;
}

/** Bathroom always gets a tub or standing shower + a straight shower curtain. */
function withBathroomFixture(baseCategories, roomType, features = []) {
  if (!String(roomType || "").toLowerCase().includes("bath")) return baseCategories;
  const fixture = pickBathFixture(features);
  const withoutFixtures = baseCategories.filter(
    (c) => c.key !== "bathtub" && c.key !== "standing_shower" && c.key !== "shower_curtain"
  );
  return [
    ...withoutFixtures,
    fixture,
    { key: "shower_curtain", product: "shower curtain" },
  ];
}

function categoriesForFeatures(features, baseCategories, roomType = "") {
  const existing = new Set(baseCategories.map((category) => category.key));
  // Bath fixtures are handled by withBathroomFixture — don't double-add.
  const skip = new Set(["bathtub", "bath tub", "standing shower", "walk-in shower", "walk in shower"]);
  const extras = features
    .map((feature) => String(feature || "").trim().toLowerCase())
    .filter((feature) => !skip.has(feature))
    .map((feature) => FEATURE_CATEGORIES[feature])
    .filter((category) => category && !existing.has(category.key));

  // Bedrooms get overcrowded fast — keep at most two accents, prefer small
  // pieces, and never ship a cluster of chairs.
  if (String(roomType || "").toLowerCase().includes("bed")) {
    const seating = new Set(["reading_nook", "accent_chair", "rocking_chair"]);
    const large = new Set(["wardrobe", "workspace_desk", "vanity_station", "bookcase"]);
    const smallOrder = [
      "indoor_plants",
      "wall_art",
      "full_length_mirror",
      "floating_shelves",
      "smart_lighting",
    ];
    const picked = [];
    const seat = extras.find((c) => seating.has(c.key));
    if (seat) picked.push(seat);
    const big = extras.find((c) => large.has(c.key));
    // Prefer a chair corner over another bulky cabinet when we already have a dresser.
    if (big && picked.length < 2 && !seat) picked.push(big);
    for (const key of smallOrder) {
      if (picked.length >= 2) break;
      const match = extras.find((c) => c.key === key);
      if (match) picked.push(match);
    }
    return picked;
  }

  return extras;
}

function parsePrice(raw) {
  if (!raw) return 0;
  const match = String(raw).replace(/,/g, "").match(/[\d.]+/);
  return match ? Math.round(parseFloat(match[0])) : 0;
}

function parseDimensionInches(value, unit) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  const normalizedUnit = String(unit || "").toLowerCase();
  if (normalizedUnit === "'" || normalizedUnit.startsWith("ft") || normalizedUnit.startsWith("feet")) {
    return amount * 12;
  }
  if (normalizedUnit.startsWith("cm")) return amount / 2.54;
  return amount;
}

function parseProductDimensions(title) {
  const text = String(title || "").replace(/×/g, "x");
  const match = text.match(
    /(\d+(?:\.\d+)?)\s*(in(?:ch(?:es)?)?|"|'|ft|feet|cm)?\s*(?:w(?:ide)?\s*)?x\s*(\d+(?:\.\d+)?)\s*(in(?:ch(?:es)?)?|"|'|ft|feet|cm)(?![a-z])/i
  );
  if (!match) return {};

  const sharedUnit = match[2] || match[4];
  const widthIn = parseDimensionInches(match[1], sharedUnit);
  const depthIn = parseDimensionInches(match[3], match[4] || sharedUnit);
  if (
    !Number.isFinite(widthIn) ||
    !Number.isFinite(depthIn) ||
    widthIn < 4 ||
    depthIn < 4 ||
    widthIn > 240 ||
    depthIn > 240
  ) {
    return {};
  }
  return { widthIn: Math.round(widthIn), depthIn: Math.round(depthIn) };
}

/**
 * Pick one product per category whose combined price is closest to the user's
 * budget. The selected item is moved to the front of each category so the
 * existing frontend slot initialization uses the optimized combination while
 * still retaining alternatives for Swap.
 */
function orderFurnitureForBudget(categoryGroups, budgetTotal) {
  if (!Number.isFinite(budgetTotal) || budgetTotal <= 0) {
    return categoryGroups.flat();
  }

  let states = [{ total: 0, picks: [] }];
  categoryGroups.forEach((group) => {
    const priced = group.filter((item) => item.price > 0);
    const options = priced.length > 0 ? priced : group.slice(0, 1);
    const byTotal = new Map();

    states.forEach((state) => {
      options.forEach((item) => {
        const total = state.total + Math.max(0, item.price);
        if (!byTotal.has(total)) {
          byTotal.set(total, { total, picks: [...state.picks, item] });
        }
      });
    });

    states = [...byTotal.values()];
    if (states.length > 5000) {
      states.sort((a, b) =>
        Math.abs(a.total - budgetTotal) - Math.abs(b.total - budgetTotal)
      );
      states = states.slice(0, 5000);
    }
  });

  const best = states.reduce((closest, candidate) =>
    Math.abs(candidate.total - budgetTotal) < Math.abs(closest.total - budgetTotal)
      ? candidate
      : closest
  );
  const selectedIds = new Map(best.picks.map((item) => [item.category, item.id]));

  console.log(
    "[furniture] budget=",
    budgetTotal,
    "selectedTotal=",
    best.total,
    "difference=",
    best.total - budgetTotal
  );

  return categoryGroups.flatMap((group) => {
    const selectedId = selectedIds.get(group[0]?.category);
    return [...group].sort((a, b) =>
      Number(b.id === selectedId) - Number(a.id === selectedId)
    );
  });
}

async function searchCategory(styleTag, roomType, cat) {
  const style = normalizeStyleTag(styleTag);
  const product = cat.product || cat.key;
  // Never search without the style — generic results are why rooms look off-style.
  const queries = [
    buildFurnitureQuery(style, roomType, product),
    buildFurnitureQuery(style, roomType, product, { short: true }),
    `${styleProfile(style).phrase} ${product}`,
  ].filter((q, i, arr) => q && arr.indexOf(q) === i);

  let lastError = null;
  for (const q of queries) {
    try {
      const response = await axios.post(
        "https://google.serper.dev/shopping",
        { q, num: 12, gl: "us" },
        {
          headers: {
            "X-API-KEY": process.env.SERPER_API_KEY,
            "Content-Type": "application/json",
          },
          timeout: 10000,
        }
      );

      const items = response.data.shopping || [];
      const mapped = items
        .map((item) => ({
          ...item,
          resolvedImageUrl: item.imageUrl || item.thumbnail || item.image || "",
          resolvedLink: item.link || item.productLink || "",
        }))
        .filter((item) => item.resolvedImageUrl && item.resolvedLink)
        .slice(0, 10)
        .map((item, i) => {
          const dimensions = parseProductDimensions(item.title);
          return {
            id:       `${cat.key}-${i}`,
            name:     item.title,
            category: cat.key,
            brand:    item.source || "",
            price:    parsePrice(item.price),
            imageUrl: item.resolvedImageUrl,
            buyUrl:   item.resolvedLink,
            styleTag: style,
            ...dimensions,
          };
        });

      if (mapped.length > 0) {
        return preferStyleMatched(mapped, style).slice(0, 6);
      }
    } catch (error) {
      lastError = error;
      const status = error.response?.status;
      const detail = error.response?.data?.message || error.message;
      console.error(`[furniture] Serper ${cat.key} q="${q}" failed:`, status || "", detail || "");
    }
  }

  console.warn(`[furniture] using style fallback catalog for ${cat.key} (${style})`, lastError?.response?.data?.message || lastError?.message || "");
  return fallbackItemsForCategory(cat, style);
}

/**
 * Curated style catalogs used when Serper is unavailable.
 * Names, materials, tones, and images are chosen to read as that style — not generic blanks.
 */
const STYLE_TONES = {
  bohemian: ["#C4785A", "#C9A66B", "#6B7F5A", "#8B5E3C"],
  scandinavian: ["#D8CBB8", "#C4A574", "#F0E6D8", "#A8B5A0"],
  modern: ["#6B5B4F", "#2C2C2C", "#C4A574", "#8A8A8A"],
  minimalist: ["#F0E6D8", "#D8CBB8", "#C4A574", "#8A8A8A"],
  industrial: ["#4A3728", "#2C2C2C", "#8A8A8A", "#5C4033"],
  coastal: ["#F0E6D8", "#5B7C99", "#D8CBB8", "#C4A574"],
  farmhouse: ["#B8956C", "#D2B48C", "#F0E6D8", "#6B5B4F"],
  traditional: ["#6B3A2A", "#C4A035", "#8B7355", "#D4C4A8"],
  "mid-century modern": ["#5C4033", "#C4785A", "#C4A574", "#6B4C6B"],
  maximalist: ["#C4785A", "#6B4C6B", "#C4A035", "#2C3E6B"],
  "art deco": ["#2C2C2C", "#C4A035", "#6B3A2A", "#D8CBB8"],
};

const STYLE_FALLBACK = {
  bohemian: {
    label: "Bohemian",
    brand: "Boho Collective",
    finishes: ["rattan", "carved mango wood", "kilim terracotta", "macramé cream"],
    images: {
      bed: "https://images.unsplash.com/photo-1616594039964-ae9021a400a0?auto=format&fit=crop&q=80&w=800",
      nightstand: "https://images.unsplash.com/photo-1594026112284-02bb6f3352cd?auto=format&fit=crop&q=80&w=800",
      dresser: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&q=80&w=800",
      bedroom_rug: "https://images.unsplash.com/photo-1600166898405-da9535204843?auto=format&fit=crop&q=80&w=800",
      bedside_lamp: "https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&q=80&w=800",
      wardrobe: "https://images.unsplash.com/photo-1595428774223-ef52624120d2?auto=format&fit=crop&q=80&w=800",
      sofa: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&q=80&w=800",
      accent_chair: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&q=80&w=800",
      coffee_table: "https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&q=80&w=800",
      rug: "https://images.unsplash.com/photo-1600166898405-da9535204843?auto=format&fit=crop&q=80&w=800",
      floor_lamp: "https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&q=80&w=800",
      side_table: "https://images.unsplash.com/photo-1594026112284-02bb6f3352cd?auto=format&fit=crop&q=80&w=800",
      reading_nook: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&q=80&w=800",
      indoor_plants: "https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&q=80&w=800",
      wall_art: "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?auto=format&fit=crop&q=80&w=800",
    },
  },
  scandinavian: {
    label: "Scandinavian",
    brand: "Nordic Home",
    finishes: ["light oak", "blond ash", "linen", "matte white"],
    images: {
      bed: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&q=80&w=800",
      nightstand: "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?auto=format&fit=crop&q=80&w=800",
      dresser: "https://images.unsplash.com/photo-1595428774223-ef52624120d2?auto=format&fit=crop&q=80&w=800",
      bedroom_rug: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&q=80&w=800",
      bedside_lamp: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&q=80&w=800",
      sofa: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&q=80&w=800",
      accent_chair: "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&q=80&w=800",
    },
  },
  modern: {
    label: "Modern",
    brand: "Line Forma",
    finishes: ["sleek walnut", "matte black", "polished chrome", "low-profile"],
    images: {
      bed: "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&q=80&w=800",
      nightstand: "https://images.unsplash.com/photo-1615529328331-f8917597711f?auto=format&fit=crop&q=80&w=800",
      dresser: "https://images.unsplash.com/photo-1594620302200-9a7622441566?auto=format&fit=crop&q=80&w=800",
      bedroom_rug: "https://images.unsplash.com/photo-1600166898405-da9535204843?auto=format&fit=crop&q=80&w=800",
      bedside_lamp: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&q=80&w=800",
      sofa: "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?auto=format&fit=crop&q=80&w=800",
    },
  },
  minimalist: {
    label: "Minimalist",
    brand: "Quiet Form",
    finishes: ["simple oak", "off-white", "uncluttered", "soft gray"],
    images: {
      bed: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&q=80&w=800",
      nightstand: "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?auto=format&fit=crop&q=80&w=800",
      dresser: "https://images.unsplash.com/photo-1595428774223-ef52624120d2?auto=format&fit=crop&q=80&w=800",
      bedroom_rug: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&q=80&w=800",
      bedside_lamp: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&q=80&w=800",
    },
  },
  industrial: {
    label: "Industrial",
    brand: "Loft Works",
    finishes: ["reclaimed wood", "black pipe", "raw steel", "factory"],
    images: {
      bed: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&q=80&w=800",
      nightstand: "https://images.unsplash.com/photo-1532372320572-cda25653a26d?auto=format&fit=crop&q=80&w=800",
      dresser: "https://images.unsplash.com/photo-1558997519-83ea9252edf8?auto=format&fit=crop&q=80&w=800",
      bedside_lamp: "https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&q=80&w=800",
    },
  },
  coastal: {
    label: "Coastal",
    brand: "Shore House",
    finishes: ["whitewashed", "sea-glass", "linen", "weathered oak"],
    images: {
      bed: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&q=80&w=800",
      nightstand: "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?auto=format&fit=crop&q=80&w=800",
      bedroom_rug: "https://images.unsplash.com/photo-1600166898405-da9535204843?auto=format&fit=crop&q=80&w=800",
      dresser: "https://images.unsplash.com/photo-1595428774223-ef52624120d2?auto=format&fit=crop&q=80&w=800",
    },
  },
  farmhouse: {
    label: "Farmhouse",
    brand: "Barn & Beam",
    finishes: ["distressed pine", "shiplap", "iron hardware", "warm oak"],
    images: {
      bed: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&q=80&w=800",
      nightstand: "https://images.unsplash.com/photo-1532372320572-cda25653a26d?auto=format&fit=crop&q=80&w=800",
      dresser: "https://images.unsplash.com/photo-1594620302200-9a7622441566?auto=format&fit=crop&q=80&w=800",
      bedroom_rug: "https://images.unsplash.com/photo-1600166898405-da9535204843?auto=format&fit=crop&q=80&w=800",
    },
  },
  traditional: {
    label: "Traditional",
    brand: "Heritage Atelier",
    finishes: ["cherry wood", "tufted", "brass accent", "classic"],
    images: {
      bed: "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&q=80&w=800",
      nightstand: "https://images.unsplash.com/photo-1615529328331-f8917597711f?auto=format&fit=crop&q=80&w=800",
      dresser: "https://images.unsplash.com/photo-1594620302200-9a7622441566?auto=format&fit=crop&q=80&w=800",
    },
  },
  "mid-century modern": {
    label: "Mid-Century Modern",
    brand: "Era Studio",
    finishes: ["walnut", "tapered-leg oak", "retro teak", "sculptural"],
    images: {
      bed: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&q=80&w=800",
      nightstand: "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?auto=format&fit=crop&q=80&w=800",
      dresser: "https://images.unsplash.com/photo-1595428774223-ef52624120d2?auto=format&fit=crop&q=80&w=800",
      accent_chair: "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&q=80&w=800",
    },
  },
  maximalist: {
    label: "Maximalist",
    brand: "Bold Room",
    finishes: ["velvet jewel", "patterned bold", "brass statement", "colorful"],
    images: {
      bed: "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&q=80&w=800",
      sofa: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&q=80&w=800",
      accent_chair: "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&q=80&w=800",
    },
  },
  "art deco": {
    label: "Art Deco",
    brand: "Gilded Line",
    finishes: ["brass geometric", "black lacquer", "velvet glam", "mirrored"],
    images: {
      bed: "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&q=80&w=800",
      nightstand: "https://images.unsplash.com/photo-1615529328331-f8917597711f?auto=format&fit=crop&q=80&w=800",
      dresser: "https://images.unsplash.com/photo-1594620302200-9a7622441566?auto=format&fit=crop&q=80&w=800",
    },
  },
};

const GENERIC_FALLBACK_IMAGES = {
  bed: "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&q=80&w=800",
  nightstand: "https://images.unsplash.com/photo-1615529328331-f8917597711f?auto=format&fit=crop&q=80&w=800",
  dresser: "https://images.unsplash.com/photo-1594620302200-9a7622441566?auto=format&fit=crop&q=80&w=800",
  bedroom_rug: "https://images.unsplash.com/photo-1600166898405-da9535204843?auto=format&fit=crop&q=80&w=800",
  bedside_lamp: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&q=80&w=800",
  wardrobe: "https://images.unsplash.com/photo-1558997519-83ea9252edf8?auto=format&fit=crop&q=80&w=800",
  sofa: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&q=80&w=800",
  coffee_table: "https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&q=80&w=800",
  rug: "https://images.unsplash.com/photo-1600166898405-da9535204843?auto=format&fit=crop&q=80&w=800",
  floor_lamp: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&q=80&w=800",
  accent_chair: "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&q=80&w=800",
  side_table: "https://images.unsplash.com/photo-1532372320572-cda25653a26d?auto=format&fit=crop&q=80&w=800",
  reading_nook: "https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?auto=format&fit=crop&q=80&w=800",
  desk: "https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?auto=format&fit=crop&q=80&w=800",
  office_chair: "https://images.unsplash.com/photo-1505843490701-5be5d0b19d58?auto=format&fit=crop&q=80&w=800",
  dining_table: "https://images.unsplash.com/photo-1617806118233-18e1de247200?auto=format&fit=crop&q=80&w=800",
  dining_chair: "https://images.unsplash.com/photo-1503602642458-232111445657?auto=format&fit=crop&q=80&w=800",
  vanity: "https://images.unsplash.com/photo-1620626011761-996317b8d101?auto=format&fit=crop&q=80&w=800",
  indoor_plants: "https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&q=80&w=800",
  wall_art: "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?auto=format&fit=crop&q=80&w=800",
};

const FALLBACK_PRICES = {
  bed: 890, nightstand: 160, dresser: 520, bedroom_rug: 240, bedside_lamp: 75, wardrobe: 680,
  sofa: 980, coffee_table: 220, rug: 260, floor_lamp: 120, accent_chair: 340, side_table: 140,
  reading_nook: 360, desk: 420, office_chair: 210, dining_table: 640, dining_chair: 150,
  vanity: 480, indoor_plants: 45, wall_art: 90, bathtub: 1100, standing_shower: 900,
  shower_curtain: 35, bath_mat: 30, bath_mirror: 80, bath_storage: 120, bath_light: 70,
};

function fallbackItemsForCategory(cat, styleTag) {
  const style = normalizeStyleTag(styleTag);
  const catalog = STYLE_FALLBACK[style] || {
    label: style.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
    brand: "BluPrint Picks",
    finishes: [style, "curated", "signature"],
    images: {},
  };
  const tones = STYLE_TONES[style] || STYLE_TONES.modern;
  const productLabel = String(cat.product || cat.key)
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  const basePrice = FALLBACK_PRICES[cat.key] || 180;
  const imageUrl = catalog.images[cat.key]
    || GENERIC_FALLBACK_IMAGES[cat.key]
    || GENERIC_FALLBACK_IMAGES.accent_chair;

  return [0, 1, 2].map((i) => {
    const finish = catalog.finishes[i % catalog.finishes.length];
    return {
      id: `${cat.key}-${style}-fallback-${i}`,
      // Lead with the style label so cards + ranking clearly read on-style.
      name: `${catalog.label} ${finish} ${productLabel}`,
      category: cat.key,
      brand: catalog.brand,
      price: Math.round(basePrice * (1 + i * 0.12)),
      imageUrl,
      buyUrl: `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(`${catalog.label} ${finish} ${cat.product || cat.key}`)}`,
      styleTag: style,
      color: tones[i % tones.length],
    };
  });
}

// GET /api/rooms/:roomId/furniture?styleTag=minimalist&roomType=bedroom
router.get("/:roomId/furniture", async (req, res) => {
  if (!process.env.SERPER_API_KEY) {
    console.warn("[furniture] SERPER_API_KEY missing — using fallback catalog only");
  }

  const hasBudgetParam = Object.prototype.hasOwnProperty.call(req.query, "budgetTotal");
  let budgetTotal = Number(req.query.budgetTotal);
  let roomType = String(req.query.roomType || "").trim();
  let styleTag = String(req.query.styleTag || "").trim();
  let roomFeatures = (Array.isArray(req.query.roomFeature)
    ? req.query.roomFeature
    : [req.query.roomFeature])
    .map((feature) => String(feature || "").trim())
    .filter(Boolean);

  try {
    const [userStyle, aiStyle, room] = await Promise.all([
      Style.findOne({ roomId: req.params.roomId, source: "user" }),
      Style.findOne({ roomId: req.params.roomId, source: "ai" }),
      Room.findById(req.params.roomId).select("budgetTotal"),
    ]);
    if (!roomType) {
      roomType = userStyle?.roomType || aiStyle?.roomType || "living room";
    }
    // User-picked style wins so Bohemian stays Bohemian even if AI guessed otherwise.
    // Fall back to the request, then the AI image analysis.
    styleTag = normalizeStyleTag(
      userStyle?.styleTag || styleTag || aiStyle?.styleTag || "modern"
    );
    // The saved user selections are authoritative. Union them with the query
    // so an AI response or stale browser state can never drop requested items.
    roomFeatures = [...new Set([
      ...(userStyle?.roomFeatures || []),
      ...roomFeatures,
    ].map((feature) => String(feature || "").trim()).filter(Boolean))];
    if (!hasBudgetParam && room?.budgetTotal > 0) {
      budgetTotal = room.budgetTotal;
    }
  } catch {
    if (!roomType) roomType = "living room";
    styleTag = normalizeStyleTag(styleTag || "modern");
  }

  styleTag = normalizeStyleTag(styleTag || "modern");

  const baseCategories = withBathroomFixture(
    categoriesForRoomType(roomType),
    roomType,
    roomFeatures,
  );
  const categories = [
    ...baseCategories,
    ...categoriesForFeatures(roomFeatures, baseCategories, roomType),
  ];
  console.log(
    "[furniture] roomType=",
    roomType,
    "styleTag=",
    styleTag,
    "queryExample=",
    buildFurnitureQuery(styleTag, roomType, categories[0]?.product || "furniture"),
    "features=",
    roomFeatures.join(","),
    "categories=",
    categories.map((c) => c.key).join(",")
  );

  const results = await Promise.allSettled(
    categories.map((cat) => searchCategory(styleTag, roomType, cat))
  );
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      const status = result.reason?.response?.status;
      const detail = result.reason?.response?.data?.message || result.reason?.message;
      console.error(`[furniture] Serper ${categories[index].key} failed:`, status || "", detail || "");
    }
  });

  const categoryGroups = results
    .map((result, index) => {
      if (result.status === "fulfilled" && result.value.length > 0) return result.value;
      // Guaranteed local stand-ins so the planner never renders an empty room.
      return fallbackItemsForCategory(categories[index], styleTag);
    })
    .filter((group) => group.length > 0);
  const furniture = orderFurnitureForBudget(categoryGroups, budgetTotal);

  if (furniture.length === 0) {
    return res.status(502).json({ error: "Furniture search returned no results" });
  }

  res.json(furniture);
});

module.exports = router;
