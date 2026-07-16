const express = require("express");
const axios   = require("axios");
const Style   = require("../models/Style");

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

function parsePrice(raw) {
  if (!raw) return 0;
  const match = String(raw).replace(/,/g, "").match(/[\d.]+/);
  return match ? Math.round(parseFloat(match[0])) : 0;
}

async function searchCategory(styleTag, cat) {
  const response = await axios.post(
    "https://google.serper.dev/shopping",
    { q: cat.query(styleTag), num: 4, gl: "us" },
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
    .slice(0, 3)
    .map((item, i) => ({
      id:       `${cat.key}-${i}`,
      name:     item.title,
      category: cat.key,
      brand:    item.source || "",
      price:    parsePrice(item.price),
      imageUrl: item.resolvedImageUrl,
      buyUrl:   item.resolvedLink,
    }));
}

// GET /api/rooms/:roomId/furniture?styleTag=minimalist&roomType=bedroom
router.get("/:roomId/furniture", async (req, res) => {
  if (!process.env.SERPER_API_KEY) {
    return res.status(500).json({ error: "SERPER_API_KEY not configured" });
  }

  const styleTag = String(req.query.styleTag || "modern").trim().toLowerCase();
  let roomType   = String(req.query.roomType || "").trim();

  if (!roomType) {
    try {
      const userStyle = await Style.findOne({ roomId: req.params.roomId, source: "user" });
      roomType = userStyle?.roomType || "living room";
    } catch {
      roomType = "living room";
    }
  }

  const categories = categoriesForRoomType(roomType);
  console.log("[furniture] roomType=", roomType, "categories=", categories.map((c) => c.key).join(","));

  const results = await Promise.allSettled(
    categories.map((cat) => searchCategory(styleTag, cat))
  );

  const furniture = results.flatMap((r) =>
    r.status === "fulfilled" ? r.value : []
  );

  if (furniture.length === 0) {
    return res.status(502).json({ error: "Furniture search returned no results" });
  }

  res.json(furniture);
});

module.exports = router;
