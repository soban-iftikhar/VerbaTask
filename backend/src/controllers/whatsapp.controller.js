import Merchant from '../models/Merchant.js';
import InventoryItem from '../models/InventoryItem.js';
import ConversationState from '../models/ConversationState.js';

import { createOrder } from '../crm/order.service.js';
import { evaluateMessageWorkflows, createWorkflow } from '../workflows/workflow.service.js';
import { respond as respondToApproval, findPendingByOrderId } from '../approvals/approval.service.js';
import { generateLinkCode } from './auth.controller.js';
import { emitDashboardUpdate } from '../socket.js';
import { parseIntent, extractBusinessDetails, extractInventoryItems, resolveItemName } from '../services/qwen.service.js';
import { findSimilarInventoryItems, cleanAndStandardizeItemName } from '../crm/item-matching.js';
import { transcribeAndParse } from '../agent/transcribeAndParse.js';
import { downloadMedia } from '../services/media.service.js';
import {
  generateInventoryReport,
  generateLowStockReport,
  generateExpiringReport,
  generateSalesReport,
  generateTopSellingReport
} from '../services/report.service.js';
import {
  sendTextMessage as sendTextMessageRaw,
  sendInteractiveButtons as sendInteractiveButtonsRaw,
  sendInteractiveList as sendInteractiveListRaw,
  sendVoiceReply as sendVoiceReplyRaw,
  sendDocumentMessage as sendDocumentMessageRaw,
  paginateRows,
} from '../services/whatsapp.service.js';
import { spokenPhrases } from '../services/localization.service.js';
import {
  getPaymentMethodDetails,
  normalizePaymentMethod,
  DEFAULT_ACCEPTED_PAYMENT_METHODS,
} from '../constants/paymentMethods.js';

/**
 * WhatsApp webhook controller — routes every inbound message to the right
 * flow: registration (unknown number), onboarding, or the main command
 * router for onboarded merchants. Acknowledges Meta immediately and does
 * all real work after, so slow AI calls never trigger Meta's retry storm.
 */
const SIGNUP_BASE_URL = process.env.SIGNUP_BASE_URL || 'https://verbatask.netlify.app/signup';

/**
 * Safe WhatsApp reply helper — never lets a failed outbound send crash the
 * webhook handler. Logs the failure so we still know something went wrong.
 */
async function sendTextMessage(to, text) {
  try {
    return await sendTextMessageRaw(to, text);
  } catch (err) {
    console.error('sendTextMessage failed:', err.message);
  }
}

async function sendVoiceReply(to, options) {
  try {
    return await sendVoiceReplyRaw(to, options);
  } catch (err) {
    console.error('sendVoiceReply failed:', err.message);
  }
}

async function sendInteractiveButtons(to, body, buttons) {
  try {
    return await sendInteractiveButtonsRaw(to, body, buttons);
  } catch (err) {
    console.error('sendInteractiveButtons failed:', err.message);
  }
}

async function sendInteractiveList(to, body, buttonText, sections) {
  try {
    return await sendInteractiveListRaw(to, body, buttonText, sections);
  } catch (err) {
    console.error('sendInteractiveList failed:', err.message);
  }
}

async function sendDocumentMessage(to, mediaId, filename, caption) {
  try {
    return await sendDocumentMessageRaw(to, mediaId, filename, caption);
  } catch (err) {
    console.error('sendDocumentMessage failed:', err.message);
  }
}

/**
 * Determines whether the bot should reply with a spoken voice note.
 * Respects merchant preferences (replyPreference) and environment configuration.
 */
function shouldReplyWithVoice(merchant, source) {
  if (process.env.VOICE_REPLY_MODE === 'text_only') return false;
  if (merchant?.replyPreference === 'text_only') return false;
  if (merchant?.replyPreference === 'always_voice' || process.env.VOICE_REPLY_MODE === 'always_voice') return true;
  // Default: voice_on_voice — voice reply when merchant sent voice
  return source === 'voice';
}

/**
 * Smart bilingual reply helper — sends a spoken voice note if voice was used,
 * or text message if text was used.
 */
async function replyToMerchant(merchant, phrases, source = 'text', languageOverride = null) {
  const language = languageOverride || merchant?.language || 'ur';
  const spokenText = typeof phrases === 'string' ? phrases : phrases?.spoken || phrases?.text;
  const textReceipt = typeof phrases === 'string' ? phrases : phrases?.text;

  if (shouldReplyWithVoice(merchant, source)) {
    const isReceipt = !!(textReceipt && (textReceipt.includes('✅') || textReceipt.includes('آرڈر #')));
    return sendVoiceReply(merchant.whatsappNumber, {
      spokenText,
      textReceipt: isReceipt ? textReceipt : null,
      language,
      alsoSendText: isReceipt,
    });
  }

  return sendTextMessage(merchant.whatsappNumber, textReceipt);
}

function friendlyFallback(err, language = 'ur') {
  return spokenPhrases.genericError(language).text;
}

/** Meta's one-time webhook verification handshake (GET /webhook/whatsapp). */
export function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (
    mode === 'subscribe' &&
    process.env.WHATSAPP_VERIFY_TOKEN &&
    token === process.env.WHATSAPP_VERIFY_TOKEN
  ) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
}

