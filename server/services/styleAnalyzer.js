const axios = require("axios");

const DEFAULT_MODEL = "gpt-4o";

function buildPrompt() {
  return `
Analyze these room inspiration images for interior design style.
Return only valid JSON with this exact shape:
{
  "styleTag": "",
  "moodTags": [],
  "colorPalette": [],
  "roomFeatures": [],
  "confidence": 0
}

styleTag must be one of:
minimalist, modern, boho, industrial, scandinavian,
maximalist, coastal, rustic, transitional, art-deco

moodTags: 3-5 short tags
colorPalette: 5 dominant hex colors
roomFeatures: 3-6 visible features, such as reading nook, shelving, plants, smart lighting, accent wall
confidence: number from 0 to 1
`;
}

function stripJsonFence(value) {
  return String(value || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function parseAnalysisJson(content) {
  const cleaned = stripJsonFence(content);
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const jsonStart = cleaned.indexOf("{");
    const jsonEnd = cleaned.lastIndexOf("}");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      return JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
    }
    throw error;
  }
}

function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function normalizeHex(value) {
  const raw = typeof value === "string" ? value : value && value.hex;
  if (!raw) return null;
  const match = String(raw).trim().match(/^#?[0-9a-f]{6}$/i);
  return match ? (match[0].startsWith("#") ? match[0] : `#${match[0]}`).toUpperCase() : null;
}

function normalizeConfidence(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  if (parsed > 1) return Math.max(0, Math.min(parsed / 100, 1));
  return Math.max(0, Math.min(parsed, 1));
}

function normalizeAnalysis(analysis) {
  return {
    styleTag: String(analysis.styleTag || "").trim().toLowerCase(),
    moodTags: asStringArray(analysis.moodTags),
    colorPalette: Array.isArray(analysis.colorPalette)
      ? analysis.colorPalette.map(normalizeHex).filter(Boolean)
      : [],
    roomFeatures: asStringArray(analysis.roomFeatures),
    confidence: normalizeConfidence(analysis.confidence),
  };
}

async function analyzeImages(imageUrls) {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    const error = new Error("No images provided for analysis");
    error.status = 400;
    throw error;
  }

  if (!process.env.OPENAI_API_KEY) {
    const error = new Error("OPENAI_API_KEY is not configured");
    error.status = 500;
    error.code = "OPENAI_KEY_MISSING";
    throw error;
  }

  const content = [
    { type: "text", text: buildPrompt() },
    ...imageUrls.map((url) => ({
      type: "image_url",
      image_url: { url, detail: "high" },
    })),
  ];

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: process.env.OPENAI_STYLE_MODEL || DEFAULT_MODEL,
        response_format: { type: "json_object" },
        max_tokens: 1000,
        messages: [{ role: "user", content }],
      },
      {
        timeout: 60000,
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const raw = response.data.choices?.[0]?.message?.content;
    return normalizeAnalysis(parseAnalysisJson(raw));
  } catch (error) {
    if (error.response) {
      const apiMessage = error.response.data?.error?.message || "OpenAI analysis failed";
      const wrapped = new Error(apiMessage);
      wrapped.status = error.response.status;
      wrapped.code = "OPENAI_REQUEST_FAILED";
      throw wrapped;
    }
    throw error;
  }
}

module.exports = {
  analyzeImages,
  normalizeAnalysis,
  normalizeHex,
};
