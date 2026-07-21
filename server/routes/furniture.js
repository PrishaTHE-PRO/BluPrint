const express = require("express");
const axios   = require("axios");
const Style   = require("../models/Style");
const Room    = require("../models/Room");

const router = express.Router();

const LIVING_ROOM = [
  { key: "sofa",         query: (s) => `${s} sofa` },
  { key: "coffee_table", query: (s) => `${s} coffee table` },
  { key: "rug",          query: (s) => `${s} area rug` },
  { key: "floor_lamp",   query: (s) => `${s} floor lamp` },
  { key: "accent_chair", query: (s) => `${s} accent chair` },
  { key: "side_table",   query: (s) => `${s} side table` },
];

const BEDROOM = [
  { key: "bed",          query: (s) => `${s} bed frame` },
  { key: "nightstand",   query: (s) => `${s} nightstand` },
  { key: "dresser",      query: (s) => `${s} dresser` },
  { key: "bedroom_rug",  query: (s) => `${s} area rug` },
  { key: "wardrobe",     query: (s) => `${s} wardrobe` },
  { key: "bedside_lamp", query: (s) => `${s} bedside lamp` },
];

const KITCHEN = [
  { key: "island_cart",     query: (s) => `${s} kitchen island cart` },
  { key: "bar_stool",       query: (s) => `${s} bar stool` },
  { key: "kitchen_rug",     query: (s) => `${s} kitchen runner rug` },
  { key: "kitchen_storage", query: (s) => `${s} kitchen storage cabinet` },
  { key: "kitchen_shelf",   query: (s) => `${s} kitchen shelf` },
  { key: "pendant_light",   query: (s) => `${s} pendant light` },
];

const BATHROOM = [
  { key: "vanity",         query: (s) => `${s} bathroom vanity` },
  { key: "bath_mirror",    query: (s) => `${s} bathroom mirror` },
  { key: "bath_storage",   query: (s) => `${s} bathroom storage` },
  { key: "bath_mat",       query: (s) => `${s} bath mat` },
  { key: "bath_light",     query: (s) => `${s} bathroom vanity light` },
  { key: "shower_curtain", query: (s) => `${s} shower curtain` },
];

const HOME_OFFICE = [
  { key: "desk",            query: (s) => `${s} desk` },
  { key: "office_chair",    query: (s) => `${s} office chair` },
  { key: "bookshelf",       query: (s) => `${s} bookshelf` },
  { key: "desk_lamp",       query: (s) => `${s} desk lamp` },
  { key: "storage_cabinet", query: (s) => `${s} storage cabinet` },
  { key: "monitor_stand",   query: (s) => `${s} monitor stand` },
];

const DINING_ROOM = [
  { key: "dining_table", query: (s) => `${s} dining table` },
  { key: "dining_chair", query: (s) => `${s} dining chair` },
  { key: "dining_rug",   query: (s) => `${s} dining room rug` },
  { key: "sideboard",    query: (s) => `${s} sideboard` },
  { key: "dining_light", query: (s) => `${s} dining pendant light` },
  { key: "bar_cabinet",  query: (s) => `${s} bar cabinet` },
];

const NURSERY = [
  { key: "crib",            query: (s) => `${s} crib` },
  { key: "nursery_dresser", query: (s) => `${s} nursery dresser` },
  { key: "rocking_chair",   query: (s) => `${s} rocking chair` },
  { key: "nursery_rug",     query: (s) => `${s} nursery rug` },
  { key: "nursery_shelf",   query: (s) => `${s} nursery shelf` },
  { key: "nursery_lamp",    query: (s) => `${s} nursery lamp` },
];

const FEATURE_CATEGORIES = {
  "reading nook":            { key: "reading_nook",       query: (s) => `${s} reading nook chair` },
  "smart lighting":          { key: "smart_lighting",     query: (s) => `${s} smart home lighting` },
  "floating shelves":        { key: "floating_shelves",   query: (s) => `${s} floating wall shelves` },
  "indoor plants":           { key: "indoor_plants",      query: (s) => `${s} indoor plant with decorative planter` },
  "full-length mirror":      { key: "full_length_mirror", query: (s) => `${s} full length mirror` },
  "wall art / gallery wall": { key: "wall_art",           query: (s) => `${s} wall art set` },
  "accent chair":            { key: "accent_chair",       query: (s) => `${s} accent chair` },
  "workspace desk":          { key: "workspace_desk",     query: (s) => `${s} workspace desk` },
  "vanity station":          { key: "vanity_station",     query: (s) => `${s} vanity table` },
  "bookcase / bookshelves":  { key: "bookcase",           query: (s) => `${s} bookcase` },
};

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

function categoriesForFeatures(features, baseCategories) {
  const existing = new Set(baseCategories.map((category) => category.key));
  return features
    .map((feature) => FEATURE_CATEGORIES[String(feature || "").trim().toLowerCase()])
    .filter((category) => category && !existing.has(category.key));
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

async function searchCategory(styleTag, cat) {
  const response = await axios.post(
    "https://google.serper.dev/shopping",
    { q: cat.query(styleTag), num: 10, gl: "us" },
    {
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    }
  );

  const items = response.data.shopping || [];
  return items
    .map((item) => ({
      ...item,
      resolvedImageUrl: item.imageUrl || item.thumbnail || item.image || "",
      resolvedLink: item.link || item.productLink || "",
    }))
    .filter((item) => item.resolvedImageUrl && item.resolvedLink)
    .slice(0, 6)
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
        ...dimensions,
      };
    });
}

// GET /api/rooms/:roomId/furniture?styleTag=minimalist&roomType=bedroom
router.get("/:roomId/furniture", async (req, res) => {
  if (!process.env.SERPER_API_KEY) {
    return res.status(500).json({ error: "SERPER_API_KEY not configured" });
  }

  const styleTag = String(req.query.styleTag || "modern").trim().toLowerCase();
  const hasBudgetParam = Object.prototype.hasOwnProperty.call(req.query, "budgetTotal");
  let budgetTotal = Number(req.query.budgetTotal);
  let roomType = String(req.query.roomType || "").trim();
  let roomFeatures = (Array.isArray(req.query.roomFeature)
    ? req.query.roomFeature
    : [req.query.roomFeature])
    .map((feature) => String(feature || "").trim())
    .filter(Boolean);

  try {
    const [userStyle, room] = await Promise.all([
      Style.findOne({ roomId: req.params.roomId, source: "user" }),
      Room.findById(req.params.roomId).select("budgetTotal"),
    ]);
    if (!roomType) {
      roomType = userStyle?.roomType || "living room";
    }
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
  }

  const baseCategories = categoriesForRoomType(roomType);
  const categories = [
    ...baseCategories,
    ...categoriesForFeatures(roomFeatures, baseCategories),
  ];
  console.log(
    "[furniture] roomType=",
    roomType,
    "features=",
    roomFeatures.join(","),
    "categories=",
    categories.map((c) => c.key).join(",")
  );

  const results = await Promise.allSettled(
    categories.map((cat) => searchCategory(styleTag, cat))
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