// ---------------------------------------------------------------------------
// Idempotency — Meta can and does redeliver the same webhook event on a slow
// or non-200 response. An in-memory FIFO is enough for a hackathon prototype;
// swap for a Mongo collection with a TTL index if this needs to survive a
// server restart.
// ---------------------------------------------------------------------------
const seenMessageIds = new Set();
function alreadyProcessed(id) {
  if (seenMessageIds.has(id)) return true;
  seenMessageIds.add(id);
  // Trim oldest first (Sets iterate in insertion order) — clearing wholesale
  // would briefly allow redelivered recent messages to be processed twice.
  if (seenMessageIds.size > 1000) {
    seenMessageIds.delete(seenMessageIds.values().next().value);
  }
  return false;
}

/** Entry point for every inbound event (POST /webhook/whatsapp). */
export async function handleIncomingMessage(req, res) {
  // Always ack fast — Meta retries aggressively on non-200/timeout, and a
  // retry storm on top of a slow Qwen call is worse than an occasional
  // dropped event for a prototype.
  res.sendStatus(200);

  try {
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];
    if (!message) return; // status/delivery updates land here too — nothing to do

    if (alreadyProcessed(message.id)) return;

    const from = message.from; // WhatsApp number, no '+' prefix
    const merchant = await Merchant.findOne({ whatsappNumber: from });

    // `return await` throughout — a bare `return promise()` would let a
    // rejection skip this catch entirely and surface as an unhandled
    // rejection (which kills the Node process by default).
    if (!merchant) return await handleUnregisteredNumber(from);
    if (!merchant.onboardingComplete) return await handleOnboarding(merchant, message);
    return await handleOnboardedMerchant(merchant, message);
  } catch (err) {
    console.error('handleIncomingMessage error:', err);
  }
}

/**
 * Unknown number → send the signup link plus a fresh linking code the web
 * signup flow will ask for. generateLinkCode (auth module) reuses an
 * unexpired, unused code rather than issuing a new one on every message.
 */
async function handleUnregisteredNumber(whatsappNumber) {
  const linkCode = await generateLinkCode(whatsappNumber);

  await sendTextMessage(
    whatsappNumber,
    `Welcome to VerbaTask! 👋\n\nTo get started, create your account here:\n${SIGNUP_BASE_URL}\n\nYour linking code: *${linkCode.code}*\n(valid for 15 minutes)`
  );
}

async function sendLinkCodeToMerchant(merchant) {
  const linkCode = await generateLinkCode(merchant.whatsappNumber);

  await sendTextMessage(
    merchant.whatsappNumber,
    `Your VerbaTask linking code: *${linkCode.code}*\n(valid for 15 minutes)\n\nEnter it on the Link Code page to connect this number to your dashboard account.`
  );
}

/**
 * Onboarding conversation: language → business details → initial stock.
 * Progress persists in ConversationState between messages and is deleted
 * once onboardingComplete is set on the merchant.
 */
