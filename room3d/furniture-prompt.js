// furniture-prompt.js
// A tightened, STRUCTURED furniture-recommendation prompt for GPT-4o.
// Instead of GPT returning loose prose, it returns validated JSON: real picks
// with dimensions, style tags, price, priority, and a shopping query you can
// feed straight into your existing Serper search in server/routes/furniture.js.
//
// Flow that works well with your current code:
//   1. GPT proposes WHAT to buy (category + style + target dims + budget split).
//   2. Serper fetches the actual product (price, image, buy link) per query.
//   3. Match Serper results back to each pick; keep GPT's dims for 3D scale.
//
// Allowed categories = the keys in furniture-catalog.js.

export const ALLOWED_CATEGORIES = [
  'sofa','coffee_table','rug','floor_lamp','accent_chair','side_table',
  'bed','nightstand','bedroom_rug','bedside_lamp','dresser',
  'island_cart','bar_stool','kitchen_rug','kitchen_storage','kitchen_shelf','pendant_light',
  'vanity','bath_mirror','bath_storage','bath_mat','bath_light','shower_curtain','bathtub','standing_shower',
  'desk','office_chair','bookshelf','desk_lamp','storage_cabinet','monitor_stand',
  'dining_table','dining_chair','dining_rug','sideboard','dining_light','bar_cabinet',
  'crib','nursery_dresser','rocking_chair','nursery_rug','nursery_shelf','nursery_lamp',
  'reading_nook','smart_lighting','floating_shelves','indoor_plants','full_length_mirror','wall_art','workspace_desk','vanity_station',
];

export const SYSTEM_PROMPT = `You are BluPrint's interior designer. Given a room's type, dimensions, chosen style, budget, and inspiration cues, choose a cohesive furniture set that FITS the room physically and stays within budget.

Rules:
- Only use category keys from the provided allowed list.
- Respect the room footprint: total furniture should leave ~30in walkways and never exceed the floor area. Prefer fewer, well-scaled pieces over clutter.
- Give realistic real-world dimensions in INCHES for each pick (width along wall, depth, height).
- Split the budget sensibly across pieces; anchor pieces (bed/sofa/table) get the larger share.
- style_tags must reflect the requested style so product search returns on-style items.
- search_query is a concise shopping phrase (style + product) for a shopping API.
Return ONLY JSON matching the schema. No commentary.`;

// JSON schema for OpenAI Structured Outputs (response_format: json_schema).
export const RESPONSE_SCHEMA = {
  name: 'furniture_plan',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['picks', 'budget_used_usd'],
    properties: {
      budget_used_usd: { type: 'number' },
      picks: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['category', 'label', 'dimensions_in', 'style_tags', 'est_price_usd', 'priority', 'search_query', 'rationale'],
          properties: {
            category: { type: 'string', enum: ALLOWED_CATEGORIES },
            label: { type: 'string' },
            dimensions_in: {
              type: 'object', additionalProperties: false,
              required: ['w', 'd', 'h'],
              properties: { w: { type: 'number' }, d: { type: 'number' }, h: { type: 'number' } },
            },
            style_tags: { type: 'array', items: { type: 'string' } },
            est_price_usd: { type: 'number' },
            priority: { type: 'integer', description: '1 = anchor/must-have, higher = optional' },
            search_query: { type: 'string' },
            rationale: { type: 'string' },
          },
        },
      },
    },
  },
};

// Build the user message from a room.
export function buildUserPrompt({ roomType, widthFt, lengthFt, heightFt, style, budgetTotal, features = [] }) {
  return [
    `Room type: ${roomType}`,
    `Dimensions: ${widthFt} ft wide x ${lengthFt} ft long x ${heightFt} ft high (${Math.round(widthFt * lengthFt)} sq ft)`,
    `Style: ${style}`,
    `Budget: ${budgetTotal ? '$' + budgetTotal : 'flexible'}`,
    features.length ? `Requested features: ${features.join(', ')}` : '',
    `Allowed categories: ${ALLOWED_CATEGORIES.join(', ')}`,
  ].filter(Boolean).join('\n');
}

// Example call (Node, in your server). Uncomment and wire your key.
// import OpenAI from 'openai';
// const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
// export async function planFurniture(room) {
//   const r = await openai.chat.completions.create({
//     model: 'gpt-4o',
//     messages: [
//       { role: 'system', content: SYSTEM_PROMPT },
//       { role: 'user', content: buildUserPrompt(room) },
//     ],
//     response_format: { type: 'json_schema', json_schema: RESPONSE_SCHEMA },
//   });
//   return JSON.parse(r.choices[0].message.content); // { picks:[...], budget_used_usd }
// }
