
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { TranscriptionSegment, Language } from "../types";

// Helper to wrap raw PCM data into a playable WAV format
function pcmToWavUrl(base64Pcm: string, sampleRate: number = 24000): string {
  const binaryString = atob(base64Pcm);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  
  view.setUint32(0, 0x52494646, false);
  view.setUint32(4, 36 + len, true);
  view.setUint32(8, 0x57415645, false);
  view.setUint32(12, 0x666d7420, false);
  view.setUint16(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x64617461, false);
  view.setUint32(40, len, true);

  const wavBytes = new Uint8Array(header.byteLength + len);
  wavBytes.set(new Uint8Array(header), 0);
  wavBytes.set(bytes, header.byteLength);

  const blob = new Blob([wavBytes], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateAIPractice = async (topic: string, language: Language) => {
  const ai = getAI();
  const textModel = 'gemini-3-pro-preview';
  const ttsModel = 'gemini-2.5-flash-preview-tts';

  // 要求模型直接返回时间戳，避免前端累加误差
  const textPrompt = `
    请围绕主题 "${topic}" 生成一段适合语言学习者的短文（约 5-8 句话）。
    目标语种: ${language === 'EN' ? '英语' : language === 'FR' ? '法语' : '韩语'}
    请严格返回以下 JSON 格式。注意：start 和 end 必须反映该句子在整段朗读中的精确起止秒数（考虑到正常语速和句子间的自然停顿）：
    {
      "full_text": "全文内容",
      "segments": [
        { "text": "单句原文", "translation": "中文翻译", "start": 0.0, "end": 3.2 }
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
                translation: { type: Type.STRING },
                start: { type: Type.NUMBER },
                end: { type: Type.NUMBER }
              },
              required: ["text", "translation", "start", "end"]
            }
          }
        },
        required: ["full_text", "segments"]
      }
    }
  });

  const data = JSON.parse(textResp.text || '{}');

  const voiceName = language === 'EN' ? 'Kore' : language === 'FR' ? 'Puck' : 'Kore';
  const ttsResp = await ai.models.generateContent({
    model: ttsModel,
    contents: { parts: [{ text: data.full_text || "" }] },
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName } }
      }
    }
  });

  const base64Audio = ttsResp.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("AI failed to generate audio data.");

  const audioUrl = pcmToWavUrl(base64Audio, 24000);
  const segments: TranscriptionSegment[] = data.segments || [];

  return { audioUrl, segments };
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

export const transcribeMedia = async (file: File, language: Language): Promise<TranscriptionSegment[]> => {
  const ai = getAI();
  const model = 'gemini-3-pro-preview';
  const reader = new FileReader();
  const base64Promise = new Promise<string>((resolve) => {
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.readAsDataURL(file);
  });
  const base64Data = await base64Promise;

  const prompt = `请精确转录并带上时间戳: [{ "start": 数字, "end": 数字, "text": "原文", "translation": "翻译" }]`;
  try {
    const response = await ai.models.generateContent({
      model,
      contents: { parts: [{ inlineData: { data: base64Data, mimeType: file.type } }, { text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              start: { type: Type.NUMBER },
              end: { type: Type.NUMBER },
              text: { type: Type.STRING },
              translation: { type: Type.STRING }
            },
            required: ["start", "end", "text", "translation"]
          }
        }
      }
    });
    return JSON.parse(response.text || '[]');
  } catch (error) { throw error; }
};

export const explainText = async (text: string, language: Language): Promise<string> => {
  const ai = getAI();
  const model = 'gemini-3-pro-preview';
  const prompt = `解析文章片段: "${text}", 语种: ${language}。提供中文含义、语法分析、词汇。`;
  const response = await ai.models.generateContent({ model, contents: prompt });
  return response.text || "解析失败。";
};
