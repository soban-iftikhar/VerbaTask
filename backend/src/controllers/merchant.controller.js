/**
 * Merchant Settings & Profiling Controller
 *
 * Provides APIs for merchants to view and customize their store identity
 * (rename store, change business type/location), configure voice and language
 * preferences, and manage accepted Pakistani payment methods (banks, wallets, EMIs).
 */

import Merchant from '../models/Merchant.js';
import PhoneChangeVerification from '../models/PhoneChangeVerification.js';
import { sendTextMessage } from '../services/whatsapp.service.js';
import crypto from 'crypto';
import {
  getAllPaymentMethods,
  isValidPaymentMethod,
  normalizePaymentMethod,
  DEFAULT_ACCEPTED_PAYMENT_METHODS,
} from '../constants/paymentMethods.js';
import { emitDashboardUpdate } from '../socket.js';

/**
 * GET /api/merchant/profile
 * Retrieves the full store profile and settings for the authenticated merchant.
 */
export async function getProfile(req, res) {
  try {
    const merchant = await Merchant.findById(req.merchantId).select('-passwordHash');
    if (!merchant) {
      return res.status(404).json({ success: false, error: { message: 'Merchant not found' } });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: merchant._id,
        businessName: merchant.businessName || '',
        businessType: merchant.businessType || 'general',
        location: merchant.location || '',
        sells: merchant.sells || '',
        whatsappNumber: merchant.whatsappNumber,
        email: merchant.email,
        language: merchant.language || 'ur',
        voiceReplies: merchant.voiceReplies ?? true,
        replyPreference: merchant.replyPreference || 'voice_on_voice',
        acceptedPaymentMethods: merchant.acceptedPaymentMethods?.length
          ? merchant.acceptedPaymentMethods
          : DEFAULT_ACCEPTED_PAYMENT_METHODS,
        paymentDetails: merchant.paymentDetails || {},
        onboardingComplete: merchant.onboardingComplete,
        createdAt: merchant.createdAt,
        updatedAt: merchant.updatedAt,
      },
    });
  } catch (error) {
    console.error('getProfile error:', error);
    return res.status(500).json({ success: false, error: { message: 'Server error fetching store profile' } });
  }
}

/**
 * PATCH /api/merchant/profile
 * Updates store settings (rename store, change location/category, language, voice, or payment methods).
 */