async function handleOnboarding(merchant, message) {
  let state = await ConversationState.findOne({ whatsappNumber: merchant.whatsappNumber });
  if (!state) {
    state = await ConversationState.create({
      whatsappNumber: merchant.whatsappNumber,
      merchantId: merchant._id,
      flow: 'onboarding',
      step: 'awaiting_language',
    });
    return sendInteractiveButtons(merchant.whatsappNumber, 'Please choose your language:', [
      { id: 'lang_ur', title: 'اردو' },
      { id: 'lang_en', title: 'English' },
    ]);
  }

  const replyId = message.interactive?.button_reply?.id;
  let text = message.text?.body?.trim();
  const isVoice = message.type === 'audio';

  // Support voice notes in onboarding: transcribe audio via Whisper
  if (isVoice && message.audio?.id) {
    try {
      const { buffer, mimeType } = await downloadMedia(message.audio.id);
      const res = await transcribeAndParse(buffer, mimeType, merchant.language);
      text = res?.transcript?.trim() || '';
    } catch (err) {
      console.error('Onboarding voice note transcription failed:', err.message);
    }
  }

  // Allow users to request a dashboard link code at any point during onboarding.
  if (text && (text.toLowerCase() === 'link' || text.toLowerCase() === 'code')) {
    return sendLinkCodeToMerchant(merchant);
  }

  switch (state.step) {
    case 'awaiting_language': {
      const language = replyId === 'lang_en' ? 'en' : 'ur';
      merchant.language = language;
      await merchant.save();
      state.step = 'awaiting_business_details';
      await state.save();
      return replyToMerchant(merchant, spokenPhrases.onboardingAskDetails(language), 'text');
    }

    case 'awaiting_business_details': {
      if (!text) {
        return replyToMerchant(
          merchant,
          isVoice
            ? spokenPhrases.voiceProcessingError(merchant.language)
            : 'Please send this as text or a voice note.',
          isVoice ? 'voice' : 'text'
        );
      }
      // Qwen extracts name/location/sells; if it can't (no key, timeout,
      // garbage JSON) keep the raw text on businessName so onboarding never
      // blocks on a flaky NLP call.
      const details = await extractBusinessDetails(text);
      merchant.businessName = details?.businessName || text;
      if (details?.businessType) merchant.businessType = details.businessType;
      if (details?.location) merchant.location = details.location;
      if (details?.sells) merchant.sells = details.sells;
      await merchant.save();
      state.step = 'awaiting_inventory';
      await state.save();
      return replyToMerchant(
        merchant,
        {
          spoken: `${merchant.businessName}. ${spokenPhrases.onboardingAskInventory(merchant.language).spoken}`,
          text: `Got it — ${merchant.businessName}${details?.businessType ? ` (${details.businessType})` : ''}. ${spokenPhrases.onboardingAskInventory(merchant.language).text}`,
        },
        isVoice ? 'voice' : 'text'
      );
    }

    case 'awaiting_inventory': {
      if (!text) {
        return replyToMerchant(
          merchant,
          isVoice
            ? spokenPhrases.voiceProcessingError(merchant.language)
            : 'Please send your stock list as text or a voice note.',
          isVoice ? 'voice' : 'text'
        );
      }
      let addedCount = 0;
      if (text.toLowerCase() !== 'skip') {
        // Qwen parses the free-form list into real line items; when it can't,
        // store the raw text as a single unparsed item (the old behaviour)
        // rather than losing the merchant's input.
        const items = await extractInventoryItems(text);
        if (items?.length) {
          await InventoryItem.insertMany(
            items.map((i) => ({
              merchantId: merchant._id,
              name: cleanAndStandardizeItemName(i.name),
              quantity: i.quantity,
              ...(i.price != null && { price: i.price }),
              ...(i.unit && { unit: i.unit }),
            }))
          );
          addedCount = items.length;
        } else {
          await InventoryItem.create({
            merchantId: merchant._id,
            name: cleanAndStandardizeItemName(text),
            quantity: 0,
          });
        }
      }
      merchant.onboardingComplete = true;
      await merchant.save();
      await ConversationState.deleteOne({ _id: state._id });
      return replyToMerchant(
        merchant,
        spokenPhrases.onboardingComplete(merchant.language, addedCount),
        isVoice ? 'voice' : 'text'
      );
    }

    default:
      // Corrupted/unexpected state — reset rather than get stuck.
      await ConversationState.deleteOne({ _id: state._id });
      return handleOnboarding(merchant, message);
  }
}

/**
 * Fully onboarded merchant — resumes an in-flight guided order, otherwise
 * routes by message type: text (NLP/command), interactive (menu), audio
 * (voice-note pipeline), image (OCR placeholder).
 */
async function handleOnboardedMerchant(merchant, message) {
  console.log('RECEIVED MESSAGE:', JSON.stringify(message, null, 2));
  try {
    // Check approval button taps first — before the guided-order state check so
    // an approve/reject tap mid-guided-order isn't swallowed by that flow.
    if (message.type === 'interactive') {
      const buttonId = message.interactive?.button_reply?.id;
      if (buttonId?.startsWith('approve_') || buttonId?.startsWith('reject_')) {
        return await handleApprovalReply(merchant, buttonId);
      }
      
      if (buttonId?.startsWith('clearexpiry_')) {
        return await handleClearExpiryReply(merchant, buttonId);
      }

      // "Did you mean?" replies for fuzzy item matches — checked early so a
      // mid-flow guided order doesn't swallow the tap.
      if (buttonId?.startsWith('pick_')) {
        return await handleDisambiguationReply(merchant, buttonId);
      }

      // Language selection buttons
      if (buttonId === 'set_lang_ur') {
        merchant.language = 'ur';
        await merchant.save();
        return replyToMerchant(merchant, {
          spoken: 'آپ کی زبان کامیابی سے اردو میں تبدیل کر دی گئی ہے۔ اب آپ کے تمام جوابات اردو میں دیے جائیں گے۔',
          text: '✅ زبان تبدیل کر دی گئی ہے: اردو۔ اب تمام جوابات اردو میں ملیں گے۔'
        }, 'voice', 'ur');
      }
      if (buttonId === 'set_lang_en') {
        merchant.language = 'en';
        await merchant.save();
        return replyToMerchant(merchant, {
          spoken: 'Language has been switched to English successfully. All responses will now be in English.',
          text: '✅ Language changed to English. All replies will now be in English.'
        }, 'voice', 'en');
      }
    }

    const existingState = await ConversationState.findOne({
      whatsappNumber: merchant.whatsappNumber,
      flow: 'guided_order',
    });
    if (existingState) {
      // An abandoned guided order used to swallow EVERY subsequent message
      // forever (nothing ever reached the workflows or NLP again). Expire it
      // after 30 idle minutes and fall through to normal routing instead.
      const idleMs = Date.now() - new Date(existingState.updatedAt).getTime();
      if (idleMs > 30 * 60 * 1000) {
        await ConversationState.deleteOne({ _id: existingState._id });
      } else if (message.type === 'text' && message.text?.body?.toLowerCase().includes('report')) {
        // Global override: If they explicitly ask for a report, abort the guided flow
        await ConversationState.deleteOne({ _id: existingState._id });
      } else {
        return await continueGuidedOrder(merchant, message, existingState);
      }
    }

    if (message.type === 'text') {
      return await handleTextMessage(merchant, message.text.body);
    }

    if (message.type === 'interactive') {
      const listId = message.interactive?.list_reply?.id;
      if (listId === 'start_guided_order') return await startGuidedOrder(merchant);
      return sendTextMessage(merchant.whatsappNumber, "Sorry, I didn't expect that reply — try again?");
    }

    if (message.type === 'audio') {
      return await handleVoiceNote(merchant, message.audio.id);
    }

    if (message.type === 'image') {
      // Optional OCR path — not the primary flow. Ack for now.
      return sendTextMessage(
        merchant.whatsappNumber,
        "Got your image — screenshot reconciliation isn't wired up yet, log this sale manually for now."
      );
    }

    return sendTextMessage(merchant.whatsappNumber, "I can't handle that message type yet.");
  } catch (err) {
    console.error('handleOnboardedMerchant error:', err);
    return sendTextMessage(merchant.whatsappNumber, friendlyFallback(err));
  }
}

