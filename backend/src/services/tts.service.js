/**
 * Text-to-Speech (TTS) service — turns text into spoken audio buffers
 * for WhatsApp voice replies in Urdu and English.
 *
 * Supported engines:
 * 1. ElevenLabs (ELEVENLABS_API_KEY) — ultra-realistic studio-grade AI voices (Free tier: 10k chars/mo).
 * 2. Google Gemini (GEMINI_API_KEY) — native speech generation from Google AI Studio (Free tier).
 * 3. Microsoft Edge Neural TTS (msedge-tts) — zero-config fallback.
 * 4. Google Translate TTS (google-tts-api) — lightweight secondary fallback.
 */

import axios from 'axios';
import dotenv from 'dotenv';
import lamejs from '../../node_modules/@breezystack/lamejs/dist/lamejs.js';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import * as googleTTS from 'google-tts-api';

dotenv.config();

// Hardcoded Male Voices (no env dependency required)
const DEFAULT_URDU_VOICE = 'ur-PK-AsadNeural'; // Pakistani Urdu male voice
const DEFAULT_ENGLISH_VOICE = 'en-US-GuyNeural'; // Natural conversational US English male voice

// ElevenLabs default voice ID: George (warm conversational male)
const DEFAULT_ELEVENLABS_VOICE = 'JBFqnCBsd6RMkjVDRZzb';

/**
 * Strips markdown symbols, emojis, and artifacts that shouldn't be read out by TTS.
 */
export function cleanTextForSpeech(text) {
  if (!text || typeof text !== 'string') return '';

  return text
    // Remove markdown formatting: *bold*, _italics_, ~strike~, `code`
    .replace(/[*_~`#]/g, '')
    // Remove emojis and miscellaneous symbols
    .replace(
      /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu,
      ''
    )
    // Remove URLs
    .replace(/https?:\/\/\S+/g, '')
    // Collapse multiple whitespace/newlines
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Resolves the default voice name for Edge TTS.
 */
export function getDefaultVoice(language = 'ur') {
  return language === 'en' ? DEFAULT_ENGLISH_VOICE : DEFAULT_URDU_VOICE;
}

/**
 * Resolves which provider to prioritize based on available API keys and configuration.
 */
export function getActiveProvider(override = null) {
  if (override) return override;
  if (!process.env.GEMINI_API_KEY && !process.env.ELEVENLABS_API_KEY) {
    dotenv.config();
  }
  if (process.env.TTS_PROVIDER) return process.env.TTS_PROVIDER.toLowerCase();
  // Default to Edge TTS: ultra-fast (~200ms), zero rate limits, authentic Pakistani Urdu (ur-PK-AsadNeural)
  return 'edge';
}

/**
 * Converts 16-bit PCM buffer into standard MP3 buffer accepted by WhatsApp Cloud API.
 */
export function pcmToMp3(pcmBuffer, sampleRate = 24000, channels = 1) {
  const samples = new Int16Array(pcmBuffer.buffer, pcmBuffer.byteOffset, pcmBuffer.length / 2);
  const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, 128);
  const mp3Data = [];

  const sampleBlockSize = 1152;
  for (let i = 0; i < samples.length; i += sampleBlockSize) {
    const sampleChunk = samples.subarray(i, i + sampleBlockSize);
    const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
    if (mp3buf.length > 0) {
      mp3Data.push(Buffer.from(mp3buf));
    }
  }

  const mp3buf = mp3encoder.flush();
  if (mp3buf.length > 0) {
    mp3Data.push(Buffer.from(mp3buf));
  }

  return Buffer.concat(mp3Data);
}

/**
 * Converts raw PCM 16-bit 24kHz mono audio buffer into a standard RIFF WAV buffer.
 */
export function pcmToWav(pcmBuffer, sampleRate = 24000, numChannels = 1, bitDepth = 16) {
  const byteRate = sampleRate * numChannels * (bitDepth / 8);
  const blockAlign = numChannels * (bitDepth / 8);
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

/**
 * Synthesizes speech using ElevenLabs API (eleven_multilingual_v2).
 */
export async function synthesizeWithElevenLabs(text, language = 'ur', voiceId = null) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY not configured');
  }

  const selectedVoice = voiceId || DEFAULT_ELEVENLABS_VOICE;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoice}`;

  const response = await axios.post(
    url,
    {
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    },
    {
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      responseType: 'arraybuffer',
      timeout: 20_000,
    }
  );

  return {
    buffer: Buffer.from(response.data),
    mimeType: 'audio/mpeg',
    format: 'mp3',
    voice: selectedVoice,
    provider: 'elevenlabs',
  };
}

/**
 * Synthesizes speech using Google Gemini Audio Generation API.
 */
export async function synthesizeWithGemini(text, language = 'ur', voice = null) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const selectedVoice = voice || (language === 'ur' ? 'Puck' : 'Charon');
  const prompt =
    language === 'ur'
      ? `Read aloud the following text naturally in authentic Pakistani Urdu. Do not add any greeting or preamble, only read the text:\n\n${text}`
      : `Read aloud the following text clearly and naturally:\n\n${text}`;

  // Try gemini-2.5-flash-preview-tts
  const modelsToTry = ['gemini-2.5-flash-preview-tts'];
  let lastError = null;

  for (const model of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await axios.post(
        url,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: selectedVoice,
                },
              },
            },
          },
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 25_000,
        }
      );

      const part = response.data?.candidates?.[0]?.content?.parts?.[0];
      const inlineData = part?.inlineData;

      if (!inlineData?.data) {
        throw new Error(`Gemini ${model} did not return audio data`);
      }

      const rawBuffer = Buffer.from(inlineData.data, 'base64');
      // If the data is WAV, strip the 44-byte header before MP3 encoding; if raw PCM, encode directly
      const pcmData = inlineData.mimeType?.includes('wav') ? rawBuffer.slice(44) : rawBuffer;
      const mp3Buffer = pcmToMp3(pcmData, 24000, 1);

      return {
        buffer: mp3Buffer,
        mimeType: 'audio/mpeg',
        format: 'mp3',
        voice: selectedVoice,
        provider: 'gemini',
      };
    } catch (err) {
      lastError = err;
      const details = err.response?.data?.error?.message || err.message;
      console.warn(`[tts] Gemini model ${model} failed: ${details}`);
    }
  }

  throw lastError || new Error('Gemini TTS generation failed');
}

