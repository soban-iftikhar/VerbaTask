import InventoryItem from '../models/InventoryItem.js';
import { findSimilarInventoryItems, cleanAndStandardizeItemName } from './item-matching.js';
import { emitDashboardUpdate } from '../socket.js';
import { spokenPhrases } from '../services/localization.service.js';

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Restocks an existing inventory item or creates a new one if not found.
 * Emits real-time WebSocket events to synchronize the web dashboard.
 */
export async function restockItemViaCrm(merchant, command) {
  const language = command.language || merchant.language || 'ur';
  const rawName = command.item?.name?.trim() || 'Item';
  const quantity = Math.max(1, parseInt(command.item?.quantity, 10) || 1);
  const price = command.item?.price != null ? Number(command.item.price) : null;
  const unit = command.item?.unit || null;

  // 1. Direct case-insensitive match first
  let item = await InventoryItem.findOne({
    merchantId: merchant._id,
    name: new RegExp(`^${escapeRegex(rawName)}$`, 'i'),
  });

  // 2. Fuzzy / cross-lingual match if direct match fails
  if (!item) {
    const ranked = await findSimilarInventoryItems(merchant._id, rawName, { limit: 1, minScore: 0.65 });
    if (ranked.length > 0) {
      item = ranked[0].item;
    }
  }

  if (item) {
    // Increment existing stock
    item.quantity = (item.quantity || 0) + quantity;
    if (price != null) item.price = price;
    if (unit) item.unit = unit;
    await item.save();

    emitDashboardUpdate(merchant._id, {
      type: 'inventory',
      action: 'update',
      itemId: item._id,
      itemName: item.name,
      quantity: item.quantity,
    });

    return spokenPhrases.stockUpdated(language, {
      itemName: item.name,
      addedQuantity: quantity,
      totalQuantity: item.quantity,
      price: item.price,
      unit: item.unit,
    });
  }

  // 3. New item creation
  const standardizedName = cleanAndStandardizeItemName(rawName);
  item = await InventoryItem.create({
    merchantId: merchant._id,
    name: standardizedName,
    quantity,
    ...(price != null && { price }),
    ...(unit && { unit }),
  });

  emitDashboardUpdate(merchant._id, {
    type: 'inventory',
    action: 'create',
    itemId: item._id,
    itemName: item.name,
    quantity: item.quantity,
  });

  return spokenPhrases.stockUpdated(language, {
    itemName: item.name,
    addedQuantity: quantity,
    totalQuantity: item.quantity,
    price: item.price,
    unit: item.unit,
  });
}

/**
 * Checks the available stock and price for a specific product.
 */
export async function checkStockViaCrm(merchant, command) {
  const language = command.language || merchant.language || 'ur';
  const rawName = command.item?.name?.trim() || '';

  if (!rawName) {
    return {
      spoken: language === 'ur' ? 'برائے مہربانی چیز کا نام بتائیں جس کا اسٹاک چیک کرنا ہے۔' : 'Please specify the item name you want to check.',
      text: language === 'ur' ? 'برائے مہربانی چیز کا نام بتائیں، جیسے: "stock rice" یا "چینی کا اسٹاک"۔' : 'Please specify the item name, for example: "stock rice" or "how much sugar left".',
    };
  }

  // 1. Direct case-insensitive match
  let item = await InventoryItem.findOne({
    merchantId: merchant._id,
    name: new RegExp(`^${escapeRegex(rawName)}$`, 'i'),
  });

  // 2. Fuzzy / cross-lingual match
  if (!item) {
    const ranked = await findSimilarInventoryItems(merchant._id, rawName, { limit: 1, minScore: 0.6 });
    if (ranked.length > 0) {
      item = ranked[0].item;
    }
  }

  if (!item) {
    return spokenPhrases.itemNotFound(language, { saidName: rawName });
  }

  return spokenPhrases.stockChecked(language, {
    itemName: item.name,
    quantity: item.quantity,
    price: item.price,
    unit: item.unit,
  });
}

/**
 * Formats a clean, readable stock list for WhatsApp.
 */
