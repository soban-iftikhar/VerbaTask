/**
 * Qwen LLM service — turns a merchant's free-form WhatsApp text
 * into one structured command. Pure service layer: no Express, no DB.
 *
 * Two interchangeable hosts, selected via LLM_PROVIDER env (no code edits):
 * - groq (default when GROQ_API_KEY is set): free tier, no card, and hosts
 *   current Qwen models (qwen/qwen3.8-27b) via the OpenAI-compatible API.
 * - dashscope: Alibaba Cloud Model Studio — needs an activated key; intl
 *   keys (sk-ws-...) only work on dashscope-intl.aliyuncs.com.
 */
import axios from 'axios';
import { normalizePaymentMethod } from '../constants/paymentMethods.js';

// Alibaba Cloud DashScope — Qwen chat completions. China (dashscope.aliyuncs.com)
// and International (dashscope-intl.aliyuncs.com) are SEPARATE services with
// separate keys — the base URL must match the console the key came from.
// Our key is from Model Studio (International), hence the intl default.

const SYSTEM_PROMPT = `You convert a Pakistani merchant's WhatsApp message (which may be in
English, Urdu script, or Roman Urdu) into exactly one JSON object — no prose, no markdown fences,
JSON only. Pick ONE of these shapes:

1. Logging a sale (customer purchased goods, selling items):
{"type":"log_sale","item":{"name":"<item name as the merchant referred to it>","quantity":<number>},"paymentMethod":"cash"|"easypaisa"|"jazzcash"|"sadapay"|"nayapay"|"raast"|"meezan"|"hbl"|"ubl"|"alfalah"|"mcb"|"faysal"|"allied"|"askari"|"bank","amount":<number or null>}
- Used when an item is SOLD (e.g. "2 chawal cash", "becha", "sold", "furokht", "bechi", "beche", "دیے", "سیل", "2 sugar").
- If the merchant mentions ANY product name without restock words (e.g. "lipton", "chawal", "daal chana", "2 chini", "ek dudh"), it is a sale.
- If quantity is not explicitly stated (e.g. "lipton", "chawal"), default quantity to 1.
- Supported payment methods: cash, easypaisa, jazzcash, sadapay, nayapay, raast, meezan, hbl, ubl, alfalah, mcb, faysal, allied, askari, or generic bank. Default to "cash".

2. Updating inventory / Adding incoming stock (restock/delivery):
{"type":"update_stock","item":{"name":"<item name>","quantity":<number>,"price":<number or null>,"unit":"<unit or null>"},"action":"add"|"set"}
- Used when new stock ARRIVES, goods are received, inventory is added, or stock is updated.
- Common keywords: "maal aya", "aaya", "aayi", "restock", "add stock", "stock update", "added", "delivered", "وصول", "مال آیا", "آئے ہیں", "اسٹاک میں شامل کریں", "نیا مال", "add 50 rice".
- Examples: "maal aya 20 chini" -> {"type":"update_stock","item":{"name":"chini","quantity":20},"action":"add"}
- "add 50 rice price 300" -> {"type":"update_stock","item":{"name":"rice","quantity":50,"price":300},"action":"add"}
- "20 کلو چاول آئے ہیں" -> {"type":"update_stock","item":{"name":"چاول","quantity":20,"unit":"کلو"},"action":"add"}

3. Checking stock of a specific item:
{"type":"check_stock","item":{"name":"<item name>"}}
- Used when the merchant asks how much stock is left of a product.
- Examples: "rice kitna hai", "check stock sugar", "chini ka stock kitna hai", "how much oil left", "چاول کا اسٹاک کتنا ہے".

4. Creating an automation:
{"type":"create_workflow","trigger":"message"|"schedule"|"threshold","condition":{...},"action":{...},"rawInstruction":"<original text>"}

5. Greetings or casual opening (e.g. "assalam o alaikum", "suno", "hello", "hi", "bhai"):
{"type":"greeting","rawText":"<original text>"}

6. Requesting a PDF report (e.g. "send me sales report", "inventory report", "mujhe inventory ki report bhejo", "sales ki report", "short stock report", "رپورٹ بھیجو"):
{"type":"generate_report","reportType":"inventory"|"sales"|"low_stock"|"top_selling"|"expiring"}

7. Anything else where NO product, report, greeting, stock update, or automation can be identified:
{"type":"unknown","rawText":"<original text>"}`;