/** Typed text: "order" starts the guided flow, "link"/"code" resends the dashboard linking code, message workflows are checked next, anything else goes through Qwen NLP. */
async function handleTextMessage(merchant, text) {
  const normalized = text.trim().toLowerCase();

  if (/^(order|sale|log)$/i.test(normalized)) return startGuidedOrder(merchant);
  if (normalized === 'link' || normalized === 'code') return sendLinkCodeToMerchant(merchant);

  // Language switching commands
  if (/^(urdu|اردو)$/i.test(normalized)) {
    merchant.language = 'ur';
    await merchant.save();
    return replyToMerchant(merchant, {
      spoken: 'آپ کی زبان کامیابی سے اردو میں تبدیل کر دی گئی ہے۔ اب آپ کے تمام جوابات اردو میں دیے جائیں گے۔',
      text: '✅ زبان تبدیل کر دی گئی ہے: اردو۔ اب تمام جوابات اردو میں ملیں گے۔'
    }, 'text', 'ur');
  }

  if (/^english$/i.test(normalized)) {
    merchant.language = 'en';
    await merchant.save();
    return replyToMerchant(merchant, {
      spoken: 'Language has been switched to English successfully. All responses will now be in English.',
      text: '✅ Language changed to English. All replies will now be in English.'
    }, 'text', 'en');
  }

  if (/^(language|زبان)$/i.test(normalized)) {
    return sendInteractiveButtons(merchant.whatsappNumber, 'Please choose your language / اپنی زبان منتخب کریں:', [
      { id: 'set_lang_ur', title: 'اردو' },
      { id: 'set_lang_en', title: 'English' },
    ]);
  }

  // Check stored message workflows first — if any fire, skip NLP entirely
  try {
    const triggered = await evaluateMessageWorkflows(merchant._id, text);
    if (triggered.length > 0) return; // workflow(s) already replied to the merchant
  } catch (err) {
    console.error('evaluateMessageWorkflows error:', err.message);
  }

  try {
    const intent = await parseIntent(text);
    const detectedLanguage = /[\u0600-\u06FF]/.test(text) ? 'ur' : (merchant.language || 'ur');
    return await routeParsedCommand(merchant, { ...intent, language: detectedLanguage }, 'text');
  } catch (err) {
    console.error('parseIntent failed:', err.message);
    return sendTextMessage(
      merchant.whatsappNumber,
      "I didn't quite catch that — try 'order' to log a sale, or describe an automation you'd like."
    );
  }
}

/** Voice note: download audio, transcribe + parse via agent/, then run the command. */
async function handleVoiceNote(merchant, mediaId) {
  try {
    const { buffer, mimeType } = await downloadMedia(mediaId);
    const intent = await transcribeAndParse(buffer, mimeType, merchant.language);
    const effectiveLanguage = intent.detectedLanguage || merchant.language || 'ur';
    return routeParsedCommand(merchant, { ...intent, language: effectiveLanguage }, 'voice');
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data ? JSON.stringify(err.response.data) : '';
    console.error(
      `voice note handling failed for ${merchant.whatsappNumber}: ${err.message}${status ? ` (status ${status})` : ''}${body ? ` ${body}` : ''}`
    );
    return replyToMerchant(merchant, spokenPhrases.voiceProcessingError(merchant.language), 'voice');
  }
}

/**
 * Runs one parsed Qwen command. Both input paths (typed text and voice)
 * converge here on the identical structured command shape, so downstream
 * handling never knows which path produced it (per the architecture guide).
 */
