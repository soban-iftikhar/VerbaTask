import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanAndStandardizeItemName,
  similarity,
  normalizeName,
  crossLingualScore,
} from '../src/crm/item-matching.js';

describe('Cross-Lingual & Spell Correction Item Matching Tests', () => {
  describe('cleanAndStandardizeItemName', () => {
    test('standardizes common illiterate English/Roman Urdu misspellings', () => {
      assert.equal(cleanAndStandardizeItemName('rise'), 'Rice');
      assert.equal(cleanAndStandardizeItemName('riece'), 'Rice');
      assert.equal(cleanAndStandardizeItemName('sugr'), 'Sugar');
      assert.equal(cleanAndStandardizeItemName('cheni'), 'Sugar');
      assert.equal(cleanAndStandardizeItemName('oel'), 'Cooking Oil');
      assert.equal(cleanAndStandardizeItemName('atta'), 'Atta / Flour');
      assert.equal(cleanAndStandardizeItemName('aata'), 'Atta / Flour');
      assert.equal(cleanAndStandardizeItemName('doodh'), 'Milk');
    });

    test('preserves and title-cases custom product names', () => {
      assert.equal(cleanAndStandardizeItemName('nestle pure life'), 'Nestle Pure Life');
      assert.equal(cleanAndStandardizeItemName('mehran biryani masala'), 'Mehran Biryani Masala');
      assert.equal(cleanAndStandardizeItemName('mehran biryani riece'), 'Mehran Biryani Rice');
    });
  });

  describe('cross-lingual matching (English <-> Urdu <-> Roman Urdu)', () => {
    test('matches Urdu script with English inventory item', () => {
      const score = similarity('چاول', 'Rice');
      assert.ok(score >= 0.85, `Expected score >= 0.85, got ${score}`);
    });

    test('matches Roman Urdu with English inventory item', () => {
      const score = similarity('chawal', 'Rice');
      assert.ok(score >= 0.85, `Expected score >= 0.85, got ${score}`);
    });

    test('matches English with Urdu script inventory item', () => {
      const score = similarity('Rice', 'چاول');
      assert.ok(score >= 0.85, `Expected score >= 0.85, got ${score}`);
    });

    test('matches Roman Urdu with Urdu script inventory item', () => {
      const score = similarity('chini', 'چینی');
      assert.ok(score >= 0.85, `Expected score >= 0.85, got ${score}`);
    });

    test('matches English Sugar with Urdu چینی', () => {
      const score = similarity('Sugar', 'چینی');
      assert.ok(score >= 0.85, `Expected score >= 0.85, got ${score}`);
    });
  });

  describe('phonetic misspelling matching', () => {
    test('matches rise or riece with Rice', () => {
      assert.ok(similarity('rise', 'Rice') >= 0.85);
      assert.ok(similarity('riece', 'Rice') >= 0.85);
      assert.ok(similarity('ryce', 'Rice') >= 0.85);
    });

    test('matches sugr or shugar with Sugar', () => {
      assert.ok(similarity('sugr', 'Sugar') >= 0.85);
      assert.ok(similarity('shugar', 'Sugar') >= 0.85);
    });

    test('matches oel with Cooking Oil', () => {
      assert.ok(similarity('oel', 'Cooking Oil') >= 0.75);
    });

    test('matches dal mash with Daal Maash', () => {
      assert.ok(similarity('dal mash', 'Daal Maash') >= 0.85);
    });

    test('matches brand word subsets (e.g. Lipton in Lipton Yellow Label)', () => {
      assert.ok(similarity('Lipton', 'Lipton Yellow Label') >= 0.85);
      assert.ok(similarity('لیپٹن', 'Lipton Yellow Label') >= 0.80);
      assert.ok(similarity('Daal Chana', 'Daal Chana Special') >= 0.85);
      assert.ok(similarity('چینی', 'Sugar 1kg') >= 0.85);
    });
  });
});

import { extractJson } from '../src/services/qwen.service.js';

describe('Safe LLM JSON Extraction Tests', () => {
  test('parses clean raw JSON', () => {
    const res = extractJson('{"type":"log_sale","item":{"name":"rice","quantity":2}}');
    assert.equal(res?.type, 'log_sale');
    assert.equal(res?.item?.name, 'rice');
  });

  test('parses markdown code fences with json tag', () => {
    const res = extractJson('```json\n{"type":"log_sale","item":{"name":"sugar","quantity":1}}\n```');
    assert.equal(res?.type, 'log_sale');
    assert.equal(res?.item?.name, 'sugar');
  });

  test('parses markdown code fences without language tag', () => {
    const res = extractJson('```\n{"type":"greeting","rawText":"hello"}\n```');
    assert.equal(res?.type, 'greeting');
  });

  test('parses JSON with conversational preambles and trailing commentary', () => {
    const res = extractJson('Here is the parsed intent:\n{"type":"generate_report","reportType":"sales"}\nHope this helps!');
    assert.equal(res?.type, 'generate_report');
    assert.equal(res?.reportType, 'sales');
  });

  test('returns null for unparseable garbage', () => {
    assert.equal(extractJson('some non-json text'), null);
    assert.equal(extractJson(null), null);
    assert.equal(extractJson(''), null);
  });
});
