import FormData from 'form-data';
import axios from 'axios';
import { parseIntent } from '../services/qwen.service.js';

// Groq runs OpenAI-compatible Whisper endpoints for free (2,000 req/day on
// the free tier, no credit card) — get a key at console.groq.com. This is
// NOT OpenAI's own Whisper API, which is paid (~$0.36/hour of audio).
const GROQ_TRANSCRIPTION_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

// WhatsApp technically allows voice notes up to several minutes long.
// Whisper handles that fine, but a merchant fumble-recording a 5-minute note
// costs you rate-limit budget and latency for no reason — cap it.
const MAX_AUDIO_BYTES = 8 * 1024 * 1024; // ~8MB, comfortably covers a normal 1-2 min voice note

/**
 * Voice note -> transcript -> the same command-contract JSON the typed-text
 * path produces. Called from whatsapp.controller.js once media.service.js
 * has already downloaded the audio buffer.
 *
 * Deliberately does NOT romanize the transcript. Whisper transcribes spoken
 * Urdu into native Urdu (Perso-Arabic) script — Qwen-2.5 reads that natively,
 * so the native-script transcript goes straight into the same parseIntent()
 * the text path uses.
 *
 * @param {Buffer} buffer
 * @param {string} mimeType
 * @param {string} [language='ur'] merchant language ('en' or 'ur')
 */
export async function transcribeAndParse(buffer, mimeType, language = 'ur') {
  if (!buffer || !buffer.length) {
    return { type: 'unknown', rawText: '', error: 'empty_audio' };
  }

  if (buffer.length > MAX_AUDIO_BYTES) {
    return { type: 'unknown', rawText: '', error: 'audio_too_long' };
  }

  const cleanMimeType = (mimeType?.split(';')[0]?.trim() || 'audio/ogg').toLowerCase();
  const transcript = await transcribeWithRetry(buffer, cleanMimeType, language);

  if (!transcript?.trim()) {
    console.warn('[voice] Empty transcription received');
    return { type: 'unknown', rawText: '' };
  }

  const detectedLanguage = /[\u0600-\u06FF]/.test(transcript) ? 'ur' : (language || 'ur');
  console.log(`[voice] transcript (${detectedLanguage}): "${transcript}"`);
  const intent = await parseIntent(transcript);
  return { ...intent, transcript, detectedLanguage };
}

async function transcribeWithRetry(buffer, cleanMimeType, language) {
  // Strategy 1: Ultra-fast whisper-large-v3-turbo (~200ms latency) with merchant language
  try {
    return await transcribe(buffer, cleanMimeType, language, 'whisper-large-v3-turbo');
  } catch (err1) {
    const status1 = err1.response?.status;
    console.warn(`[voice] whisper-large-v3-turbo (${language}) failed (${status1 || err1.message}). Retrying with auto-detect...`);

    // Strategy 2: Retry turbo with auto-detect language (handles mixed Urdu-English speech)
    try {
      return await transcribe(buffer, cleanMimeType, null, 'whisper-large-v3-turbo');
    } catch (err2) {
      const status2 = err2.response?.status;
      console.warn(`[voice] whisper-large-v3-turbo (auto) failed (${status2 || err2.message}). Falling back to whisper-large-v3...`);

      // Strategy 3: Fallback to classic whisper-large-v3
      return await transcribe(buffer, cleanMimeType, language, 'whisper-large-v3');
    }
  }
}

/**
 * Raw Whisper transcription — exported so the voice half can be tested
 * directly against a local audio file, without the Qwen parse step.
 */
export async function transcribe(buffer, mimeType, language, model = 'whisper-large-v3-turbo') {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY not set');
  }

  const cleanMime = (mimeType?.split(';')[0]?.trim() || 'audio/ogg').toLowerCase();
  const form = new FormData();
  form.append('file', buffer, { filename: filenameFor(cleanMime), contentType: cleanMime });
  form.append('model', model);
  if (language === 'en') {
    form.append('language', 'en');
  } else if (language === 'ur') {
    form.append('language', 'ur');
  }
  form.append(
    'prompt',
    'پاکستانی پرچون کریانہ اسٹور: چاول، آٹا، دال، چینی، گھی، تیل، دودھ، چائے، لیپٹن، صابن، کیش، ایزی پیسہ، جاز کیش، کلو، درجن، بوری، پیکٹ، بوتل، روپے، chawal, aata, daal, chini, ghee, oil, doodh, chai, lipton, tapal, surf, cash, easypaisa, jazzcash, sadapay, nayapay, raast, meezan, hbl, ubl, alfalah, 1, 2, 3, 5, 10, 20, 50, 100, 500, 1000'
  );

  const { data } = await axios.post(GROQ_TRANSCRIPTION_URL, form, {
    headers: {
      ...form.getHeaders(),
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    timeout: 15_000,
    maxBodyLength: Infinity,
  });

  return data.text;
}

function filenameFor(mimeType) {
  const m = (mimeType || '').toLowerCase();
  if (m.includes('ogg') || m.includes('opus')) return 'note.ogg';
  if (m.includes('mpeg') || m.includes('mp3')) return 'note.mp3';
  if (m.includes('mp4') || m.includes('m4a')) return 'note.m4a';
  if (m.includes('wav')) return 'note.wav';
  return 'note.ogg';
}