async function routeParsedCommand(merchant, intent, source) {
  const effectiveLanguage = intent.language || merchant.language || 'ur';

  if (intent.type === 'log_sale') {
    return createOrderViaCrm(merchant, {
      type: 'log_sale',
      merchantId: merchant._id,
      item: intent.item,
      paymentMethod: intent.paymentMethod,
      amount: intent.amount,
      source,
      language: effectiveLanguage,
    });
  }

  if (intent.type === 'create_workflow') {
    return createWorkflowViaModule(merchant, {
      merchantId: merchant._id,
      trigger: intent.trigger,
      condition: intent.condition,
      action: intent.action,
      rawInstruction: intent.rawInstruction,
      source,
      language: effectiveLanguage,
    });
  }

  if (intent.type === 'generate_report') {
    return handleReportRequest(merchant, intent.reportType, source, effectiveLanguage);
  }

  if (intent.type === 'greeting') {
    const greetingPhrases = effectiveLanguage === 'en'
      ? {
          spoken: 'Hello! How can I help you today? What sale would you like to record?',
          text: 'Hello! How can I help? You can speak or type your sale, for example "2 rice cash".',
        }
      : {
          spoken: 'وعلیکم السلام! فرمائیے، کیا سیل درج کرنی ہے؟',
          text: 'وعلیکم السلام! فرمائیے، کیا سیل درج کرنی ہے؟ آپ بول کر بھی سیل درج کروا سکتے ہیں، جیسے "دو چاول کیش"۔',
        };
    return replyToMerchant(merchant, greetingPhrases, source, effectiveLanguage);
  }

  return replyToMerchant(merchant, spokenPhrases.unrecognizedIntent(effectiveLanguage), source, effectiveLanguage);
}

async function handleReportRequest(merchant, reportType, source, language) {
  const waitMsg = language === 'en' ? 'Generating your PDF report, please wait...' : 'آپ کی رپورٹ تیار ہو رہی ہے، براہ کرم انتظار کریں...';
  await sendTextMessage(merchant.whatsappNumber, waitMsg);

  try {
    let report;
    switch (reportType) {
      case 'low_stock':
        report = await generateLowStockReport(merchant);
        break;
      case 'top_selling':
        report = await generateTopSellingReport(merchant);
        break;
      case 'expiring':
        report = await generateExpiringReport(merchant);
        break;
      case 'sales':
        report = await generateSalesReport(merchant);
        break;
      case 'inventory':
      default:
        report = await generateInventoryReport(merchant);
        break;
    }

    const { uploadMedia } = await import('../services/media.service.js');
    const { id: mediaId } = await uploadMedia(report.buffer, 'application/pdf', report.filename);
    
    await sendDocumentMessage(
      merchant.whatsappNumber,
      mediaId,
      report.filename,
      language === 'en' ? 'Here is your requested report! 📄' : 'یہ رہی آپ کی رپورٹ! 📄'
    );
  } catch (err) {
    console.error('Report generation failed:', err);
    await sendTextMessage(
      merchant.whatsappNumber,
      language === 'en' ? 'Sorry, something went wrong while generating your report.' : 'معذرت، رپورٹ تیار کرنے میں کچھ مسئلہ پیش آیا۔'
    );
  }
}

// ---------------------------------------------------------------------------
// Guided order flow: item picker → quantity → payment method → confirm
// ---------------------------------------------------------------------------
/** Starts the guided flow: saves state and sends the first item-picker page. */
async function startGuidedOrder(merchant) {
  const itemCount = await InventoryItem.countDocuments({ merchantId: merchant._id });
  if (!itemCount) {
    return sendTextMessage(
      merchant.whatsappNumber,
      'Your stock list is empty — add items from the dashboard first, or just tell me the sale directly (e.g. "2 items, cash, 1500").'
    );
  }

  await ConversationState.findOneAndUpdate(
    { whatsappNumber: merchant.whatsappNumber },
    { merchantId: merchant._id, flow: 'guided_order', step: 'awaiting_item', data: { page: 0 } },
    { upsert: true }
  );

  return sendItemPickerPage(merchant, 0);
}

/**
 * Sends one page of the item picker. paginateRows pages at 9 rows so every
 * page but the last has room for a "Show more" row inside WhatsApp's 10-row
 * list cap; the current page rides along in ConversationState.data.
 */
async function sendItemPickerPage(merchant, page) {
  const items = await InventoryItem.find({ merchantId: merchant._id }).limit(50);
  const rows = items.map((i) => ({ id: `item_${i._id}`, title: i.name.slice(0, 24) }));
  const pages = paginateRows(rows);
  const safePage = Math.max(0, Math.min(page, pages.length - 1));
  const hasMore = safePage < pages.length - 1;

  return sendInteractiveList(merchant.whatsappNumber, 'What did you sell?', 'Pick item', [
    {
      title: 'Your stock',
      rows: hasMore ? [...pages[safePage], { id: 'show_more', title: 'Show more' }] : pages[safePage],
    },
  ]);
}

// Escape-hatch words for the guided flow. Prefixes catch typos like "cancelll"
// — "sto" alone is skipped so words like "stock" never trigger a cancel.
const CANCEL_WORDS = ['cancel', 'stop', 'quit', 'exit', 'khatam', 'band karo'];
function isCancelText(raw) {
  const s = raw?.trim().toLowerCase();
  if (!s) return false;
  return CANCEL_WORDS.includes(s) || s.startsWith('canc') || s.startsWith('stop');
}

