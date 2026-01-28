
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { TranscriptionSegment, Language } from "../types";

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

  // 1. 生成文本内容和分段结构
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

  // 2. 为每个片段单独生成语音 (Parallel Requests for speed)
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

  // 3. 拼接音频并精确计算时间戳
  // 计算总长度
  const totalLength = pcmChunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const combinedPcm = new Uint8Array(totalLength);
  
  const finalSegments: TranscriptionSegment[] = [];
  let offset = 0;
  let currentTime = 0;

  pcmChunks.forEach((chunk, index) => {
    combinedPcm.set(chunk, offset);
    
    const duration = chunk.length / (SAMPLE_RATE * 2); // 16-bit = 2 bytes per sample
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
