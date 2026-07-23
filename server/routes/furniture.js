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
function buildFurnitureQuery(styleTag, roomType, product) {
  const style = styleProfile(styleTag);
  const room = roomTypeSearchPhrase(roomType);
  const parts = [
    style.phrase,
    room,
    product,
    style.accents,
    "furniture",
  ].map((part) => String(part || "").trim()).filter(Boolean);
  return parts.join(" ").replace(/\s+/g, " ").trim();
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
  const q = buildFurnitureQuery(styleTag, roomType, cat.product || cat.key);
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
    .slice(0, 8)
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
        styleTag: normalizeStyleTag(styleTag),
        ...dimensions,
      };
    });

  return rankItemsForStyle(mapped, styleTag).slice(0, 6);
}

// GET /api/rooms/:roomId/furniture?styleTag=minimalist&roomType=bedroom
router.get("/:roomId/furniture", async (req, res) => {
  if (!process.env.SERPER_API_KEY) {
    return res.status(500).json({ error: "SERPER_API_KEY not configured" });
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
    .filter((result) => result.status === "fulfilled" && result.value.length > 0)
    .map((result) => result.value);
  const furniture = orderFurnitureForBudget(categoryGroups, budgetTotal);

  if (furniture.length === 0) {
    return res.status(502).json({ error: "Furniture search returned no results" });
  }

  res.json(furniture);
});

module.exports = router;