/** Advances an in-flight guided order one step, driven by ConversationState.step. */
async function continueGuidedOrder(merchant, message, state) {
  const listId = message.interactive?.list_reply?.id;
  const buttonId = message.interactive?.button_reply?.id;

  // Escape hatch — typing "cancel"/"stop" (or near-misses) abandons the
  // in-flight order instead of trapping the merchant in the flow.
  if (isCancelText(message.text?.body)) {
    await ConversationState.deleteOne({ _id: state._id });
    return sendTextMessage(
      merchant.whatsappNumber,
      'No problem — order cancelled. Send "order" whenever you want to log another sale.'
    );
  }

  switch (state.step) {
    case 'awaiting_item': {
      if (listId === 'show_more') {
        const nextPage = (state.data?.page ?? 0) + 1;
        state.data = { ...state.data, page: nextPage };
        await state.save();
        return sendItemPickerPage(merchant, nextPage);
      }
      if (!listId?.startsWith('item_')) {
        // Merchants type the item name more often than they tap the list —
        // match free text against stock ("daal maash" or "2 daal maash").
        const raw = message.text?.body?.trim();
        if (!raw) {
          return sendTextMessage(merchant.whatsappNumber, 'Please pick an item from the list — or just type its name.');
        }
        const qtyMatch = raw.match(/^(\d+)\s+(.+)$/);
        const saidName = qtyMatch ? qtyMatch[2] : raw;
        const ranked = await findSimilarInventoryItems(merchant._id, saidName, { limit: 2, minScore: 0.6 });
        const best = ranked[0];
        const clearMatch = ranked.length === 1 || (ranked.length === 2 && ranked[0].score - ranked[1].score >= 0.15);

        if (best && clearMatch) {
          const typedQty = qtyMatch ? parseInt(qtyMatch[1], 10) : null;
          state.data = {
            ...state.data,
            itemId: best.item._id.toString(),
            itemName: best.item.name,
            price: best.item.price,
          };
          if (typedQty && typedQty > 0) {
            state.data.quantity = typedQty;
            state.step = 'awaiting_payment_method';
            await state.save();
            return sendInteractiveButtons(merchant.whatsappNumber, 'How was it paid?', [
              { id: 'pay_cash', title: 'Cash' },
              { id: 'pay_easypaisa', title: 'EasyPaisa' },
              { id: 'pay_jazzcash', title: 'JazzCash' },
            ]);
          }
          state.step = 'awaiting_quantity';
          await state.save();
          return sendTextMessage(merchant.whatsappNumber, `How many ${best.item.name} did you sell?`);
        }

        if (ranked.length > 1) {
          const names = ranked.map((r) => `"${r.item.name}"`).join(' or ');
          await sendTextMessage(merchant.whatsappNumber, `Did you mean ${names}? Type the full name — or pick from the list below.`);
          return sendItemPickerPage(merchant, state.data?.page ?? 0);
        }

        return sendTextMessage(
          merchant.whatsappNumber,
          `I couldn't match "${saidName}" — tap an item from the list, or type its exact name. Send "cancel" to exit.`
        );
      }
      const item = await InventoryItem.findById(listId.replace('item_', ''));
      if (!item) return sendTextMessage(merchant.whatsappNumber, "Couldn't find that item — try again.");

      state.data = {
        ...state.data,
        itemId: item._id.toString(),
        itemName: item.name,
        price: item.price, // stashed so finalize can compute the total without a re-fetch
      };
      state.step = 'awaiting_quantity';
      await state.save();
      return sendTextMessage(merchant.whatsappNumber, `How many ${item.name} did you sell?`);
    }

    case 'awaiting_quantity': {
      const quantity = parseInt(message.text?.body, 10);
      if (!quantity || quantity <= 0) {
        return sendTextMessage(merchant.whatsappNumber, 'Please send a valid number.');
      }
      state.data = { ...state.data, quantity };
      state.step = 'awaiting_payment_method';
      return sendPaymentMethodPicker(merchant);
    }

    case 'awaiting_payment_method': {
      const allowedMethods = merchant.acceptedPaymentMethods?.length
        ? merchant.acceptedPaymentMethods
        : DEFAULT_ACCEPTED_PAYMENT_METHODS;

      let paymentMethod = null;
      if (buttonId && buttonId.startsWith('pay_')) {
        const candidate = buttonId.replace('pay_', '');
        if (allowedMethods.includes(candidate)) {
          paymentMethod = candidate;
        }
      }

      if (!paymentMethod) {
        const typed = message.text?.body?.trim();
        const candidate = normalizePaymentMethod(typed);
        if (candidate && allowedMethods.includes(candidate)) {
          paymentMethod = candidate;
        }
      }

      if (!paymentMethod) {
        const optionsList = allowedMethods
          .map((m) => getPaymentMethodDetails(m)?.name || m)
          .join(', ');
        return sendTextMessage(
          merchant.whatsappNumber,
          `Please choose an accepted payment method: ${optionsList}`
        );
      }

      state.data = { ...state.data, paymentMethod };
      await state.save();
      return finalizeGuidedOrder(merchant, state);
    }

    default: {
      await ConversationState.deleteOne({ _id: state._id });
      return sendTextMessage(merchant.whatsappNumber, 'Something went wrong — let\'s start over. Type "order" to try again.');
    }
  }
}

