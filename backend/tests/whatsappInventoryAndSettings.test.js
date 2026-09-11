import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseStockHeuristic } from '../src/services/qwen.service.js';
import { spokenPhrases } from '../src/services/localization.service.js';
import { normalizePaymentMethod } from '../src/constants/paymentMethods.js';
import InventoryItem from '../src/models/InventoryItem.js';
import { restockItemViaCrm, checkStockViaCrm, getStockListSummary } from '../src/crm/inventory.service.js';

describe('WhatsApp Inventory, Stock Queries & Command Guides Tests', () => {
  describe('parseStockHeuristic - Incoming Stock & Restock', () => {
    test('parses Roman Urdu incoming stock "maal aya 20 chini"', () => {
      const parsed = parseStockHeuristic('maal aya 20 chini');
      assert.ok(parsed);
      assert.equal(parsed.type, 'update_stock');
      assert.equal(parsed.item.name, 'chini');
      assert.equal(parsed.item.quantity, 20);
      assert.equal(parsed.action, 'add');
    });

    test('parses English restock "add 50 rice price 300"', () => {
      const parsed = parseStockHeuristic('add 50 rice price 300');
      assert.ok(parsed);
      assert.equal(parsed.type, 'update_stock');
      assert.equal(parsed.item.name, 'rice');
      assert.equal(parsed.item.quantity, 50);
      assert.equal(parsed.item.price, 300);
      assert.equal(parsed.action, 'add');
    });

    test('parses Urdu script with unit "20 کلو چاول آئے ہیں"', () => {
      const parsed = parseStockHeuristic('20 کلو چاول آئے ہیں');
      assert.ok(parsed);
      assert.equal(parsed.type, 'update_stock');
      assert.equal(parsed.item.name, 'چاول');
      assert.equal(parsed.item.quantity, 20);
      assert.equal(parsed.item.unit, 'کلو');
    });

    test('parses Urdu numerals "۲۰ چینی مال آیا"', () => {
      const parsed = parseStockHeuristic('۲۰ چینی مال آیا');
      assert.ok(parsed);
      assert.equal(parsed.type, 'update_stock');
      assert.equal(parsed.item.name, 'چینی');
      assert.equal(parsed.item.quantity, 20);
    });

    test('parses word numbers "maal aya bees chini"', () => {
      const parsed = parseStockHeuristic('maal aya bees chini');
      assert.ok(parsed);
      assert.equal(parsed.type, 'update_stock');
      assert.equal(parsed.item.name, 'chini');
      assert.equal(parsed.item.quantity, 20);
    });

    test('parses Urdu word numbers "بیس کلو چاول آئے ہیں"', () => {
      const parsed = parseStockHeuristic('بیس کلو چاول آئے ہیں');
      assert.ok(parsed);
      assert.equal(parsed.type, 'update_stock');
      assert.equal(parsed.item.name, 'چاول');
      assert.equal(parsed.item.quantity, 20);
    });

    test('does NOT trigger restock on sale messages', () => {
      assert.equal(parseStockHeuristic('2 rice cash'), null);
      assert.equal(parseStockHeuristic('becha 5 chini'), null);
      assert.equal(parseStockHeuristic('10 doodh easypaisa'), null);
    });
  });

  describe('parseStockHeuristic - Stock Inquiries', () => {
    test('parses Roman Urdu stock inquiry "rice kitna hai"', () => {
      const parsed = parseStockHeuristic('rice kitna hai');
      assert.ok(parsed);
      assert.equal(parsed.type, 'check_stock');
      assert.equal(parsed.item.name, 'rice');
    });

    test('parses feminine inquiry "chini kitni hai"', () => {
      const parsed = parseStockHeuristic('chini kitni hai');
      assert.ok(parsed);
      assert.equal(parsed.type, 'check_stock');
      assert.equal(parsed.item.name, 'chini');
    });

    test('parses "stock rice" and "sugar stock"', () => {
      const parsed1 = parseStockHeuristic('stock rice');
      assert.ok(parsed1);
      assert.equal(parsed1.type, 'check_stock');
      assert.equal(parsed1.item.name, 'rice');

      const parsed2 = parseStockHeuristic('sugar stock');
      assert.ok(parsed2);
      assert.equal(parsed2.type, 'check_stock');
      assert.equal(parsed2.item.name, 'sugar');
    });

    test('parses Urdu script inquiry "چاول کا اسٹاک کتنا ہے"', () => {
      const parsed = parseStockHeuristic('چاول کا اسٹاک کتنا ہے');
      assert.ok(parsed);
      assert.equal(parsed.type, 'check_stock');
      assert.equal(parsed.item.name, 'چاول');
    });

    test('parses remaining inquiry "doodh kitna bacha hai"', () => {
      const parsed = parseStockHeuristic('doodh kitna bacha hai');
      assert.ok(parsed);
      assert.equal(parsed.type, 'check_stock');
      assert.equal(parsed.item.name, 'doodh');
    });

    test('does NOT intercept "stock list" or "inventory" as single item checks', () => {
      assert.equal(parseStockHeuristic('stock list'), null);
      assert.equal(parseStockHeuristic('inventory'), null);
      assert.equal(parseStockHeuristic('سارا اسٹاک'), null);
    });
  });

  describe('Localization Service - Stock and Help Guide', () => {
    test('formats stockUpdated in Urdu and English', () => {
      const ur = spokenPhrases.stockUpdated('ur', {
        itemName: 'چاول',
        addedQuantity: 20,
        totalQuantity: 70,
        price: 320,
        unit: 'کلو',
      });
      assert.ok(ur.spoken.includes('چاول کے 20 کلو شامل کر دیے گئے ہیں'));
      assert.ok(ur.spoken.includes('70'));
      assert.ok(ur.text.includes('+20 کلو چاول'));
      assert.ok(ur.text.includes('70'));
      assert.ok(ur.text.includes('320'));

      const en = spokenPhrases.stockUpdated('en', {
        itemName: 'Rice',
        addedQuantity: 15,
        totalQuantity: 45,
        price: 250,
      });
      assert.ok(en.spoken.includes('Added 15 Rice'));
      assert.ok(en.spoken.includes('45'));
      assert.ok(en.text.includes('+15 Rice'));
      assert.ok(en.text.includes('45'));
    });

    test('formats stockChecked in Urdu and English', () => {
      const ur = spokenPhrases.stockChecked('ur', {
        itemName: 'چینی',
        quantity: 12,
        price: 150,
        unit: 'کلو',
      });
      assert.ok(ur.spoken.includes('چینی کا موجودہ اسٹاک 12 کلو ہے'));
      assert.ok(ur.spoken.includes('150 روپے'));
      assert.ok(ur.text.includes('چینی'));
      assert.ok(ur.text.includes('12 کلو'));

      const en = spokenPhrases.stockChecked('en', {
        itemName: 'Sugar',
        quantity: 8,
        price: 160,
      });
      assert.ok(en.spoken.includes('Current stock for Sugar is 8'));
      assert.ok(en.spoken.includes('160 rupees'));
      assert.ok(en.text.includes('Sugar'));
      assert.ok(en.text.includes('8'));
    });

    test('formats helpCommands guide in Urdu and English with all features', () => {
      const ur = spokenPhrases.helpCommands('ur');
      assert.ok(ur.text.includes('سیل درج کرنا'));
      assert.ok(ur.text.includes('انوینٹری اور نیا مال'));
      assert.ok(ur.text.includes('پی ڈی ایف رپورٹس'));
      assert.ok(ur.text.includes('دکان اور سیٹنگز'));
      assert.ok(ur.text.includes('بینک اور ادائیگی'));
      assert.ok(ur.text.includes('آٹومیشن الرٹس'));

      const en = spokenPhrases.helpCommands('en');
      assert.ok(en.text.includes('Log Sales'));
      assert.ok(en.text.includes('Stock & Inventory'));
      assert.ok(en.text.includes('Download PDF Reports'));
      assert.ok(en.text.includes('Store & Profile Settings'));
      assert.ok(en.text.includes('Payment & Banks'));
      assert.ok(en.text.includes('Automations & Alerts'));
    });
  });

  describe('Payment Methods Normalization for WhatsApp Commands', () => {
    test('resolves Urdu, English, and alias bank names for WhatsApp toggles', () => {
      assert.equal(normalizePaymentMethod('easypaisa'), 'easypaisa');
      assert.equal(normalizePaymentMethod('easy paisa'), 'easypaisa');
      assert.equal(normalizePaymentMethod('ایزی پیسہ'), 'easypaisa');

      assert.equal(normalizePaymentMethod('jazzcash'), 'jazzcash');
      assert.equal(normalizePaymentMethod('جاز کیش'), 'jazzcash');

      assert.equal(normalizePaymentMethod('sadapay'), 'sadapay');
      assert.equal(normalizePaymentMethod('سادا پے'), 'sadapay');

      assert.equal(normalizePaymentMethod('meezan bank'), 'meezan');
      assert.equal(normalizePaymentMethod('میزان بینک'), 'meezan');

      assert.equal(normalizePaymentMethod('hbl'), 'hbl');
      assert.equal(normalizePaymentMethod('حبیب بینک'), 'hbl');
    });
  });

  describe('Inventory CRM Service Tests (restockItemViaCrm, checkStockViaCrm, getStockListSummary)', () => {
    test('restockItemViaCrm increments quantity on existing item', async () => {
      const mockMerchant = { _id: '507f191e810c19729de860ea', language: 'ur' };
      const originalFindOne = InventoryItem.findOne;

      let saved = false;
      const fakeItem = {
        _id: 'item123',
        name: 'Rice',
        quantity: 10,
        price: 200,
        save: async () => { saved = true; return fakeItem; },
      };

      InventoryItem.findOne = async () => fakeItem;

      try {
        const result = await restockItemViaCrm(mockMerchant, {
          item: { name: 'Rice', quantity: 20, price: 220, unit: 'kg' },
          language: 'ur',
        });

        assert.equal(saved, true);
        assert.equal(fakeItem.quantity, 30);
        assert.equal(fakeItem.price, 220);
        assert.equal(fakeItem.unit, 'kg');
        assert.ok(result.text.includes('+20 kg Rice'));
        assert.ok(result.text.includes('30'));
      } finally {
        InventoryItem.findOne = originalFindOne;
      }
    });

    test('restockItemViaCrm creates new item if not found', async () => {
      const mockMerchant = { _id: '507f191e810c19729de860ea', language: 'en' };
      const originalFindOne = InventoryItem.findOne;
      const originalFind = InventoryItem.find;
      const originalCreate = InventoryItem.create;

      InventoryItem.findOne = async () => null;
      InventoryItem.find = () => ({
        limit: async () => [],
      });
      let createdDoc = null;
      InventoryItem.create = async (doc) => {
        createdDoc = { ...doc, _id: 'new123' };
        return createdDoc;
      };

      try {
        const result = await restockItemViaCrm(mockMerchant, {
          item: { name: 'Cooking Oil', quantity: 15, price: 500, unit: 'litre' },
          language: 'en',
        });

        assert.ok(createdDoc);
        assert.equal(createdDoc.name, 'Cooking Oil');
        assert.equal(createdDoc.quantity, 15);
        assert.equal(createdDoc.price, 500);
        assert.ok(result.text.includes('+15 litre Cooking Oil'));
        assert.ok(result.text.includes('15'));
      } finally {
        InventoryItem.findOne = originalFindOne;
        InventoryItem.find = originalFind;
        InventoryItem.create = originalCreate;
      }
    });

    test('checkStockViaCrm returns stock and unit info', async () => {
      const mockMerchant = { _id: '507f191e810c19729de860ea', language: 'ur' };
      const originalFindOne = InventoryItem.findOne;

      const fakeItem = {
        _id: 'item999',
        name: 'Sugar',
        quantity: 25,
        price: 140,
        unit: 'کلو',
      };
      InventoryItem.findOne = async () => fakeItem;

      try {
        const result = await checkStockViaCrm(mockMerchant, {
          item: { name: 'Sugar' },
          language: 'ur',
        });

        assert.ok(result.text.includes('Sugar'));
        assert.ok(result.text.includes('25 کلو'));
        assert.ok(result.text.includes('Rs. 140'));
      } finally {
        InventoryItem.findOne = originalFindOne;
      }
    });

    test('getStockListSummary lists items and flags low stock', async () => {
      const mockMerchant = { _id: '507f191e810c19729de860ea', language: 'en' };
      const originalFind = InventoryItem.find;

      const fakeItems = [
        { name: 'Rice', quantity: 3, unit: 'kg', price: 250 },
        { name: 'Cooking Oil', quantity: 20, unit: 'litre', price: 550 },
      ];

      InventoryItem.find = () => ({
        sort: () => ({
          limit: async () => fakeItems,
        }),
      });

      try {
        const result = await getStockListSummary(mockMerchant);
        assert.ok(result.text.includes('*Rice*: 3 kg — Rs. 250 ⚠️ (Low)'));
        assert.ok(result.text.includes('*Cooking Oil*: 20 litre — Rs. 550'));
        assert.ok(result.text.includes('Current Stock List (2 items)'));
      } finally {
        InventoryItem.find = originalFind;
      }
    });
  });
});