const BUSINESS_DETAILS_PROMPT = `You extract business details from a merchant's
WhatsApp onboarding message (which may be in English, Urdu, or Roman Urdu). Reply with
exactly one JSON object — no prose, no markdown fences, JSON only:
{"businessName":"<name or null>","businessType":"<general|kiryana|medical|clothing|restaurant|electronics|services|auto|salon or null>","location":"<city/area or null>","sells":"<what they sell or null>"}
Infer businessType from context (e.g. "pharmacy"/"medical store" -> medical, "boutique"/"tailor" -> clothing, "dhaba"/"restaurant" -> restaurant, "cash & carry"/"general store"/"kiryana" -> kiryana, "mobile shop" -> electronics, "workshop"/"garage" -> auto, "parlour"/"salon" -> salon).
Use null for anything the message doesn't clearly state. Never guess or invent details.`;

const INVENTORY_PROMPT = `You parse a merchant's WhatsApp stock list (which may be
in English, Urdu, or Roman Urdu) into line items. Many merchants make phonetic spelling errors (e.g. "rise" or "riece" for Rice, "sugr" or "cheni" for Sugar, "coking oel" for Cooking Oil, "atta" or "aata" for Flour/Atta, "dall" for Daal).
Auto-correct misspelled item names to clean, properly capitalized standard product names (e.g. "Rice", "Sugar", "Cooking Oil", "Atta", "Daal Channa").
Reply with exactly one JSON object — no prose, no markdown fences, JSON only:
{"items":[{"name":"<clean corrected item name>","quantity":<number or 0>,"price":<number or null>,"unit":"<piece|box|kg|litre|bottle|packet|strip|meter etc, or null>"}]}
One entry per distinct item the merchant listed. Quantity means how many units are in stock.
Use quantity 0 and price null when not stated — never invent numbers.`;

const ITEM_RESOLVE_PROMPT = `A merchant said they sold an item. Match it against their
inventory list — names may be in English, Urdu script, or Roman Urdu, and may contain phonetic misspellings (e.g. "rise" or "riece" for Rice, "chawal" or "چاول" for Rice, "cheni" or "sugr" for Sugar, "dal mash" for "Daal Maash").
Match by MEANING, translations, synonyms, and phonetic variants. Reply with exactly
one line and nothing else: either the exact matching inventory name copied character-for-character from the inventory list, or
the word null if nothing in the inventory is a plausible match. Never invent a name.`;

/** Which host the LLM calls go to — env-overridable, defaults to the free path. */
function llmProvider() {
  return process.env.LLM_PROVIDER || (process.env.GROQ_API_KEY ? 'groq' : 'dashscope');
}

/** True when the selected provider actually has a key to call with. */
function llmConfigured() {
  return llmProvider() === 'groq' ? !!process.env.GROQ_API_KEY : !!process.env.DASHSCOPE_API_KEY;
}

/**
 * Safely extracts a JSON object or array from raw LLM output,
 * stripping markdown code fences, conversational preambles, or trailing text.
 */
export function extractJson(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();

  // 1. Direct JSON parse
  try {
    return JSON.parse(trimmed);
  } catch {}

  // 2. Markdown code fences: ```json ... ``` or ``` ... ```
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {}
  }

  // 3. Outermost { ... }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {}
  }

  // 4. Outermost [ ... ]
  const firstBracket = trimmed.indexOf('[');
  const lastBracket = trimmed.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try {
      return JSON.parse(trimmed.slice(firstBracket, lastBracket + 1));
    } catch {}
  }

  return null;
}