/** Sends interactive buttons or options for merchant's accepted payment methods. */
async function sendPaymentMethodPicker(merchant) {
  const allowed = merchant.acceptedPaymentMethods?.length
    ? merchant.acceptedPaymentMethods
    : DEFAULT_ACCEPTED_PAYMENT_METHODS;

  const buttons = allowed.slice(0, 3).map((id) => {
    const details = getPaymentMethodDetails(id);
    const title = (merchant.language === 'ur' ? details?.nameUrdu : details?.name) || id;
    return {
      id: `pay_${id}`,
      title: title.slice(0, 20),
    };
  });

  if (allowed.length <= 3) {
    const prompt = merchant.language === 'ur' ? 'ادائیگی کس طریقے سے ہوئی؟' : 'How was it paid?';
    return sendInteractiveButtons(merchant.whatsappNumber, prompt, buttons);
  }

  // More than 3: send top 3 as quick buttons, and note other accepted methods in prompt text
  const otherNames = allowed.slice(3).map((id) => {
    const details = getPaymentMethodDetails(id);
    return (merchant.language === 'ur' ? details?.nameUrdu : details?.name) || id;
  });

  const prompt = merchant.language === 'ur'
    ? `ادائیگی کا طریقہ منتخب کریں (یا لکھیں: ${otherNames.join('، ')})`
    : `How was it paid? (Or type: ${otherNames.join(', ')})`;

  return sendInteractiveButtons(merchant.whatsappNumber, prompt, buttons);
}

/** Logs the completed guided order via crm/ and clears the flow state. */
async function finalizeGuidedOrder(merchant, state) {
  const { itemId, itemName, quantity, paymentMethod, price } = state.data;

  await createOrderViaCrm(merchant, {
    type: 'log_sale',
    merchantId: merchant._id,
    item: { name: itemName, quantity, inventoryItemId: itemId },
    paymentMethod,
    // Guided flow never asks for a price — derive it from the stock list's
    // unit price; null if the merchant never set one.
    amount: price != null ? price * quantity : null,
    source: 'guided',
  });

  await ConversationState.deleteOne({ _id: state._id });
}

// ---------------------------------------------------------------------------
// crm / workflows / approvals integration — call these as direct module
// imports, never via the HTTP routes (per the backend contract).
// ---------------------------------------------------------------------------
/**
 * Runs one log_sale command through crm/order.service.js and replies to the
 * merchant. Business failures arrive as Error messages prefixed
 * ITEM_NOT_FOUND: / INSUFFICIENT_STOCK: and get a helpful reply; anything
 * unexpected gets a generic apology.
 */
async function createOrderViaCrm(merchant, command) {
  const source = command.source || 'text';
  const language = command.language || merchant.language || 'ur';

  try {
    const order = await createOrder(command);
    const orderNo = order?._id ? order._id.toString().slice(-6) : '';
    const phrases = spokenPhrases.orderLogged(language, {
      quantity: command.item.quantity,
      itemName: command.item.name,
      paymentMethod: command.paymentMethod,
      orderNo,
    });
    return replyToMerchant(merchant, phrases, source);
  } catch (err) {
    const message = err?.message ?? '';

    if (message.startsWith('ITEM_NOT_FOUND:')) {
      return offerItemDisambiguation(merchant, command);
    }

    if (message.startsWith('INSUFFICIENT_STOCK:')) {
      const detail = message.slice('INSUFFICIENT_STOCK:'.length).trim();
      const phrases = spokenPhrases.insufficientStock(language, { detail, itemName: command.item?.name });
      return replyToMerchant(merchant, phrases, source);
    }

    console.error('createOrder failed:', message);
    const phrases = spokenPhrases.genericError(language);
    return replyToMerchant(merchant, phrases, source);
  }
}

/**
 * The merchant's item name didn't match their stock list. Instead of a dead
 * end, offer the closest candidates as buttons — "Did you mean Daal Maash?"
 * Candidates come from string similarity first, then the LLM (handles
 * chawal/rice/چاول and Urdu-script names). The pending command is stashed in
 * ConversationState so the button tap can finish the sale.
 */
async function offerItemDisambiguation(merchant, command) {
  const source = command.source || 'text';
  const language = command.language || merchant.language || 'ur';
  const saidName = command.item?.name ?? '';

  let ranked = await findSimilarInventoryItems(merchant._id, saidName, { limit: 2, minScore: 0.5 });

  if (!ranked.length) {
    const inventory = await InventoryItem.find({ merchantId: merchant._id }).limit(100);
    const resolved = await resolveItemName(saidName, inventory.map((i) => i.name));
    if (resolved) {
      ranked = inventory
        .filter((i) => i.name.toLowerCase() === resolved.toLowerCase())
        .map((item) => ({ item, score: 1 }));
    }
  }

  if (!ranked.length) {
    const phrases = spokenPhrases.itemNotFound(language, { saidName });
    return replyToMerchant(merchant, phrases, source);
  }

  // WhatsApp caps reply buttons at 3: two candidates + an escape.
  const buttons = ranked
    .slice(0, 2)
    .map(({ item }) => ({ id: `pick_${item._id}`, title: item.name.slice(0, 20) }));
  buttons.push({ id: 'pick_none', title: 'None of these' });

  await ConversationState.findOneAndUpdate(
    { whatsappNumber: merchant.whatsappNumber },
    { merchantId: merchant._id, flow: 'item_disambiguation', step: 'awaiting_choice', data: { command } },
    { upsert: true }
  );

  const candidateNames = ranked.slice(0, 2).map((r) => r.item.name);
  const phrases = spokenPhrases.itemDisambiguation(language, { saidName, candidates: candidateNames });

  // If source was voice, send the spoken question first
  if (shouldReplyWithVoice(merchant, source)) {
    await sendVoiceReply(merchant.whatsappNumber, {
      spokenText: phrases.spoken,
      language,
      alsoSendText: false,
    });
  }

  return sendInteractiveButtons(
    merchant.whatsappNumber,
    phrases.text,
    buttons
  );
}

