const OpenAI = require("openai");

let _openai;
function getClient() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

function buildPrompt() {
  return `
Analyze these room inspiration images.
Return ONLY valid JSON.
{
  "styleTag": "",
  "moodTags": [],
  "colorPalette": [],
  "roomFeatures": [],
  "confidence": 0
}
styleTag: Choose one:
minimalist, modern, boho, industrial, scandinavian, maximalist, coastal, rustic, transitional, art-deco
moodTags: 3-5 tags
colorPalette: 5 dominant hex colors
roomFeatures: reading nook, shelving, plants, smart lighting, accent wall
confidence: 0-1
`;
}

async function analyzeImages(imageUrls) {
  if (!imageUrls || imageUrls.length === 0) {
    throw new Error("No images provided for analysis");
  }

  const imageContent = imageUrls.map(url => ({
    type: "image_url",
    image_url: { url, detail: "high" },
  }));

  const response = await getClient().chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1000,
    messages: [{
      role: "user",
      content: [{ type: "text", text: buildPrompt() }, ...imageContent],
    }],
  });

  const raw     = response.choices[0].message.content;
  const cleaned = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

module.exports = { analyzeImages };
