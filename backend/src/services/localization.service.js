/**
 * Localization service — provides natural spoken phrasing and formatted
 * text messages in both Urdu and English for WhatsApp conversations.
 *
 * Spoken phrases are written in natural conversational Urdu script or English,
 * optimized for pronunciation by neural TTS models (e.g. ur-PK-UzmaNeural).
 */

import { getPaymentMethodDetails, normalizePaymentMethod } from '../constants/paymentMethods.js';

const PAYMENT_METHODS_UR = {
  cash: 'نقد',
  easypaisa: 'ایزی پیسہ',
  jazzcash: 'جاز کیش',
  sadapay: 'سادا پے',
  nayapay: 'نیا پے',
  raast: 'راست',
  bank: 'بینک',
  meezan: 'میزان بینک',
  hbl: 'ایچ بی ایل',
  ubl: 'یو بی ایل',
  alfalah: 'بینک الفلاح',
  mcb: 'ایم سی بی',
  faysal: 'فیصل بینک',
  allied: 'الائیڈ بینک',
  askari: 'عسکری بینک',
};

export function formatPaymentMethod(pm, language = 'ur') {
  if (!pm) return '';
  const canonical = normalizePaymentMethod(pm) || pm.toLowerCase();
  const details = getPaymentMethodDetails(canonical);

  if (language === 'ur') {
    return details?.nameUrdu || PAYMENT_METHODS_UR[canonical] || pm;
  }
  return details?.name || pm;
}