export async function getStockListSummary(merchant) {
  const language = merchant.language || 'ur';
  const items = await InventoryItem.find({ merchantId: merchant._id }).sort({ quantity: 1, name: 1 }).limit(25);

  if (!items || items.length === 0) {
    return {
      spoken: language === 'ur' ? 'آپ کی انوینٹری خالی ہے۔ نیا سامان شامل کرنے کے لیے بولیں یا لکھیں، جیسے ایڈ بیس چاول۔' : 'Your inventory is currently empty. You can add items by saying "add 20 rice".',
      text: language === 'ur'
        ? '📦 *آپ کی انوینٹری خالی ہے!*\n\nنیا مال شامل کرنے کے لیے لکھیں یا بولیں:\n• "maal aya 20 chini"\n• "add 50 rice price 300"'
        : '📦 *Your inventory is currently empty!*\n\nTo restock or add items, say or type:\n• "add 50 rice price 300"\n• "maal aya 20 chini"',
    };
  }

  const lines = items.map((i) => {
    const lowWarning = i.quantity <= 5 ? (language === 'ur' ? ' ⚠️ (کم)' : ' ⚠️ (Low)') : '';
    const priceStr = i.price != null ? ` — Rs. ${i.price}` : '';
    const unitStr = i.unit ? ` ${i.unit}` : '';
    return `• *${i.name}*: ${i.quantity}${unitStr}${priceStr}${lowWarning}`;
  });

  if (language === 'ur') {
    return {
      spoken: `آپ کے اسٹاک میں کل ${items.length} اشیاء ہیں۔ تفصیلی لسٹ آپ کو بھیج دی گئی ہے۔`,
      text: `📦 *موجودہ اسٹاک کی فہرست (${items.length} اشیاء):*\n\n${lines.join('\n')}\n\n💡 *مکمل پی ڈی ایف رپورٹ کے لیے "report" لکھیں۔*`,
    };
  }

  return {
    spoken: `You have ${items.length} items in your stock list. Here is the summary.`,
    text: `📦 *Current Stock List (${items.length} items):*\n\n${lines.join('\n')}\n\n💡 *Type "report" for a complete downloadable PDF.*`,
  };
}

/**
 * Updates or sets the selling price of an inventory item.
 */
export async function updateItemPriceViaCrm(merchant, rawItemName, newPrice) {
  const language = merchant.language || 'ur';
  const price = Math.max(0, Number(newPrice) || 0);

  // 1. Direct case-insensitive match first
  let item = await InventoryItem.findOne({
    merchantId: merchant._id,
    name: new RegExp(`^${escapeRegex(rawItemName.trim())}$`, 'i'),
  });

  // 2. Fuzzy / cross-lingual match
  if (!item) {
    const ranked = await findSimilarInventoryItems(merchant._id, rawItemName, { limit: 1, minScore: 0.6 });
    if (ranked.length > 0) {
      item = ranked[0].item;
    }
  }

  if (!item) {
    const standardizedName = cleanAndStandardizeItemName(rawItemName);
    item = await InventoryItem.create({
      merchantId: merchant._id,
      name: standardizedName,
      quantity: 0,
      price,
    });

    emitDashboardUpdate(merchant._id, {
      type: 'inventory',
      action: 'create',
      itemId: item._id,
      itemName: item.name,
      price: item.price,
    });
  } else {
    item.price = price;
    await item.save();

    emitDashboardUpdate(merchant._id, {
      type: 'inventory',
      action: 'update',
      itemId: item._id,
      itemName: item.name,
      price: item.price,
    });
  }

  if (language === 'ur') {
    return {
      spoken: `${item.name} کی قیمت ${price} روپے مقرر کر دی گئی ہے۔`,
      text: `✅ قیمت اپڈیٹ: *${item.name}* کی قیمت *Rs. ${price}* مقرر کر دی گئی ہے۔`,
    };
  }

  return {
    spoken: `Price for ${item.name} updated to ${price} rupees.`,
    text: `✅ Price updated: *${item.name}* price set to *Rs. ${price}*.`,
  };
}
