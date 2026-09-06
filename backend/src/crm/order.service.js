import InventoryItem from '../models/InventoryItem.js';
import Order from '../models/Order.js';
import { evaluateThresholdWorkflows } from '../workflows/workflow.service.js';
import { createApproval, HIGH_VALUE_THRESHOLD } from '../approvals/approval.service.js';
import { findSimilarInventoryItems } from './item-matching.js';
import { resolveItemName } from '../services/qwen.service.js';
import { normalizePaymentMethod } from '../constants/paymentMethods.js';
import { emitDashboardUpdate } from '../socket.js';

// Item names arrive from free-form WhatsApp text (Qwen NLP) — escape regex
// metacharacters so "Milk (1L)" matches literally instead of failing silently.
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Resolve a single order line item to an inventory document.
 * Supports lookup by inventoryItemId (dashboard) or by name (WhatsApp NLP),
 * with fuzzy, cross-lingual (Urdu/English), and semantic LLM resolution.
 */
const resolveInventoryItem = async (merchantId, lineItem) => {
  if (lineItem.inventoryItemId) {
    return InventoryItem.findOne({ _id: lineItem.inventoryItemId, merchantId });
  }

  const spokenName = (lineItem.name || '').trim();
  if (!spokenName) return null;

  // 1. Exact match (case-insensitive)
  const exact = await InventoryItem.findOne({
    merchantId,
    name: new RegExp(`^${escapeRegex(spokenName)}$`, 'i'),
  });
  if (exact) return exact;

  // 2. High-confidence fuzzy & bilingual dictionary match (handles "rice" <-> "چاول", "riece" -> "Rice", "lipton" -> "Lipton Yellow Label")
  const ranked = await findSimilarInventoryItems(merchantId, spokenName, { limit: 3, minScore: 0.50 });
  if (ranked.length > 0) {
    const top = ranked[0];
    const topNameLower = top.item.name.toLowerCase();
    const spokenLower = spokenName.toLowerCase();

    // High confidence: score >= 0.80, or full substring containment
    if (top.score >= 0.80 || topNameLower.includes(spokenLower) || spokenLower.includes(topNameLower)) {
      return top.item;
    }

    // Only one candidate and score >= 0.65
    if (ranked.length === 1 && top.score >= 0.65) {
      return top.item;
    }

    // Top candidate clearly beats the second candidate
    if (ranked.length >= 2 && top.score >= 0.65 && top.score - ranked[1].score >= 0.08) {
      return top.item;
    }
  }

  // 3. Fallback to LLM semantic matching (handles unique brand variants and complex Urdu/English phrasing)
  try {
    const allItems = await InventoryItem.find({ merchantId }).limit(100);
    if (allItems.length > 0) {
      const resolvedName = await resolveItemName(spokenName, allItems.map((i) => i.name));
      if (resolvedName) {
        const matched = allItems.find((i) => i.name.toLowerCase() === resolvedName.toLowerCase());
        if (matched) return matched;
      }
    }
  } catch (err) {
    console.warn('resolveInventoryItem LLM fallback error:', err.message);
  }

  // 4. Accept best available candidate if score >= 0.50 (prevents false negatives during presentations)
  if (ranked.length > 0 && ranked[0].score >= 0.50) {
    return ranked[0].item;
  }

  return null;
};

/**
 * The single source of truth for order creation and stock deduction.
 * Accepts either the WhatsApp command shape ({ item, amount }) or the
 * dashboard shape ({ items, total }).
 * @param {Object} command
 * @param {String|ObjectId} command.merchantId
 * @param {String} command.paymentMethod
 * @param {String} command.source
 * @param {Object} [command.item] - WhatsApp path: { name, quantity }
 * @param {Number} [command.amount] - WhatsApp path: total amount
 * @param {Array} [command.items] - Dashboard path: [{ inventoryItemId, name, quantity, price }]
 * @param {Number} [command.total] - Dashboard path: total amount
 */
export const createOrder = async (command) => {
  const { paymentMethod, source, merchantId } = command;

  // Normalize incoming line items to a single array shape
  const requestedItems = command.items
    ? command.items
    : command.item
      ? [{ ...command.item }]
      : [];

  if (!requestedItems.length) {
    throw new Error('INVALID_ORDER: No items provided.');
  }

  const orderItems = [];
  const updatedInventoryDocs = [];

  // 1. Resolve, validate, and deduct stock for each line item
  for (const lineItem of requestedItems) {
    const inventoryItem = await resolveInventoryItem(merchantId, lineItem);

    if (!inventoryItem) {
      throw new Error(
        `ITEM_NOT_FOUND: Cannot find '${lineItem.name || lineItem.inventoryItemId}' in inventory.`
      );
    }

    const quantity = Number(lineItem.quantity) || 0;
    if (inventoryItem.quantity < quantity) {
      throw new Error(
        `INSUFFICIENT_STOCK: Tried to deduct ${quantity}, but only ${inventoryItem.quantity} left.`
      );
    }

    inventoryItem.quantity -= quantity;
    await inventoryItem.save();
    updatedInventoryDocs.push(inventoryItem);

    orderItems.push({
      inventoryItemId: inventoryItem._id,
      name: inventoryItem.name,
      quantity,
      price: inventoryItem.price ?? lineItem.price ?? 0,
    });
  }

  // 2. Evaluate threshold workflows after stock deduction (non-blocking)
  try {
    for (const item of updatedInventoryDocs) {
      await evaluateThresholdWorkflows(merchantId, item);
    }
  } catch (err) {
    console.error('Threshold workflow evaluation failed:', err.message);
  }

  // 3. Compute order total
  const computedTotal = orderItems.reduce(
    (sum, i) => sum + i.quantity * i.price,
    0
  );
  const total = command.total ?? command.amount ?? computedTotal;

  // 4. Determine order status — high-value orders require approval before completion
  const status = total >= HIGH_VALUE_THRESHOLD ? 'pending_approval' : 'completed';

  const effectivePaymentMethod = normalizePaymentMethod(paymentMethod) || (paymentMethod ? String(paymentMethod).toLowerCase().trim() : 'cash');

  // 5. Construct and save the order
  const order = await Order.create({
    merchantId,
    items: orderItems,
    total,
    paymentMethod: effectivePaymentMethod,
    source,
    status,
  });

  // 6. If pending approval, create the approval record and notify the merchant
  if (status === 'pending_approval') {
    try {
      const summary = orderItems.map((i) => `${i.quantity}x ${i.name}`).join(', ');
      await createApproval({ merchantId, orderId: order._id, summary, amount: total });
    } catch (err) {
      console.error('Failed to create approval:', err.message);
    }
  }

  // 7. Emit WebSocket event to refresh dashboard
  emitDashboardUpdate(merchantId, { type: 'order', orderId: order._id, total, status });

  return order;
};