/** Finishes (or declines) a sale after the merchant taps a "did you mean?" button. */
async function handleDisambiguationReply(merchant, buttonId) {
  const state = await ConversationState.findOne({
    whatsappNumber: merchant.whatsappNumber,
    flow: 'item_disambiguation',
  });
  if (!state) {
    return sendTextMessage(merchant.whatsappNumber, "Sorry, that choice expired — please send the sale again.");
  }
  await ConversationState.deleteOne({ _id: state._id });

  if (buttonId === 'pick_none') {
    return sendTextMessage(
      merchant.whatsappNumber,
      'No problem — sale not logged. Send "order" to pick from your stock list, or add the item from the dashboard.'
    );
  }

  const item = await InventoryItem.findById(buttonId.replace('pick_', ''));
  if (!item) {
    return sendTextMessage(merchant.whatsappNumber, "Couldn't find that item anymore — please send the sale again.");
  }

  const command = state.data?.command ?? {};
  return createOrderViaCrm(merchant, {
    ...command,
    item: { ...(command.item ?? {}), name: item.name, inventoryItemId: item._id.toString() },
  });
}

/** Creates an automation through workflows/createWorkflow and confirms back to the merchant. */
async function createWorkflowViaModule(merchant, command) {
  const source = command.source || 'text';
  const language = command.language || merchant.language || 'ur';

  try {
    const workflow = await createWorkflow(command);
    const phrases = spokenPhrases.workflowCreated(language, { rawInstruction: workflow.rawInstruction });
    return replyToMerchant(merchant, phrases, source);
  } catch (err) {
    console.error('createWorkflow failed:', err.message);
    const phrases = spokenPhrases.genericError(language);
    return replyToMerchant(merchant, phrases, source);
  }
}

/**
 * Handles approve_<orderId> / reject_<orderId> button replies.
 * Looks up the pending Approval by orderId (Ali's button ID convention), calls
 * respond(), and confirms back to the merchant. respond() owns the order status
 * update — nothing else needed here.
 */
async function handleApprovalReply(merchant, buttonId) {
  const isApprove = buttonId.startsWith('approve_');
  const orderId = buttonId.replace(/^(approve|reject)_/, '');
  const decision = isApprove ? 'approved' : 'rejected';

  try {
    const approval = await findPendingByOrderId(orderId);

    if (!approval) {
      return sendTextMessage(merchant.whatsappNumber, "That order has already been handled.");
    }

    await respondToApproval(approval._id, decision);

    const phrases = spokenPhrases.approvalReply(merchant.language, isApprove);
    return sendTextMessage(merchant.whatsappNumber, phrases.text);
  } catch (err) {
    if (err.message?.startsWith('APPROVAL_NOT_FOUND')) {
      return sendTextMessage(merchant.whatsappNumber, "That order has already been handled.");
    }
    console.error('handleApprovalReply error:', err.message);
    return sendTextMessage(merchant.whatsappNumber, "Couldn't process that — please try from the dashboard.");
  }
}

/** Handles taps on 'Clear Alert' buttons from expiry notifications */
async function handleClearExpiryReply(merchant, buttonId) {
  try {
    // Format: clearexpiry_{itemId}_{dateToClear}
    const parts = buttonId.split('_');
    if (parts.length < 3) return;
    const itemId = parts[1];
    const dateToClear = parts.slice(2).join('_'); // Just in case there are underscores in date

    const item = await InventoryItem.findOne({ _id: itemId, merchantId: merchant._id });
    if (!item) {
      return sendTextMessage(merchant.whatsappNumber, "Couldn't find that item — it might have been deleted.");
    }

    if (!item.expiryDates.includes(dateToClear)) {
      return sendTextMessage(merchant.whatsappNumber, "That expiry alert was already cleared.");
    }

    item.expiryDates = item.expiryDates.filter(d => d !== dateToClear);
    await item.save();

    emitDashboardUpdate(merchant._id);

    return sendTextMessage(merchant.whatsappNumber, `✅ Alert cleared for *${item.name}* (${dateToClear}).`);
  } catch (err) {
    console.error('handleClearExpiryReply error:', err.message);
    return sendTextMessage(merchant.whatsappNumber, "Couldn't clear the alert — please try from the dashboard.");
  }
}