export async function updateProfile(req, res) {
  try {
    const allowedFields = [
      'businessName',
      'businessType',
      'location',
      'sells',
      'language',
      'voiceReplies',
      'replyPreference',
      'acceptedPaymentMethods',
      'paymentDetails',
    ];

    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    // Validate acceptedPaymentMethods if provided
    if (updates.acceptedPaymentMethods) {
      if (!Array.isArray(updates.acceptedPaymentMethods) || !updates.acceptedPaymentMethods.length) {
        return res.status(400).json({
          success: false,
          error: { message: 'acceptedPaymentMethods must be a non-empty array of payment method IDs' },
        });
      }

      const normalized = [];
      for (const m of updates.acceptedPaymentMethods) {
        const canonical = normalizePaymentMethod(m) || m.toLowerCase().trim();
        if (!isValidPaymentMethod(canonical)) {
          return res.status(400).json({
            success: false,
            error: { message: `Invalid payment method: '${m}' is not recognized in Pakistan catalog` },
          });
        }
        if (!normalized.includes(canonical)) {
          normalized.push(canonical);
        }
      }
      updates.acceptedPaymentMethods = normalized;
    }

    // Validate language if provided
    if (updates.language && !['ur', 'en'].includes(updates.language)) {
      return res.status(400).json({
        success: false,
        error: { message: "language must be 'ur' or 'en'" },
      });
    }

    // Validate replyPreference if provided
    if (updates.replyPreference && !['voice_on_voice', 'always_voice', 'text_only'].includes(updates.replyPreference)) {
      return res.status(400).json({
        success: false,
        error: { message: "replyPreference must be 'voice_on_voice', 'always_voice', or 'text_only'" },
      });
    }

    const merchant = await Merchant.findByIdAndUpdate(
      req.merchantId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-passwordHash');

    if (!merchant) {
      return res.status(404).json({ success: false, error: { message: 'Merchant not found' } });
    }

    emitDashboardUpdate(req.merchantId, { type: 'profile' });

    return res.status(200).json({
      success: true,
      data: merchant,
      message: 'Store settings updated successfully',
    });
  } catch (error) {
    console.error('updateProfile error:', error);
    return res.status(500).json({ success: false, error: { message: 'Server error updating store profile' } });
  }
}

/**
 * GET /api/merchant/payment-methods
 * Returns the full catalog of Pakistani banks, wallets, and EMIs,
 * tagged with an 'active' flag indicating if the merchant accepts it.
 */
export async function getPaymentMethods(req, res) {
  try {
    const merchant = await Merchant.findById(req.merchantId).select('acceptedPaymentMethods paymentDetails');
    if (!merchant) {
      return res.status(404).json({ success: false, error: { message: 'Merchant not found' } });
    }

    const activeList = merchant.acceptedPaymentMethods?.length
      ? merchant.acceptedPaymentMethods
      : DEFAULT_ACCEPTED_PAYMENT_METHODS;

    const allMethods = getAllPaymentMethods().map((method) => ({
      ...method,
      active: activeList.includes(method.id),
      details: merchant.paymentDetails?.get?.(method.id) || merchant.paymentDetails?.[method.id] || null,
    }));

    return res.status(200).json({
      success: true,
      data: {
        totalSupported: allMethods.length,
        totalActive: activeList.length,
        activeMethods: activeList,
        methods: allMethods,
      },
    });
  } catch (error) {
    console.error('getPaymentMethods error:', error);
    return res.status(500).json({ success: false, error: { message: 'Server error fetching payment methods' } });
  }
}

/**
 * PUT /api/merchant/payment-methods
 * Sets the active accepted payment methods for the merchant.
 * Body: { acceptedPaymentMethods: string[], paymentDetails?: object }
 */
export async function updatePaymentMethods(req, res) {
  try {
    const { acceptedPaymentMethods, paymentDetails } = req.body;

    if (!Array.isArray(acceptedPaymentMethods) || !acceptedPaymentMethods.length) {
      return res.status(400).json({
        success: false,
        error: { message: 'acceptedPaymentMethods must be a non-empty array of payment IDs' },
      });
    }

    const validList = [];
    for (const item of acceptedPaymentMethods) {
      const canonical = normalizePaymentMethod(item) || String(item).toLowerCase().trim();
      if (!isValidPaymentMethod(canonical)) {
        return res.status(400).json({
          success: false,
          error: { message: `Unknown payment method '${item}'. Please choose from supported Pakistani channels.` },
        });
      }
      if (!validList.includes(canonical)) {
        validList.push(canonical);
      }
    }

    const updates = { acceptedPaymentMethods: validList };
    if (paymentDetails && typeof paymentDetails === 'object') {
      updates.paymentDetails = paymentDetails;
    }

    const merchant = await Merchant.findByIdAndUpdate(
      req.merchantId,
      { $set: updates },
      { new: true }
    ).select('acceptedPaymentMethods paymentDetails businessName');

    emitDashboardUpdate(req.merchantId, { type: 'payment_methods' });

    return res.status(200).json({
      success: true,
      data: {
        acceptedPaymentMethods: merchant.acceptedPaymentMethods,
        paymentDetails: merchant.paymentDetails,
      },
      message: 'Payment methods updated successfully',
    });
  } catch (error) {
    console.error('updatePaymentMethods error:', error);
    return res.status(500).json({ success: false, error: { message: 'Server error updating payment methods' } });
  }
}

const ONE_HOUR_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX = 3;

function normalizePhone(str) {
  if (!str) return '';
  const digits = String(str).replace(/\D/g, '');
  if (digits.startsWith('92') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 11) return '92' + digits.slice(1);
  if (digits.length === 10 && digits.startsWith('3')) return '92' + digits;
  return digits;
}

function maskPhone(phone) {
  if (!phone || phone.length < 7) return phone;
  return phone.slice(0, 5) + '****' + phone.slice(-3);
}

/**
 * POST /api/merchant/phone/request-change
 * Initiates phone number change by dispatching a 6-digit OTP to the NEW WhatsApp number.
 * The new number is NOT activated until OTP is verified.
 */
export async function requestPhoneChange(req, res) {
  try {
    const rawNumber = String(req.body.newPhoneNumber || '').trim();
    if (!rawNumber) {
      return res.status(400).json({
        success: false,
        error: { message: 'New WhatsApp phone number is required.' },
      });
    }

    const normalized = normalizePhone(rawNumber);
    if (!normalized || normalized.length < 10) {
      return res.status(400).json({
        success: false,
        error: { message: 'Please provide a valid Pakistani phone number (e.g. 03001234567 or +923001234567).' },
      });
    }

    const merchant = await Merchant.findById(req.merchantId);
    if (!merchant) {
      return res.status(404).json({ success: false, error: { message: 'Merchant not found.' } });
    }

    // Must not be the same as the current number
    if (merchant.whatsappNumber === normalized) {
      return res.status(400).json({
        success: false,
        error: { message: 'This is already your current active WhatsApp number.' },
      });
    }

    // Must not conflict with another existing merchant account
    const existing = await Merchant.findOne({
      whatsappNumber: normalized,
      _id: { $ne: merchant._id },
    });
    if (existing) {
      return res.status(400).json({
        success: false,
        error: { message: 'This WhatsApp number is already registered to another merchant account.' },
      });
    }

    // Rate limiting: Max 3 OTP requests per hour
    let verification = await PhoneChangeVerification.findOne({
      merchantId: merchant._id,
      newWhatsappNumber: normalized,
    });

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - ONE_HOUR_MS);

    const recentRequests = verification?.requestHistory
      ? verification.requestHistory.filter((t) => new Date(t) > oneHourAgo)
      : [];

    if (recentRequests.length >= RATE_LIMIT_MAX) {
      const oldestRecent = Math.min(...recentRequests.map((t) => new Date(t).getTime()));
      const waitMinutes = Math.ceil((oldestRecent + ONE_HOUR_MS - now.getTime()) / (60 * 1000));
      return res.status(429).json({
        success: false,
        error: {
          message: `Rate limit exceeded. You can request up to ${RATE_LIMIT_MAX} verification codes per hour. Please try again in ${waitMinutes} minute(s).`,
          retryAfterMinutes: waitMinutes,
        },
      });
    }

    // Generate 6-digit OTP code with 10-minute expiry
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
    const updatedHistory = [...recentRequests, now];

    if (!verification) {
      verification = await PhoneChangeVerification.create({
        merchantId: merchant._id,
        newWhatsappNumber: normalized,
        code,
        expiresAt,
        usedAt: null,
        requestHistory: updatedHistory,
      });
    } else {
      verification.code = code;
      verification.expiresAt = expiresAt;
      verification.usedAt = null;
      verification.requestHistory = updatedHistory;
      await verification.save();
    }

    // Send OTP to the NEW WhatsApp number
    try {
      const msg = `🔐 *VerbaTask Phone Verification*\n\nYour OTP to update and activate your store WhatsApp number is: *${code}*\n\nThis code will expire in 10 minutes.\nDo not share this code with anyone.`;
      await sendTextMessage(normalized, msg);
    } catch (err) {
      console.warn('Failed to send WhatsApp phone verification message:', err.message);
    }

    const remainingAttempts = RATE_LIMIT_MAX - updatedHistory.length;

    return res.status(200).json({
      success: true,
      data: {
        message: `Verification code sent to ${maskPhone(normalized)}`,
        newWhatsappNumber: normalized,
        maskedNumber: maskPhone(normalized),
        remainingAttempts,
        expiresInMinutes: 10,
      },
    });
  } catch (error) {
    console.error('requestPhoneChange error:', error);
    return res.status(500).json({ success: false, error: { message: 'Server error requesting phone change.' } });
  }
}

