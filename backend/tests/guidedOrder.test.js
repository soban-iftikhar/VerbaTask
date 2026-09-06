import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePaymentMethod, isValidPaymentMethod } from '../src/constants/paymentMethods.js';

describe('Guided Order Flow & Payment Resolution Tests', () => {
  test('handles interactive payment button IDs (pay_cash, pay_easypaisa, pay_jazzcash)', () => {
    const cashButton = 'pay_cash'.replace('pay_', '');
    const epButton = 'pay_easypaisa'.replace('pay_', '');
    const jcButton = 'pay_jazzcash'.replace('pay_', '');

    assert.equal(isValidPaymentMethod(cashButton), true);
    assert.equal(isValidPaymentMethod(epButton), true);
    assert.equal(isValidPaymentMethod(jcButton), true);

    assert.equal(normalizePaymentMethod(cashButton), 'cash');
    assert.equal(normalizePaymentMethod(epButton), 'easypaisa');
    assert.equal(normalizePaymentMethod(jcButton), 'jazzcash');
  });

  test('normalizes typed payment methods in English, Urdu, and Roman Urdu', () => {
    assert.equal(normalizePaymentMethod('EasyPaisa'), 'easypaisa');
    assert.equal(normalizePaymentMethod('easypaisa'), 'easypaisa');
    assert.equal(normalizePaymentMethod('easy paisa'), 'easypaisa');
    assert.equal(normalizePaymentMethod('ایزی پیسہ'), 'easypaisa');

    assert.equal(normalizePaymentMethod('Cash'), 'cash');
    assert.equal(normalizePaymentMethod('cash'), 'cash');
    assert.equal(normalizePaymentMethod('نقد'), 'cash');
    assert.equal(normalizePaymentMethod('naqad'), 'cash');

    assert.equal(normalizePaymentMethod('JazzCash'), 'jazzcash');
    assert.equal(normalizePaymentMethod('jazz cash'), 'jazzcash');
    assert.equal(normalizePaymentMethod('جاز کیش'), 'jazzcash');
  });

  test('extracts combined quantity and payment method from single message', () => {
    const raw = '5 cash';
    const numMatch = raw.match(/\d+/);
    const quantity = numMatch ? parseInt(numMatch[0], 10) : null;
    const trailingText = raw.replace(/\d+/, '').trim();
    const paymentMethod = normalizePaymentMethod(trailingText);

    assert.equal(quantity, 5);
    assert.equal(paymentMethod, 'cash');
  });

  test('extracts combined quantity and Urdu payment method from single message', () => {
    const raw = '2 ایزی پیسہ';
    const numMatch = raw.match(/\d+/);
    const quantity = numMatch ? parseInt(numMatch[0], 10) : null;
    const trailingText = raw.replace(/\d+/, '').trim();
    const paymentMethod = normalizePaymentMethod(trailingText);

    assert.equal(quantity, 2);
    assert.equal(paymentMethod, 'easypaisa');
  });
});
