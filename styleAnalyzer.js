// services/styleAnalyzer.js

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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

styleTag:
Choose one:
minimalist
modern
boho
industrial
scandinavian
maximalist
coastal
rustic
transitional
art-deco

moodTags:
3-5 tags

colorPalette:
5 dominant hex colors

roomFeatures:
reading nook
shelving
plants
smart lighting
accent wall

confidence:
0-1
`;
}

// openAI call
export async function analyzeImages(imageUrls) {
  const prompt = buildPrompt();

  export async function analyzeImages(imageUrls) {
  const prompt = buildPrompt();

  const imageContent = imageUrls.map(url => ({
    type: "image_url",
    image_url: { url, detail: "high" }
  }));

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1000,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: prompt },
        ...imageContent
      ]
    }]
  });

  const raw = response.choices[0].message.content;
  // Strip markdown code fences if GPT wraps it in ```json
  const cleaned = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}
}
