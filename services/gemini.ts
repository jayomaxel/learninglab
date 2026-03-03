import { GoogleGenAI, Type, Modality } from "@google/genai";
import { TranscriptionSegment, Language, DifficultyAnalysis, CEFRLevel } from "../types";

export const getAIKey = () => localStorage.getItem('GEMINI_API_KEY') || (import.meta as any).env?.VITE_GEMINI_KEY || '';
export const getProxyUrl = () => localStorage.getItem('GEMINI_PROXY_URL') || '';

const getAI = () => {
  const key = getAIKey();
  if (!key && !getProxyUrl()) throw new Error("Missing Gemini API Key. Please set it in Settings.");
  return key ? new GoogleGenAI({ apiKey: key }) : null;
};

const getResponseText = (response: any): string => {
  if (typeof response?.text === 'string') return response.text;
  if (typeof response?.text === 'function') {
    try {
      return response.text();
    } catch {
      return '';
    }
  }
  return '';
};

const safeGenerateContent = async (args: { model: string, contents: any, config?: any }) => {
  const proxyUrl = getProxyUrl();
  if (proxyUrl) {
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args)
    });
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    return { text: data.text, candidates: data.candidates };
  }

  const ai = getAI();
  if (!ai) throw new Error("AI not initialized");
  const response = await ai.models.generateContent({
    model: args.model,
    contents: args.contents,
    ...(args.config ? { config: args.config } : {}),
  });
  return { text: getResponseText(response), candidates: response.candidates };
};

const pcmToWav = (pcmData: Uint8Array, sampleRate: number = 24000): Blob => {
  const buffer = new ArrayBuffer(44 + pcmData.length);
  const view = new DataView(buffer);
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 32 + pcmData.length, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, pcmData.length, true);
  const pcmView = new Uint8Array(buffer, 44);
  pcmView.set(pcmData);
  return new Blob([buffer], { type: 'audio/wav' });
};

const decodeBase64 = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
};

export const getAIPronunciation = async (text: string): Promise<string> => {
  try {
    const response = await safeGenerateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Pronounce this Korean syllable or character perfectly as a native speaker: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
      },
    });
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("Audio generation failed");
    const wavBlob = pcmToWav(decodeBase64(base64Audio));
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(wavBlob);
    });
  } catch (e) {
    console.error("AI TTS error", e);
    throw e;
  }
};

export const defineWord = async (word: string, context: string, language: Language, level: CEFRLevel = 'A1'): Promise<any> => {
  const prompt = `Analyze "${word}" in context: "${context}". Target Language: ${language}. Return JSON.`;
  try {
    const response = await safeGenerateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            translation: { type: Type.STRING },
            gender: { type: Type.STRING, enum: ['M', 'F'], nullable: true },
            speechLevel: { type: Type.STRING, nullable: true },
            nuance: { type: Type.STRING, nullable: true },
            hanja: { type: Type.STRING, nullable: true }
          },
          required: ["translation"]
        }
      }
    });
    return JSON.parse(response.text || '{}');
  } catch (e) { return { translation: "Error" }; }
};

export const analyzeTextDifficulty = async (text: string, language: Language): Promise<DifficultyAnalysis> => {
  try {
    const response = await safeGenerateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analyze difficulty for ${language} learner. Text: "${text.substring(0, 1000)}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            density: { type: Type.NUMBER },
            level: { type: Type.STRING },
            suggestion: { type: Type.STRING, enum: ['EASY', 'OPTIMAL', 'HARD'] },
            difficultWords: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { word: { type: Type.STRING }, translation: { type: Type.STRING }, definition: { type: Type.STRING } }, required: ['word', 'translation', 'definition'] } }
          },
          required: ['density', 'level', 'suggestion', 'difficultWords']
        }
      }
    });
    return JSON.parse(response.text || '{}');
  } catch (e) { return { density: 0, level: 'Unknown', difficultWords: [], suggestion: 'OPTIMAL' }; }
};

export const translateText = async (text: string): Promise<string> => {
  try {
    const response = await safeGenerateContent({
      model: 'gemini-3-flash-preview',
      contents: `Translate to Chinese: "${text}"`,
    });
    return response.text || "Failed.";
  } catch (e) { return "Error."; }
};

export const fetchReadingMaterial = async (input: string, language: Language): Promise<{ text: string, sources: string[] }> => {
  try {
    const prompt = language === 'KR'
      ? `High-quality Korean reading passage about "${input}". Please provide the text with extra spaces between morphemes (roots and particles) to facilitate RSVP speed reading, but keep it readable.`
      : `High-quality ${language} reading passage about "${input}".`;

    const response = await safeGenerateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] as any }
    });
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => chunk.web?.uri).filter((uri: any): uri is string => !!uri) || [];
    return { text: response.text || "", sources };
  } catch (e) { return { text: "Error.", sources: [] }; }
};

import { saveAudioToCache, getAudioFromCache } from "./audioCache";

export const generateAIPractice = async (prompt: string, language: Language, level: CEFRLevel): Promise<{ audioUrl: string, segments: TranscriptionSegment[] }> => {
  const contentResponse = await safeGenerateContent({
    model: 'gemini-3-flash-preview',
    contents: `JSON array of sentences in ${language} for ${level} level. Topic: ${prompt}. For each sentence, identify words above ${level} level as hardWords with their 0-based start index.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING },
            translation: { type: Type.STRING },
            hardWords: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  word: { type: Type.STRING },
                  index: { type: Type.NUMBER },
                  translation: { type: Type.STRING }
                },
                required: ['word', 'index']
              }
            }
          },
          required: ['text', 'translation']
        }
      }
    }
  });

  const rawSegments = JSON.parse(contentResponse.text || '[]');
  const fullText = rawSegments.map((s: any) => s.text).join(' ');
  const cacheKey = `audio_${btoa(unescape(encodeURIComponent(fullText))).substring(0, 100)}`; // Simple hash-like key

  let wavBlob: Blob | null = await getAudioFromCache(cacheKey);

  if (!wavBlob) {
    const ttsResponse = await safeGenerateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: fullText }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
      },
    });

    const base64Audio = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("Audio generation failed");
    wavBlob = pcmToWav(decodeBase64(base64Audio));
    await saveAudioToCache(cacheKey, wavBlob);
  }

  const audioUrl = URL.createObjectURL(wavBlob);


  let currentStart = 0;
  const segments: TranscriptionSegment[] = rawSegments.map((s: any) => {
    const wordsCount = s.text.split(/\s+/).length;
    const duration = Math.max(1, wordsCount * 0.8);
    const segment = {
      start: currentStart,
      end: currentStart + duration,
      text: s.text,
      translation: s.translation,
      hardWords: s.hardWords
    };
    currentStart += duration;
    return segment;
  });

  return { audioUrl, segments };
};

export const generatePracticeFromUrl = async (url: string, language: Language, level: CEFRLevel): Promise<{ audioUrl: string, segments: TranscriptionSegment[] }> => {
  return generateAIPractice(`Source: ${url}`, language, level);
};
