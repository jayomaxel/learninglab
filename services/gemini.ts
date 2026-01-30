
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { TranscriptionSegment, Language, DifficultyAnalysis, CEFRLevel } from "../types";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

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
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
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
  const ai = getAI();
  const prompt = `Analyze "${word}" in context: "${context}". Target Language: ${language}. Return JSON.`;
  try {
      const response = await ai.models.generateContent({ 
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
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
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
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Translate to Chinese: "${text}"`,
    });
    return response.text || "Failed.";
  } catch (e) { return "Error."; }
};

export const fetchReadingMaterial = async (input: string, language: Language): Promise<{ text: string, sources: string[] }> => {
  const ai = getAI();
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `High-quality ${language} reading passage about "${input}".`,
      config: { tools: [{ googleSearch: {} }] }
    });
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map(chunk => chunk.web?.uri).filter((uri): uri is string => !!uri) || [];
    return { text: response.text || "", sources };
  } catch (e) { return { text: "Error.", sources: [] }; }
};

export const generateAIPractice = async (prompt: string, language: Language, level: CEFRLevel): Promise<{ audioUrl: string, segments: TranscriptionSegment[] }> => {
  const ai = getAI();
  const contentResponse = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `JSON array of sentences in ${language} for ${level} level. Topic: ${prompt}.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.OBJECT, properties: { text: { type: Type.STRING }, translation: { type: Type.STRING } }, required: ['text', 'translation'] }
      }
    }
  });

  const rawSegments = JSON.parse(contentResponse.text || '[]');
  const fullText = rawSegments.map((s: any) => s.text).join(' ');

  const ttsResponse = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: fullText }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
    },
  });

  const base64Audio = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("Audio generation failed");
  const wavBlob = pcmToWav(decodeBase64(base64Audio));
  const audioUrl = URL.createObjectURL(wavBlob);

  let currentStart = 0;
  const segments: TranscriptionSegment[] = rawSegments.map((s: any) => {
    const wordsCount = s.text.split(/\s+/).length;
    const duration = Math.max(1, wordsCount * 0.8);
    const segment = { start: currentStart, end: currentStart + duration, text: s.text, translation: s.translation };
    currentStart += duration;
    return segment;
  });

  return { audioUrl, segments };
};

export const generatePracticeFromUrl = async (url: string, language: Language, level: CEFRLevel): Promise<{ audioUrl: string, segments: TranscriptionSegment[] }> => {
  return generateAIPractice(`Source: ${url}`, language, level);
};