/**
 * Shared LLM chat call — intent parsing and the onboarding extractors
 * all funnel through here so auth/timeout behaviour lives in one place.
 * Includes cascading model fallback on Groq to prevent single-point-of-failure errors.
 */
async function chatCompletion(systemPrompt, userText) {
  if (llmProvider() === 'groq') {
    const modelsToTry = [
      process.env.LLM_MODEL || 'qwen/qwen3.8-27b',
      'qwen/qwen3.6-27b',
      'openai/gpt-oss-120b',
    ];

    let lastError = null;
    for (const model of modelsToTry) {
      try {
        const { data } = await axios.post(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userText },
            ],
            temperature: 0,
          },
          {
            headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
            timeout: 10_000,
          }
        );
        const content = data?.choices?.[0]?.message?.content;
        if (content) return content;
      } catch (err) {
        lastError = err;
        console.warn(`[qwen.service] Groq model ${model} failed (${err.message}), trying next model...`);
      }
    }
    throw lastError || new Error('All Groq chat models failed');
  }

  const baseUrl = process.env.DASHSCOPE_BASE_URL || 'https://dashscope-intl.aliyuncs.com';
  const { data } = await axios.post(
    `${baseUrl}/api/v1/services/aigc/text-generation/generation`,
    {
      model: process.env.QWEN_MODEL || 'qwen2.5-72b-instruct',
      input: {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userText },
        ],
      },
      parameters: { result_format: 'message' },
    },
    {
      headers: { Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}` },
      timeout: 12_000,
    }
  );

  return data?.output?.choices?.[0]?.message?.content ?? data?.output?.text ?? '';
}

const URDU_DIGITS_MAP = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

const NUMBER_WORDS_MAP = {
  'ایک': 1, 'دو': 2, 'تین': 3, 'چار': 4, 'پانچ': 5, 'چھ': 6, 'سات': 7, 'آٹھ': 8, 'نو': 9, 'دس': 10,
  'گیارہ': 11, 'بارہ': 12, 'تیرہ': 13, 'چودہ': 14, 'پندرہ': 15, 'سولہ': 16, 'سترہ': 17, 'اٹھارہ': 18, 'انیس': 19, 'بیس': 20,
  'پچیس': 25, 'تیس': 30, 'چالیس': 40, 'پچاس': 50, 'سو': 100,
  'ek': 1, 'do': 2, 'teen': 3, 'char': 4, 'panch': 5, 'che': 6, 'chhe': 6, 'saat': 7, 'aath': 8, 'nau': 9, 'das': 10,
  'gyarah': 11, 'barah': 12, 'terah': 13, 'chaudah': 14, 'pandrah': 15, 'solah': 16, 'satrah': 17, 'atharah': 18, 'unnees': 19, 'bees': 20,
  'pachees': 25, 'tees': 30, 'chalees': 40, 'pachas': 50, 'sau': 100,
};

const NUMBER_WORDS_REGEX = new RegExp(
  `\\b(?:${Object.keys(NUMBER_WORDS_MAP).filter((w) => /^[a-z]+$/i.test(w)).join('|')})\\b|(?:${Object.keys(NUMBER_WORDS_MAP).filter((w) => !/^[a-z]+$/i.test(w)).join('|')})`,
  'gi'
);

const UNIT_REGEX = /(?:^|\s)(kg|kilo|kilos|litre|liter|litres|liters|packet|packets|box|boxes|bottle|bottles|darjan|dozen|bori|sack|کلو|لیٹر|درجن|پیکٹ|بوری|بوتل|ڈبہ)(?:\s|$)/i;

/**
 * Fast-path heuristic parser for stock restocks and stock inquiries.
 * Ensures zero-latency handling and serves as a reliable safety net.
 */
export function parseStockHeuristic(text) {
  if (!text || typeof text !== 'string') return null;
  const normalizedDigits = text.replace(/[۰-۹]/g, (d) => URDU_DIGITS_MAP[d] || d);
  const lower = normalizedDigits.trim().toLowerCase();

  // Exclude full stock list / inventory queries (handled by dedicated menu)
  if (/^(stock\s*list|inventory|saman|سارا\s*اسٹاک|اسٹاک\s*لسٹ)$/i.test(lower)) {
    return null;
  }

  // 1. Check stock inquiry: "rice kitna hai", "check stock sugar", "chini kitni hai", "how much oil left", "stock rice"
  const isStockCheck = /(kitna\s*(?:hai|bacha|rah\s*gaya)|kitni\s*(?:hai|bachi|rah\s*gayi)|kitne\s*(?:hai|bache|rah\s*gaye)|check\s*stock|stock\s*check|how\s*much.*left|how\s*many.*left|کتنا\s*ہے|کتنی\s*ہے|کتنا\s*بچا|اسٹاک\s*چیک)/i.test(lower) ||
    /^stock\s+(?!list\b|summary\b|report\b)([a-zA-Z\u0600-\u06FF\s]+)$/i.test(lower) ||
    /^[a-zA-Z\u0600-\u06FF\s]+\s+stock$/i.test(lower);

  if (isStockCheck) {
    const cleaned = lower
      .replace(/(check\s*stock|stock\s*check|stock\s*of|^stock\b|\bstock$|kitna\s*hai|kitni\s*hai|kitne\s*hai|kitna\s*bacha\s*hai|kitni\s*bachi\s*hai|kitne\s*bache\s*hai|kitna\s*bacha|kitni\s*bachi|kitne\s*bache|rah\s*gaya|rah\s*gayi|rah\s*gaye|ka\s*stock|ki\s*stock|how\s*much|how\s*many|left|کتنا\s*ہے|کتنی\s*ہے|کتنا\s*بچا|کا\s*اسٹاک|اسٹاک)/gi, '')
      .trim();
    if (cleaned) {
      return { type: 'check_stock', item: { name: cleaned } };
    }
  }

  // 2. Restock / incoming inventory: "maal aya 20 chini", "add 50 rice", "stock update 20 oil", "20 کلو چاول آئے ہیں"
  const isRestock = /(maal\s*a[y|i]a|a[y|i]a\s*hai|aaye\s*hain|restock|add\s*stock|stock\s*update|stock\s*add|مال\s*آیا|آئے\s*ہیں|اسٹاک\s*میں\s*شامل|نیا\s*مال)/i.test(lower) ||
                    /^add\s+\d+/i.test(lower) ||
                    /^(شامل|اضافہ)\b/.test(lower);

  if (isRestock) {
    let quantity = 1;
    let price = null;
    let unit = null;

    const unitMatch = lower.match(UNIT_REGEX);
    if (unitMatch) {
      unit = unitMatch[1].trim();
    }

    const explicitPriceMatch = lower.match(/(?:price|rate|rs|rupay|rupees|قیمت|روپے)\s*[:=]?\s*(\d+)/i) ||
                               lower.match(/(\d+)\s*(?:rs|rupay|rupees|روپے)/i);
    if (explicitPriceMatch) {
      price = parseInt(explicitPriceMatch[1], 10);
    }

    const nums = lower.match(/\d+/g);
    if (nums && nums.length > 0) {
      if (price !== null) {
        const otherNums = nums.map((n) => parseInt(n, 10)).filter((n) => n !== price);
        if (otherNums.length > 0) {
          quantity = otherNums[0];
        }
      } else if (nums.length >= 2) {
        quantity = parseInt(nums[0], 10);
        price = parseInt(nums[1], 10);
      } else {
        quantity = parseInt(nums[0], 10);
      }
    } else {
      // Look for word-based numbers e.g. "bees", "بیس", "panch", "پانچ"
      const words = lower.split(/\s+/);
      for (const w of words) {
        if (NUMBER_WORDS_MAP[w]) {
          quantity = NUMBER_WORDS_MAP[w];
          break;
        }
      }
    }

    const stripped = lower
      .replace(/(maal\s*a[y|i]a|a[y|i]a\s*hai|aaye\s*hain|restock|add\s*stock|stock\s*update|stock\s*add|add|new|naya|item|مال\s*آیا|آئے\s*ہیں|اسٹاک\s*میں\s*شامل|نیا\s*مال|شامل\s*کرو|شامل|اضافہ|روپے|روپیہ|روپئے|rs|rupay|rupees|roopay|pkr|price|rate|\d+)/gi, ' ')
      .replace(UNIT_REGEX, ' ')
      .replace(NUMBER_WORDS_REGEX, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (stripped) {
      return {
        type: 'update_stock',
        item: { name: stripped, quantity, price, unit },
        action: 'add',
      };
    }
  }

  return null;
}

/**
 * Returns one of the command-contract shapes. Shared by the
 * typed-text path and (via the agent module) the voice-transcript path, so
 * both inputs converge on identical downstream handling.
 */
export async function parseIntent(text) {
  if (!text || typeof text !== 'string') {
    return { type: 'unknown', rawText: '' };
  }

  // Check fast-path stock heuristic first
  const stockHeuristic = parseStockHeuristic(text);

  if (!llmConfigured()) {
    if (stockHeuristic) return stockHeuristic;
    console.warn('No LLM provider key set — falling back to unknown intent');
    return { type: 'unknown', rawText: text };
  }

  try {
    const raw = await chatCompletion(SYSTEM_PROMPT, text);
    const parsed = extractJson(raw);

    if (parsed && ['log_sale', 'update_stock', 'check_stock', 'create_workflow', 'greeting', 'generate_report', 'unknown'].includes(parsed.type)) {
      // Guard: If model misclassified restock speech as a sale, override it
      if (parsed.type === 'log_sale' && stockHeuristic?.type === 'update_stock') {
        return stockHeuristic;
      }

      if (parsed.type === 'log_sale') {
        if (parsed.paymentMethod) {
          parsed.paymentMethod = normalizePaymentMethod(parsed.paymentMethod) || parsed.paymentMethod.toLowerCase();
        } else {
          parsed.paymentMethod = 'cash';
        }
        if (!parsed.item || !parsed.item.name) {
          parsed.item = { name: text.trim(), quantity: 1 };
        }
        if (!parsed.item.quantity || isNaN(parsed.item.quantity)) {
          parsed.item.quantity = 1;
        }
      }

      if (parsed.type === 'update_stock') {
        if (!parsed.item || !parsed.item.name) {
          if (stockHeuristic?.item?.name) {
            parsed.item = stockHeuristic.item;
          } else {
            parsed.item = { name: text.trim(), quantity: 1 };
          }
        }
        if (!parsed.item.quantity || isNaN(parsed.item.quantity)) {
          parsed.item.quantity = 1;
        }
        parsed.action = parsed.action || 'add';
      }

      if (parsed.type === 'check_stock') {
        if (!parsed.item || !parsed.item.name) {
          if (stockHeuristic?.item?.name) {
            parsed.item = stockHeuristic.item;
          }
        }
      }

      return parsed;
    }

    console.warn('[qwen.service] Model returned non-contract JSON:', raw);
  } catch (err) {
    console.warn('[qwen.service] chatCompletion failed during parseIntent:', err.message);
  }

  // Safety net heuristic fallbacks: never falsely say 'unknown' to standard greetings, reports, or stock
  if (stockHeuristic) {
    return stockHeuristic;
  }

  const lower = text.trim().toLowerCase();
  if (/^(suno|salam|assalam|aoa|hello|hi|hey|bhai|janab|adaab)\b/i.test(lower) || /^(سلام|وعلیکم|ہیلو|سنو)/.test(text.trim())) {
    return { type: 'greeting', rawText: text };
  }

  // Only trigger report when explicitly asking for reports or full inventory/summary
  if (/(report|summary|hisab|کھاتہ|رپورٹ)/i.test(lower) || /^(inventory|stock\s*list|سارا\s*اسٹاک)$/i.test(lower)) {
    const reportType = /sale/i.test(lower) ? 'sales' : /low|short|kam/i.test(lower) ? 'low_stock' : 'inventory';
    return { type: 'generate_report', reportType };
  }

  return { type: 'unknown', rawText: text };
}

/**
 * Extracts { businessName, businessType, location, sells } from the onboarding
 * message, with null for anything not clearly stated. Returns null when the
 * model is unavailable or returns garbage — callers fall back to the raw text
 * rather than blocking onboarding on a flaky NLP call.
 */
export async function extractBusinessDetails(text) {
  if (!llmConfigured()) return null;

  const VALID_TYPES = ['general', 'kiryana', 'medical', 'clothing', 'restaurant', 'electronics', 'services', 'auto', 'salon'];

  try {
    const raw = await chatCompletion(BUSINESS_DETAILS_PROMPT, text);
    const parsed = extractJson(raw);
    if (!parsed) return null;

    const strOrNull = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const rawType = strOrNull(parsed.businessType);
    const details = {
      businessName: strOrNull(parsed.businessName),
      businessType: rawType && VALID_TYPES.includes(rawType.toLowerCase()) ? rawType.toLowerCase() : null,
      location: strOrNull(parsed.location),
      sells: strOrNull(parsed.sells),
    };
    return details.businessName || details.businessType || details.location || details.sells ? details : null;
  } catch {
    return null;
  }
}

/**
 * Parses a free-form stock list ("5 shirts 2000 each, 3 bottles perfume...") into
 * normalized line items for onboarding. Returns a non-empty array, or null
 * when extraction can't run / yields nothing usable — callers then keep the
 * raw text as a single unparsed item so onboarding still completes.
 */
export async function extractInventoryItems(text) {
  if (!llmConfigured()) return null;

  try {
    const raw = await chatCompletion(INVENTORY_PROMPT, text);
    const parsed = extractJson(raw);
    if (!parsed || !Array.isArray(parsed.items)) return null;

    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

    const items = parsed.items
      .filter((i) => typeof i?.name === 'string' && i.name.trim())
      .map((i) => ({
        name: i.name.trim().slice(0, 100),
        quantity: Math.max(0, Math.round(num(i.quantity) ?? 0)),
        price: num(i.price),
        unit: typeof i.unit === 'string' && i.unit.trim() ? i.unit.trim().slice(0, 30) : null,
      }))
      .slice(0, 100);

    return items.length ? items : null;
  } catch {
    return null;
  }
}

/**
 * Last-resort item resolver for when string matching fails — the merchant
 * said "chawal" but their stock list says "rice", or they spoke Urdu script.
 * Asks the LLM to pick from the actual inventory names; returns the exact
 * matching inventory name, or null when nothing plausible / LLM unavailable.
 */
export async function resolveItemName(saidName, inventoryNames) {
  if (!llmConfigured() || !inventoryNames?.length || !saidName) return null;

  try {
    const raw = await chatCompletion(
      ITEM_RESOLVE_PROMPT,
      `Inventory: ${inventoryNames.join(', ')}\nItem said: ${saidName}`
    );
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*|\s*```$/gi, '')
      .replace(/^["'`]+|["'`]+$/g, '')
      .trim();
    if (!cleaned || cleaned.toLowerCase() === 'null') return null;
    return inventoryNames.find((n) => n.toLowerCase() === cleaned.toLowerCase()) ?? null;
  } catch {
    return null;
  }
}
