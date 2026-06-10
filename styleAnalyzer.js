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

export async function analyzeImages(imageUrls) {
  const prompt = buildPrompt();

  // OpenAI call here
}
