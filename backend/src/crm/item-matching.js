/**
 * Fuzzy & Cross-Lingual inventory-item matching — bridges the gap between:
 * 1. Spoken vs typed names ("dal mash" vs "Daal Maash")
 * 2. Phonetic misspellings by semi-literate merchants ("rise"/"riece" vs "Rice", "sugr" vs "Sugar")
 * 3. Cross-lingual variants across English, Roman Urdu, and Urdu script ("chawal" <-> "Rice" <-> "چاول")
 */
import InventoryItem from '../models/InventoryItem.js';

// Bilingual & phonetic equivalence groups for Pakistani retail
const BILINGUAL_GROUPS = [
  ['rice', 'rise', 'riece', 'ryce', 'chawal', 'chawl', 'chaawal', 'چاول', 'باسمتی', 'basmati', 'sela', 'سیلہ'],
  ['sugar', 'sugr', 'shugar', 'shugr', 'chini', 'cheeni', 'cheni', 'chiny', 'چینی', 'shakar', 'شکر'],
  ['flour', 'flor', 'atta', 'aata', 'aatta', 'ata', 'gandum', 'آٹا', 'گندم', 'میدہ', 'maida'],
  ['oil', 'oel', 'cooking oil', 'cookingoil', 'tail', 'tel', 'تیل', 'کوکنگ آئل', 'sufi', 'habib', 'حبیب'],
  ['ghee', 'ghi', 'geeh', 'گھی', 'ڈالڈا', 'dalda', 'banaspati', 'meezan'],
  ['tea', 'chai', 'chay', 'chaa', 'چائے', 'پتی', 'patti', 'tapal', 'lipton', 'لیپٹن', 'ٹیپال', 'danedar', 'دانے دار'],
  ['milk', 'doodh', 'dodh', 'dudh', 'دودھ', 'olpers', 'milkpak', 'اولپرز', 'ملک پیک', 'tarang', 'ترنگ', 'dairy pure'],
  ['lentil', 'daal', 'dal', 'dall', 'دال'],
  ['maash', 'mash', 'ماش'],
  ['channa', 'chana', 'چنا'],
  ['moong', 'mong', 'مونگ'],
  ['masoor', 'masur', 'مسور'],
  ['salt', 'namak', 'nimak', 'نمک'],
  ['soap', 'sop', 'sabun', 'saabun', 'صابن', 'surf', 'detergent', 'سرف', 'ariel', 'برائٹ', 'bright', 'bonus', 'بونس', 'lifebuoy', 'lux', 'لکس'],
  ['spices', 'masala', 'masale', 'masalah', 'مصالحہ', 'national', 'shan', 'شان', 'haldi', 'ہلدی', 'mirch', 'مرچ'],
  ['eggs', 'egs', 'anday', 'ande', 'anda', 'انڈے', 'انڈا'],
  ['bread', 'bred', 'double roti', 'doubleroti', 'ڈبل روٹی', 'dawn bread'],
  ['biscuits', 'biscuit', 'biscut', 'biskut', 'بسکوٹ', 'بسکٹ', 'cookies', 'سوپر', 'super', 'sooper', 'rio', 'ریو', 'gala', 'گالا', 'prince', 'پرنس'],
  ['chips', 'chps', 'lays', 'پاپڑ', 'پاپڑیاں', 'چپس', 'kurkure', 'کرکرے'],
  ['water', 'pani', 'paani', 'پانی', 'aquafina', 'nestle'],
  ['drinks', 'cold drink', 'drink', 'cola', 'pepsi', 'coke', 'بوتل', 'کولڈ ڈرنک', 'پیپسی', 'کوک', 'سیون اپ', '7up', 'sprite', 'سپرائٹ', 'dew', 'ڈیو', 'sting', 'سٹنگ', 'marinda', 'مرنڈا'],
  ['chicken', 'chiken', 'chikn', 'murghi', 'murgi', 'مرغی', 'چکن'],
  ['beef', 'mutton', 'gosht', 'goshat', 'گوشت'],
  ['onion', 'pyaz', 'piyaz', 'پیاز'],
  ['potato', 'aalu', 'aloo', 'alu', 'آلو'],
  ['tomato', 'tamatar', 'tamater', 'ٹماٹر'],
  ['matches', 'machis', 'ماچس'],
  ['shampoo', 'شیمپو', 'sunsilk', 'سن سلک', 'head and shoulders'],
  ['toothpaste', 'tooth paste', 'ٹوتھ پیسٹ', 'colgate', 'کولگیٹ'],
  ['mithai', 'methai', 'sweets', 'sweet', 'مٹھائی', 'mix mithai', 'مکس مٹھائی', 'halwa', 'حلوا', 'gulab jamun', 'گلاب جامن', 'rasgulla', 'رس گلہ', 'jalebi', 'جلیبی', 'barfi', 'برفی', 'laddu', 'لڈو'],
  ['samosa', 'samosay', 'smosa', 'سموسہ', 'سموسے', 'pakora', 'pakoray', 'پکوڑے', 'roll', 'رول', 'patties', 'پیٹیز'],
  ['biryani', 'beryani', 'بریانی', 'pulao', 'پلاؤ'],
];

