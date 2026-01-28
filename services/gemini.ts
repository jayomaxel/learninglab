
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { TranscriptionSegment, Language, DifficultyAnalysis } from "../types";

// Helper to decode base64 to Uint8Array
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Helper to wrap raw PCM data into a playable WAV format
function pcmToWavUrl(pcmData: Uint8Array, sampleRate: number = 24000): string {
  const len = pcmData.length;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + len, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint16(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // Byte rate
  view.setUint16(32, 2, true); // Block align
  view.setUint16(34, 16, true); // Bits per sample
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, len, true);

  const wavBytes = new Uint8Array(header.byteLength + len);
  wavBytes.set(new Uint8Array(header), 0);
  wavBytes.set(pcmData, header.byteLength);

  const blob = new Blob([wavBytes], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateAIPractice = async (topic: string, language: Language) => {
  const ai = getAI();
  const textModel = 'gemini-3-pro-preview';
  const ttsModel = 'gemini-2.5-flash-preview-tts';

  const textPrompt = `
    请围绕主题 "${topic}" 生成一段适合语言学习者的短文（约 5-8 句话）。
    目标语种: ${language === 'EN' ? '英语' : language === 'FR' ? '法语' : '韩语'}
    请返回 JSON 格式，包含全文和分段信息。
    {
      "full_text": "全文内容",
      "segments": [
        { "text": "单句原文", "translation": "中文翻译" }
      ]
    }
  `;

  const textResp = await ai.models.generateContent({
    model: textModel,
    contents: textPrompt,
    config: { 
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          full_text: { type: Type.STRING },
          segments: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                translation: { type: Type.STRING }
              },
              required: ["text", "translation"]
            }
          }
        },
        required: ["full_text", "segments"]
      }
    }
  });

  const data = JSON.parse(textResp.text || '{}');
  const rawSegments = data.segments || [];

  if (rawSegments.length === 0) {
    throw new Error("No segments generated");
  }

  const voiceName = language === 'EN' ? 'Kore' : language === 'FR' ? 'Puck' : 'Kore';
  const SAMPLE_RATE = 24000;
  
  const audioPromises = rawSegments.map(async (seg: any) => {
    const ttsResp = await ai.models.generateContent({
      model: ttsModel,
      contents: { parts: [{ text: seg.text }] },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName } }
        }
      }
    });
    const base64 = ttsResp.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64) throw new Error("TTS generation failed for segment");
    return base64ToUint8Array(base64);
  });

  const pcmChunks = await Promise.all(audioPromises);

  const totalLength = pcmChunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const combinedPcm = new Uint8Array(totalLength);
  
  const finalSegments: TranscriptionSegment[] = [];
  let offset = 0;
  let currentTime = 0;

  pcmChunks.forEach((chunk, index) => {
    combinedPcm.set(chunk, offset);
    
    const duration = chunk.length / (SAMPLE_RATE * 2);
    const seg = rawSegments[index];
    
    finalSegments.push({
      text: seg.text,
      translation: seg.translation,
      start: currentTime,
      end: currentTime + duration
    });

    offset += chunk.length;
    currentTime += duration;
  });

  const audioUrl = pcmToWavUrl(combinedPcm, SAMPLE_RATE);

  return { audioUrl, segments: finalSegments };
};

export const generatePracticeFromUrl = async (url: string, language: Language) => {
  const ai = getAI();
  const searchModel = 'gemini-3-pro-preview';
  const fetchPrompt = `提取 URL 内容: "${url}"。语种: ${language}。仅返回原文。`;
  const fetchResp = await ai.models.generateContent({
    model: searchModel,
    contents: fetchPrompt,
    config: { tools: [{ googleSearch: {} }] }
  });
  return await generateAIPractice(fetchResp.text || "", language);
};

export const fetchReadingMaterial = async (input: string, language: Language) => {
  const ai = getAI();
  const model = 'gemini-3-pro-preview';
  const prompt = `为主题 "${input}" 生成 ${language} 极速阅读文章。仅返回原文。`;
  const response = await ai.models.generateContent({ model, contents: prompt, config: { tools: [{ googleSearch: {} }] } });
  return response.text || "";
};

export const translateText = async (text: string): Promise<string> => {
  const ai = getAI();
  const model = 'gemini-3-pro-preview';
  const prompt = `请将以下文本翻译成流畅、优美的中文，适合阅读理解：\n\n${text}`;
  const response = await ai.models.generateContent({ model, contents: prompt });
  return response.text || "翻译失败。";
};