/**
 * POST /api/merchant/phone/verify-change
 * Verifies the OTP and activates the new WhatsApp phone number on the merchant account.
 */
export async function verifyPhoneChange(req, res) {
  try {
    const { newPhoneNumber, code } = req.body;

    if (!newPhoneNumber || !code) {
      return res.status(400).json({
        success: false,
        error: { message: 'New phone number and 6-digit verification code are required.' },
      });
    }

    const normalized = normalizePhone(newPhoneNumber);
    const merchant = await Merchant.findById(req.merchantId);
    if (!merchant) {
      return res.status(404).json({ success: false, error: { message: 'Merchant not found.' } });
    }

    const verification = await PhoneChangeVerification.findOne({
      merchantId: merchant._id,
      newWhatsappNumber: normalized,
    });

    if (!verification || verification.code !== String(code).trim()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid verification code. Please check and try again.' },
      });
    }

    if (verification.usedAt) {
      return res.status(400).json({
        success: false,
        error: { message: 'This verification code has already been used. Please request a new one.' },
      });
    }

    if (new Date() > verification.expiresAt) {
      return res.status(400).json({
        success: false,
        error: { message: 'Verification code has expired. Please request a new code.' },
      });
    }

    // Check collision again before activating
    const conflict = await Merchant.findOne({
      whatsappNumber: normalized,
      _id: { $ne: merchant._id },
    });
    if (conflict) {
      return res.status(400).json({
        success: false,
        error: { message: 'This phone number was recently registered by another account.' },
      });
    }

    // ACTIVATE NEW NUMBER
    const oldNumber = merchant.whatsappNumber;
    merchant.whatsappNumber = normalized;
    await merchant.save();

    verification.usedAt = new Date();
    await verification.save();

    return res.status(200).json({
      success: true,
      data: {
        message: 'WhatsApp phone number successfully updated and activated!',
        oldWhatsappNumber: oldNumber,
        whatsappNumber: normalized,
      },
    });
  } catch (error) {
    console.error('verifyPhoneChange error:', error);
    return res.status(500).json({ success: false, error: { message: 'Server error verifying phone change.' } });
  }
}

/**
 * POST /api/merchant/phone/resend-code
 * Resends a fresh OTP to the pending new WhatsApp number.
 */
export async function resendPhoneChangeCode(req, res) {
  return requestPhoneChange(req, res);
}