const CONCEPT_MAP = new Map();
BILINGUAL_GROUPS.forEach((group, id) => {
  group.forEach((word) => CONCEPT_MAP.set(word.toLowerCase().trim(), id));
});

const CANONICAL_STANDARDS = {
  rice: 'Rice',
  rise: 'Rice',
  riece: 'Rice',
  ryce: 'Rice',
  chawal: 'Rice',
  sugar: 'Sugar',
  sugr: 'Sugar',
  shugar: 'Sugar',
  chini: 'Sugar',
  cheni: 'Sugar',
  cheeni: 'Sugar',
  oil: 'Cooking Oil',
  oel: 'Cooking Oil',
  cookingoil: 'Cooking Oil',
  tel: 'Cooking Oil',
  ghee: 'Ghee',
  ghi: 'Ghee',
  flour: 'Atta / Flour',
  atta: 'Atta / Flour',
  aata: 'Atta / Flour',
  milk: 'Milk',
  doodh: 'Milk',
  dodh: 'Milk',
  tea: 'Tea',
  chai: 'Tea',
  salt: 'Salt',
  namak: 'Salt',
  soap: 'Soap',
  sabun: 'Soap',
  spices: 'Spices',
  masala: 'Spices',
  eggs: 'Eggs',
  anday: 'Eggs',
  bread: 'Bread',
  'double roti': 'Bread',
};

const TYPO_CORRECTIONS = {
  rise: 'Rice',
  riece: 'Rice',
  ryce: 'Rice',
  sugr: 'Sugar',
  shugar: 'Sugar',
  shugr: 'Sugar',
  oel: 'Oil',
  coking: 'Cooking',
  flor: 'Flour',
  chiken: 'Chicken',
  chikn: 'Chicken',
  tamater: 'Tamatar',
  biscut: 'Biscuit',
  biskut: 'Biscuit',
  bred: 'Bread',
};