// --- Smart Fallback: Ask AI for Definition (Updated for Hanja) ---
export const defineWord = async (word: string, context: string, language: Language): Promise<{ translation: string, gender?: string, nuance?: string, cognate?: string, hanja?: string }> => {
  const ai = getAI();
  const model = 'gemini-3-flash-preview';
  
  const prompt = `
    Analyze the word "${word}" in context: "${context}". 
    Target Language: ${language}.
    
    Tasks:
    1. Provide a concise Chinese translation.
    2. If French: Identify gender (M/F) if noun.
    3. If Korean: Identify honorific level (Polite/Formal/Informal).
    4. If Korean: Provide the Hanja (Chinese characters) for the root if applicable (e.g., '학생' -> '學生').
    5. If target is NOT English: Identify an English cognate or loanword if it exists and is obvious. Return null if none.
    
    Return JSON.
  `;

  try {
      const response = await ai.models.generateContent({ 
        model, 
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    translation: { type: Type.STRING },
                    gender: { type: Type.STRING, nullable: true },
                    nuance: { type: Type.STRING, nullable: true },
                    cognate: { type: Type.STRING, nullable: true },
                    hanja: { type: Type.STRING, nullable: true }
                },
                required: ["translation"]
            }
        }
      });
      
      const data = JSON.parse(response.text || '{}');
      return {
          translation: data.translation || "AI 定义失败",
          gender: data.gender,
          nuance: data.nuance,
          cognate: data.cognate,
          hanja: data.hanja
      };
  } catch (e) {
      console.error("Definition failed", e);
      return { translation: "AI 定义失败" };
  }
};

// --- i+1 Difficulty Analysis (Enhanced with Known Word Comparison) ---
export const analyzeTextDifficulty = async (text: string, language: Language, knownWords?: Set<string>): Promise<DifficultyAnalysis> => {
  const ai = getAI();
  const model = 'gemini-3-flash-preview'; 
  
  // Clean text and calculate rough coverage if knownWords provided
  let coverageRatio = 0;
  if (knownWords && knownWords.size > 0) {
      const words = text.toLowerCase().match(/[\p{L}]+/gu) || [];
      if (words.length > 0) {
          const knownCount = words.filter(w => knownWords.has(w)).length;
          coverageRatio = knownCount / words.length;
      }
  }

  const prompt = `
    Analyze the following ${language} text for language learners.
    1. Identify words that are upper-intermediate (B2) or advanced (C1/C2) level.
    2. Calculate difficult word density.
    3. Return JSON.
    
    Text: "${text.substring(0, 3000)}" 

    JSON Schema:
    {
      "density": number,
      "level": string,
      "difficultWords": [{ "word": "string", "translation": "string", "definition": "string" }]
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            density: { type: Type.NUMBER },
            level: { type: Type.STRING },
            difficultWords: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: { word: { type: Type.STRING }, translation: { type: Type.STRING }, definition: { type: Type.STRING } }
              }
            }
          },
          required: ["density", "level", "difficultWords"]
        }
      }
    });
    
    const data = JSON.parse(response.text || '{}');
    
    let suggestion: 'EASY' | 'OPTIMAL' | 'HARD' = 'OPTIMAL';
    if (data.density > 0.15) suggestion = 'HARD';
    else if (data.density < 0.05) suggestion = 'EASY';

    // Calculate Star Rating (1-5)
    // 5 stars = 95%+ coverage or very low density
    let starRating = 3;
    if (coverageRatio > 0) {
        if (coverageRatio > 0.95) starRating = 5;
        else if (coverageRatio > 0.90) starRating = 4;
        else if (coverageRatio > 0.80) starRating = 3;
        else if (coverageRatio > 0.70) starRating = 2;
        else starRating = 1;
    } else {
        // Fallback to density if no local dictionary
        if (data.density < 0.05) starRating = 5;
        else if (data.density < 0.10) starRating = 4;
        else if (data.density < 0.15) starRating = 3;
        else if (data.density < 0.25) starRating = 2;
        else starRating = 1;
    }

    return {
      density: data.density || 0,
      level: data.level || 'Unknown',
      difficultWords: data.difficultWords || [],
      suggestion,
      starRating
    };

  } catch (e) {
    return { density: 0, level: 'N/A', difficultWords: [], suggestion: 'OPTIMAL', starRating: 3 };
  }
};