/**
 * Synthesizes speech using Microsoft Edge Neural TTS.
 */
export async function synthesizeWithEdge(text, language = 'ur', voice = null) {
  const selectedVoice = voice || getDefaultVoice(language);
  const tts = new MsEdgeTTS();

  return new Promise(async (resolve, reject) => {
    let timer = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      try {
        tts.close();
      } catch {
        // ignore
      }
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new Error('Edge TTS request timed out'));
    }, 15_000);

    try {
      await tts.setMetadata(selectedVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(text);

      const chunks = [];
      audioStream.on('data', (chunk) => chunks.push(chunk));
      audioStream.on('end', () => {
        cleanup();
        const buffer = Buffer.concat(chunks);
        if (!buffer.length) {
          return reject(new Error('Edge TTS returned empty audio buffer'));
        }
        resolve({
          buffer,
          mimeType: 'audio/mpeg',
          format: 'mp3',
          voice: selectedVoice,
          provider: 'edge',
        });
      });

      audioStream.on('error', (err) => {
        cleanup();
        reject(err);
      });
    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}

/**
 * Synthesizes speech using Google Translate TTS as a lightweight fallback.
 */
export async function synthesizeWithGoogle(text, language = 'ur') {
  const langCode = language === 'en' ? 'en' : 'ur';
  const safeText = text.slice(0, 200);

  const base64 = await googleTTS.getAudioBase64(safeText, {
    lang: langCode,
    slow: false,
    host: 'https://translate.google.com',
    timeout: 10_000,
  });

  const buffer = Buffer.from(base64, 'base64');
  return {
    buffer,
    mimeType: 'audio/mpeg',
    format: 'mp3',
    voice: `google-${langCode}`,
    provider: 'google',
  };
}

/**
 * Main TTS entry point.
 * Synthesizes speech with automatic fallback through the provider hierarchy.
 *
 * @param {string} rawText - Text to speak
 * @param {Object} [options]
 * @param {string} [options.language='ur'] - 'ur' or 'en'
 * @param {string} [options.voice] - optional voice identifier
 * @param {string} [options.provider] - 'elevenlabs' | 'gemini' | 'edge' | 'google'
 * @returns {Promise<{ buffer: Buffer, mimeType: string, format: string, provider: string }>}
 */
export async function synthesizeSpeech(rawText, options = {}) {
  const text = cleanTextForSpeech(rawText);
  if (!text) {
    throw new Error('TTS: text is empty after cleaning');
  }

  const language = options.language === 'en' ? 'en' : 'ur';
  const voice = options.voice || null;
  const explicitProvider = options.provider?.toLowerCase();
  if (explicitProvider === 'google') return synthesizeWithGoogle(text, language);
  if (explicitProvider === 'edge') return synthesizeWithEdge(text, language, voice);
  if (explicitProvider === 'gemini') return synthesizeWithGemini(text, language, voice);
  if (explicitProvider === 'elevenlabs') return synthesizeWithElevenLabs(text, language, voice);

  const provider = getActiveProvider();

  // 1. Edge TTS FIRST by default (fastest ~200ms, zero rate limits, authentic Pakistani Urdu)
  if (provider === 'edge' || !provider || provider === 'auto') {
    try {
      return await synthesizeWithEdge(text, language, voice);
    } catch (edgeErr) {
      console.warn(`[tts] Edge TTS failed (${edgeErr.message}), trying next provider...`);
    }
  }

  // 2. ElevenLabs if provider is elevenlabs or as fallback
  if (provider === 'elevenlabs' || (process.env.ELEVENLABS_API_KEY && language === 'en')) {
    try {
      return await synthesizeWithElevenLabs(text, language, voice);
    } catch (err) {
      console.warn(`[tts] ElevenLabs failed (${err.message}), trying next provider...`);
    }
  }

  // 3. Gemini TTS only if explicitly chosen
  if (provider === 'gemini') {
    try {
      return await synthesizeWithGemini(text, language, voice);
    } catch (err) {
      console.warn(`[tts] Gemini TTS failed (${err.message}), trying next provider...`);
    }
  }

  // 4. Google Translate TTS fallback
  try {
    return await synthesizeWithGoogle(text, language);
  } catch (googleErr) {
    console.error(`[tts] All TTS providers failed`);
    throw new Error(`TTS synthesis failed on all available engines: ${googleErr.message}`);
  }
}