/** Auto-corrects misspelled or Roman Urdu item names to standardized product names. */
export function cleanAndStandardizeItemName(rawName) {
  if (!rawName || typeof rawName !== 'string') return rawName;
  const trimmed = rawName.trim();
  const lower = trimmed.toLowerCase();

  if (CANONICAL_STANDARDS[lower]) {
    return CANONICAL_STANDARDS[lower];
  }

  // Capitalize each word nicely, correcting any explicit typos
  return trimmed
    .split(/\s+/)
    .map((w) => {
      const wLower = w.toLowerCase();
      if (TYPO_CORRECTIONS[wLower]) return TYPO_CORRECTIONS[wLower];
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

/** Lowercase, strip punctuation (keeping Urdu letters), collapse whitespace. */
export function normalizeName(str) {
  return String(str ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Phonetic normalizer to collapse spelling variations (e.g. riece -> ris, rice -> ris). */
export function simplifyPhonetic(str) {
  return String(str ?? '')
    .toLowerCase()
    .replace(/ee+/g, 'i')
    .replace(/oo+/g, 'u')
    .replace(/aa+/g, 'a')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/c+/g, 'k')
    .replace(/ph+/g, 'f')
    .replace(/(.)\1+/g, '$1') // collapse repeated characters
    .trim();
}

/** Classic Levenshtein edit distance. */
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

/** Cross-lingual semantic similarity between English, Roman Urdu, and Urdu script. */
export function crossLingualScore(na, nb) {
  if (na === nb) return 1.0;

  // Exact phrase match
  const cA = CONCEPT_MAP.get(na);
  const cB = CONCEPT_MAP.get(nb);
  if (cA !== undefined && cA === cB) return 1.0;

  // Token-level concept match
  const tokensA = na.split(/\s+/).filter(Boolean);
  const tokensB = nb.split(/\s+/).filter(Boolean);

  let conceptMatches = 0;
  for (const tA of tokensA) {
    const c = CONCEPT_MAP.get(tA);
    if (c !== undefined && tokensB.some((tB) => CONCEPT_MAP.get(tB) === c)) {
      conceptMatches++;
    }
  }

  if (conceptMatches > 0) {
    const maxTokens = Math.max(tokensA.length, tokensB.length);
    return 0.75 + 0.25 * (conceptMatches / maxTokens);
  }

  return 0;
}

const URDU_TO_ROMAN_CHAR_MAP = {
  'ا': 'a', 'آ': 'a', 'ب': 'b', 'پ': 'p', 'ت': 't', 'ٹ': 't', 'ث': 's',
  'ج': 'j', 'چ': 'ch', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ڈ': 'd', 'ذ': 'z',
  'ر': 'r', 'ڑ': 'r', 'ز': 'z', 'ژ': 'z', 'س': 's', 'ش': 'sh', 'ص': 's',
  'ض': 'z', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q',
  'ک': 'k', 'گ': 'g', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ں': 'n', 'و': 'o',
  'ہ': 'h', 'ھ': 'h', 'ء': '', 'ئ': 'i', 'ی': 'i', 'ے': 'e', 'ۂ': 'h', 'ۃ': 't',
};

export function transliterateUrdu(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .split('')
    .map((c) => URDU_TO_ROMAN_CHAR_MAP[c] || c)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 0..1 similarity between two raw item names.
 * Evaluates cross-lingual concept matches, phonetic spelling equivalence,
 * token overlap, and Levenshtein edit distance.
 */
export function similarity(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  // 1. Cross-lingual match (e.g. "chawal" vs "Rice", "چاول" vs "Rice")
  const crossScore = crossLingualScore(na, nb);
  if (crossScore >= 0.85) return crossScore;

  // Cross-script transliteration: if one item is Urdu script and the other Latin
  const hasUrduA = /[\u0600-\u06FF]/.test(na);
  const hasUrduB = /[\u0600-\u06FF]/.test(nb);
  if (hasUrduA !== hasUrduB) {
    const transA = hasUrduA ? normalizeName(transliterateUrdu(na)) : na;
    const transB = hasUrduB ? normalizeName(transliterateUrdu(nb)) : nb;
    const transScore = similarity(transA, transB);
    if (transScore >= 0.70) return transScore;
  }

  // 2. Phonetic equivalence (e.g. "riece" vs "rice", "sugr" vs "sugar")
  const pa = simplifyPhonetic(na);
  const pb = simplifyPhonetic(nb);
  if (pa && pb && pa === pb) return 0.95;
  const phoneticLev = 1 - levenshtein(pa, pb) / Math.max(pa.length, pb.length);
  const phoneticScore = phoneticLev >= 0.75 ? phoneticLev : 0;

  // 3. String Levenshtein distance
  const lev = 1 - levenshtein(na, nb) / Math.max(na.length, nb.length);

  // 4. Token overlap
  const ta = na.split(' ');
  const tb = nb.split(' ');
  let matched = 0;
  for (const t of ta) if (tb.includes(t)) matched++;
  let tokenScore = matched / Math.max(ta.length, tb.length);

  // Full word subset match: if one item's words are a complete subset of the other
  // e.g. "lipton" in "lipton yellow label", or "daal chana" in "daal chana special"
  if (matched === ta.length || matched === tb.length) {
    const minLen = Math.min(ta.length, tb.length);
    const maxLen = Math.max(ta.length, tb.length);
    const subsetScore = 0.82 + 0.18 * (minLen / maxLen);
    tokenScore = Math.max(tokenScore, subsetScore);
  }

  // 5. Substring containment
  const shorter = na.length < nb.length ? na : nb;
  const longer = na.length < nb.length ? nb : na;
  const contains =
    shorter.length >= 3 && longer.includes(shorter)
      ? 0.75 + 0.25 * (shorter.length / longer.length)
      : 0;

  // 6. Space-stripped comparison
  const ca = na.replace(/\s/g, '');
  const cb = nb.replace(/\s/g, '');
  const merged =
    ca === cb
      ? 1
      : Math.min(ca.length, cb.length) < 4
        ? 0
        : 1 - levenshtein(ca, cb) / Math.max(ca.length, cb.length);

  return Math.max(crossScore, phoneticScore, lev, tokenScore, contains, merged);
}

/**
 * Ranks stock items against what the merchant said. Returns
 * [{ item, score }] sorted best-first, filtered to score >= minScore.
 */
export async function findSimilarInventoryItems(merchantId, saidName, { limit = 3, minScore = 0.5 } = {}) {
  const items = await InventoryItem.find({ merchantId }).limit(100);
  return items
    .map((item) => ({ item, score: similarity(saidName, item.name) }))
    .filter((m) => m.score >= minScore)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}