export const spokenPhrases = {
  orderLogged(language = 'ur', { quantity, itemName, paymentMethod, orderNo }) {
    const isUrdu = language === 'ur';
    const payFormatted = formatPaymentMethod(paymentMethod, language);

    if (isUrdu) {
      const orderPart = orderNo ? `۔ آرڈر نمبر ${orderNo}۔` : '۔';
      return {
        spoken: `آپ کی سیل درج کر لی گئی ہے: ${quantity} ${itemName}، ${payFormatted} پر${orderPart}`,
        text: `✅ سیل درج ہو گئی: ${quantity} x ${itemName} (${paymentMethod})${orderNo ? ` — آرڈر #${orderNo}` : ''}.`,
      };
    }

    const orderPart = orderNo ? ` — Order #${orderNo}` : '';
    return {
      spoken: `Your sale has been logged: ${quantity} ${itemName}, paid with ${paymentMethod}${orderNo ? `. Order number ${orderNo}.` : '.'}`,
      text: `✅ Logged: ${quantity} x ${itemName} (${paymentMethod})${orderPart}.`,
    };
  },

  insufficientStock(language = 'ur', { detail, itemName } = {}) {
    if (language === 'ur') {
      return {
        spoken: `معذرت، اس فروخت کے لیے اسٹاک میں مطلوبہ تعداد موجود نہیں ہے۔`,
        text: `اس فروخت کے لیے اسٹاک کافی نہیں ہے${detail ? ` — ${detail}` : ''}۔`,
      };
    }
    return {
      spoken: `Sorry, there is not enough stock for that sale.`,
      text: `Not enough stock for that sale${detail ? ` — ${detail}` : ''}.`,
    };
  },

  itemNotFound(language = 'ur', { saidName } = {}) {
    if (language === 'ur') {
      return {
        spoken: `معذرت، آپ کا کہا گیا آئٹم ${saidName ? `"${saidName}"` : ''} اسٹاک میں نہیں ملا۔`,
        text: `میں آپ کے اسٹاک میں "${saidName}" تلاش نہیں کر سکا — براہ کرم ڈیش بورڈ سے شامل کریں۔`,
      };
    }
    return {
      spoken: `Sorry, I couldn't find "${saidName}" in your stock.`,
      text: `I couldn't find "${saidName}" in your stock — add it from the dashboard first, or check the spelling.`,
    };
  },

  itemDisambiguation(language = 'ur', { saidName, candidates = [] }) {
    const candidateStr = candidates.join(' یا ');
    if (language === 'ur') {
      return {
        spoken: `آپ کا کہا گیا آئٹم اسٹاک میں نہیں ملا۔ کیا آپ کا مطلب ${candidateStr || 'دی گئی اشیاء'} میں سے ہے؟ نیچے دیے گئے بٹنوں سے منتخب کریں۔`,
        text: `میں آپ کے اسٹاک میں "${saidName}" تلاش نہیں کر سکا — کیا آپ کا مطلب تھا:`,
      };
    }
    return {
      spoken: `I couldn't find "${saidName}" in your stock. Did you mean ${candidates.join(' or ')}? Tap a button below.`,
      text: `I couldn't find "${saidName}" in your stock — did you mean:`,
    };
  },

  workflowCreated(language = 'ur', { rawInstruction } = {}) {
    if (language === 'ur') {
      return {
        spoken: `آپ کی آٹومیشن تیار ہو گئی ہے۔ میں اس کا خیال رکھوں گا۔`,
        text: `✅ آٹومیشن بن گئی: "${rawInstruction}". میں اس کا خیال رکھوں گا۔`,
      };
    }
    return {
      spoken: `Automation created. I'll take it from here.`,
      text: `✅ Automation created: "${rawInstruction}". I'll take it from here.`,
    };
  },

  unrecognizedIntent(language = 'ur') {
    if (language === 'ur') {
      return {
        spoken: `معاف کیجیے گا، مجھے پوری طرح سمجھ نہیں آیا۔ برائے مہربانی چیز کا نام اور تعداد بتائیں، جیسے دو چاول کیش۔`,
        text: `معاف کیجیے گا، بات سمجھ نہیں آئی۔ براہ کرم چیز اور تعداد بتائیں (مثلاً: "دو چاول کیش")، یا "order" کہیں۔`,
      };
    }
    return {
      spoken: `I didn't quite catch that. Please tell me the item and quantity, like "2 rice bags, cash".`,
      text: `I didn't quite catch that — try saying "2 rice, cash" or 'order' to log a sale.`,
    };
  },

  voiceProcessingError(language = 'ur') {
    if (language === 'ur') {
      return {
        spoken: `معذرت، آپ کا وائس نوٹ پروسیس نہیں ہو سکا۔ براہ کرم دوبارہ بول کر بھیجیں۔`,
        text: `وائس نوٹ سمجھنے میں دشواری ہوئی — دوبارہ بول کر یا لکھ کر بھیجیں۔`,
      };
    }
    return {
      spoken: `Sorry, I couldn't process that voice note. Please try speaking again or typing it.`,
      text: `Couldn't process that voice note — try typing it instead.`,
    };
  },

  genericError(language = 'ur') {
    if (language === 'ur') {
      return {
        spoken: `معذرت، سسٹم میں خرابی پیش آگئی ہے۔ براہ کرم تھوڑی دیر بعد کوشش کریں۔`,
        text: `معذرت، کچھ غلط ہو گیا ہے۔ براہ کرم کچھ دیر بعد کوشش کریں۔`,
      };
    }
    return {
      spoken: `Sorry, something went wrong on my end. Please try again in a moment.`,
      text: `Sorry, something went wrong on my end. Please try again in a moment, or use the dashboard.`,
    };
  },

  onboardingAskDetails(language = 'ur') {
    if (language === 'ur') {
      return {
        spoken: `اپنے کاروبار کا نام، مقام، اور آپ کیا بیچتے ہیں، ایک میسج یا وائس نوٹ میں بتا دیں۔`,
        text: `Business ka naam, location, aur aap kya bechte hain, ek message mein bata dein.`,
      };
    }
    return {
      spoken: `Tell me your business name, location, and what you sell — all in one message is fine.`,
      text: `Tell me your business name, location, and what you sell — all in one message is fine.`,
    };
  },

  onboardingAskInventory(language = 'ur') {
    if (language === 'ur') {
      return {
        spoken: `بہترین! اب اپنے موجودہ اسٹاک کی تفصیل بتا دیں — جیسے چیز کا نام، مقدار، اور قیمت۔ یا بعد میں شامل کرنے کے لیے "skip" کہہ دیں۔`,
        text: `Got it. Now list your starting stock (item, quantity, price) — or reply "skip" to add it later from the dashboard.`,
      };
    }
    return {
      spoken: `Got it. Now list your starting stock with item, quantity, and price — or say skip to add it later.`,
      text: `Got it. Now list your starting stock (item, quantity, price) — or reply "skip" to add it later from the dashboard.`,
    };
  },

  onboardingComplete(language = 'ur', addedCount = 0) {
    if (language === 'ur') {
      const stockMsg = addedCount > 0 ? `میں نے آپ کے اسٹاک میں ${addedCount} آئٹمز شامل کر دیے ہیں۔` : '';
      return {
        spoken: `مبارک ہو، آپ کا اکاؤنٹ تیار ہے! ${stockMsg} جب بھی سیل درج کرنی ہو، بس وائس نوٹ بھیج دیں۔`,
        text: addedCount > 0
          ? `You're all set! I added ${addedCount} item${addedCount === 1 ? '' : 's'} to your stock. Message me anytime to log a sale or create an automation.`
          : "You're all set! Message me anytime to log a sale or create an automation.",
      };
    }
    return {
      spoken: `You're all set! ${addedCount > 0 ? `I added ${addedCount} items to your stock.` : ''} Message or speak to me anytime to log a sale.`,
      text: addedCount > 0
        ? `You're all set! I added ${addedCount} item${addedCount === 1 ? '' : 's'} to your stock. Message me anytime to log a sale or create an automation.`
        : "You're all set! Message me anytime to log a sale or create an automation.",
    };
  },

  approvalReply(language = 'ur', isApprove = true) {
    if (language === 'ur') {
      return {
        spoken: isApprove ? 'آرڈر منظور کر لیا گیا ہے اور مکمل ہو گیا ہے۔' : 'آرڈر مسترد کر دیا گیا ہے اور اسٹاک بحال کر دیا گیا ہے۔',
        text: isApprove ? '✅ Order approved and marked as completed.' : '❌ Order rejected. Stock has been restored.',
      };
    }
    return {
      spoken: isApprove ? 'Order approved and marked as completed.' : 'Order rejected. Stock has been restored.',
      text: isApprove ? '✅ Order approved and marked as completed.' : '❌ Order rejected. Stock has been restored.',
    };
  },

  stockUpdated(language = 'ur', { itemName, addedQuantity, totalQuantity, price, unit } = {}) {
    const unitText = unit ? ` ${unit}` : '';
    if (language === 'ur') {
      const priceText = price != null ? ` (قیمت: Rs. ${price})` : '\n💡 اگر قیمت مقرر کرنی ہو تو لکھیں: "set price [چیز] [رقم]"';
      return {
        spoken: `اسٹاک اپڈیٹ ہو گیا ہے۔ ${itemName} کے ${addedQuantity}${unitText} شامل کر دیے گئے ہیں۔ اب کل اسٹاک ${totalQuantity} ہے۔${price != null ? `، قیمت ${price} روپے` : ''}`,
        text: `✅ اسٹاک اپڈیٹ: +${addedQuantity}${unitText} ${itemName} شامل کر دیے گئے۔ اب کل اسٹاک: ${totalQuantity}${priceText}۔`,
      };
    }
    const priceText = price != null ? ` (Price: Rs. ${price})` : '\n💡 To set selling price, type: "set price [item] [price]"';
    return {
      spoken: `Stock updated. Added ${addedQuantity}${unitText} ${itemName}. Total stock is now ${totalQuantity}.${price != null ? ` at ${price} rupees` : ''}`,
      text: `✅ Stock updated: +${addedQuantity}${unitText} ${itemName}. Total in stock: ${totalQuantity}${priceText}.`,
    };
  },

  stockChecked(language = 'ur', { itemName, quantity, price, unit } = {}) {
    const unitText = unit ? ` ${unit}` : '';
    if (language === 'ur') {
      return {
        spoken: `${itemName} کا موجودہ اسٹاک ${quantity}${unitText} ہے${price ? `، قیمت ${price} روپے` : ''}۔`,
        text: `📦 اسٹاک معلومات: *${itemName}*\n• دستیاب مقدار: ${quantity}${unitText}\n• قیمت فی یونٹ: ${price != null ? `Rs. ${price}` : 'مقرر نہیں'}`,
      };
    }
    return {
      spoken: `Current stock for ${itemName} is ${quantity}${unitText}${price ? ` at ${price} rupees` : ''}.`,
      text: `📦 Stock Check: *${itemName}*\n• In Stock: ${quantity}${unitText}\n• Price: ${price != null ? `Rs. ${price}` : 'Not set'}`,
    };
  },

  helpCommands(language = 'ur') {
    if (language === 'ur') {
      return {
        spoken: `یہ وربا ٹاسک کی مکمل رہنمائی ہے۔ آپ بول کر یا لکھ کر سیل درج کر سکتے ہیں، نیا مال شامل کر سکتے ہیں، رپورٹس منگوا سکتے ہیں، اور دکان کی سیٹنگز بدل سکتے ہیں۔`,
        text: `📋 *وربا ٹاسک مکمل رہنمائی / Commands Guide*\n\nآپ یہ تمام کام واٹس ایپ پر بول کر یا لکھ کر سکتے ہیں:\n\n🛒 *1. سیل درج کرنا (Sales)*\n• وائس نوٹ: بولیں "دو کلو چینی کیش" یا "5 چاول ایزی پیسہ"\n• لکھیں: "2 rice cash" یا "10 milk jazzcash"\n• گائیڈڈ بٹن: لکھیں *"order"*\n\n📦 *2. انوینٹری اور نیا مال (Stock & Inventory)*\n• نیا مال قیمت کے ساتھ: "add 50 rice price 300" یا "maal aya 20 chini 150"\n• قیمت مقرر کریں: *"set price rice 300"* یا *"chini ki price 160"*\n• اسٹاک چیک کریں: "stock rice" یا "chini kitni hai"\n• کل سامان کی لسٹ: لکھیں *"stock list"* یا *"inventory"*\n\n📄 *3. پی ڈی ایف رپورٹس (PDF Reports)*\n• لکھیں *"report"* (سیلز، انوینٹری، کم اسٹاک یا ایکسپائری رپورٹس)\n\n⚙️ *4. دکان اور سیٹنگز (Store & Settings)*\n• دکان کی معلومات: لکھیں *"profile"* یا *"settings"*\n• دکان کا نام بدلیں: *"set name [نیا نام]"*\n• شہر / مقام بدلیں: *"set location [شہر]"*\n• زبان تبدیل کریں: *"urdu"* یا *"english"*\n• وائس جوابات: *"voice on"* یا *"voice off"*\n\n💳 *5. بینک اور ادائیگی (Payment & Banks)*\n• طریقے دیکھیں: لکھیں *"banks"* یا *"payment methods"*\n• آن / آف کریں: *"enable easypaisa"* یا *"disable jazzcash"*\n\n⚡ *6. آٹومیشن الرٹس (Workflows)*\n• بول کر الرٹ بنائیں: "jab doodh 5 se kam ho alert karo"\n• لسٹ دیکھیں: لکھیں *"workflows"*`,
      };
    }
    return {
      spoken: `Here is your VerbaTask commands guide. You can log sales, add stock, check inventory, download PDF reports, and manage store settings by speaking or typing.`,
      text: `📋 *VerbaTask Commands Guide*\n\nYou can manage your entire store by speaking or typing:\n\n🛒 *1. Log Sales*\n• Voice Note: Send audio like "2 kg sugar cash" or "5 rice easypaisa"\n• Text: Type "2 rice cash" or "10 milk jazzcash"\n• Guided Flow: Type *"order"* to pick from stock list\n\n📦 *2. Stock & Inventory*\n• Add Stock with Price: "add 50 rice price 300" or "maal aya 20 chini 150"\n• Set / Update Price: *"set price rice 300"* or *"price sugar 160"*\n• Check Stock: "stock rice" or "how much sugar left"\n• View All Stock: Type *"stock list"* or *"inventory"*\n\n📄 *3. Download PDF Reports*\n• Type *"report"* for sales, inventory, low stock, or expiring reports\n\n⚙️ *4. Store & Profile Settings*\n• View Store Info: Type *"profile"* or *"settings"*\n• Change Shop Name: *"set name [New Name]"*\n• Change Location: *"set location [City]"*\n• Switch Language: Type *"urdu"* or *"english"*\n• Voice Replies: Type *"voice on"* or *"voice off"*\n\n💳 *5. Payment & Banks*\n• View Accepted Methods: Type *"banks"* or *"payment methods"*\n• Enable / Disable: *"enable easypaisa"* or *"disable jazzcash"*\n\n⚡ *6. Automations & Alerts*\n• Create Alert: "alert me when cooking oil is below 5"\n• View Active Rules: Type *"workflows"*`,
    };
  },
};
