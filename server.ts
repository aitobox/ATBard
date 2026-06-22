import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Helper to convert base64 little-endian 16-bit PCM bytes (24000Hz mono) into WAV
function pcmToWav(pcmBase64: string, sampleRate: number = 24000): string {
  try {
    const pcmBuffer = Buffer.from(pcmBase64, 'base64');
    const wavBuffer = Buffer.alloc(44 + pcmBuffer.length);

    /* RIFF identifier */
    wavBuffer.write('RIFF', 0);
    /* file length: 36 + data size */
    wavBuffer.writeUInt32LE(36 + pcmBuffer.length, 4);
    /* RIFF type */
    wavBuffer.write('WAVE', 8);
    /* format chunk identifier */
    wavBuffer.write('fmt ', 12);
    /* format chunk length */
    wavBuffer.writeUInt32LE(16, 16);
    /* sample format: 1 for uncompressed integer PCM */
    wavBuffer.writeUInt16LE(1, 20);
    /* channel count: 1 (mono) */
    wavBuffer.writeUInt16LE(1, 22);
    /* sample rate (e.g. 24000) */
    wavBuffer.writeUInt32LE(sampleRate, 24);
    /* byte rate: sampleRate * BlockAlign (sampleRate * bitsPerSample/8) -> 24000 * 2 = 48000 */
    wavBuffer.writeUInt32LE(sampleRate * 2, 28);
    /* block align: ChannelCount * BitsPerSample/8 -> 1 * 2 = 2 bytes */
    wavBuffer.writeUInt16LE(2, 32);
    /* bits per sample: 16-bit */
    wavBuffer.writeUInt16LE(16, 34);
    /* data chunk identifier */
    wavBuffer.write('data', 36);
    /* data chunk length */
    wavBuffer.writeUInt32LE(pcmBuffer.length, 40);

    // Copy raw PCM bytes intact
    pcmBuffer.copy(wavBuffer, 44);

    return wavBuffer.toString('base64');
  } catch (error) {
    console.error("Error in PCM to WAV conversion:", error);
    throw error;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "5mb" }));

  // Initialize Google Gen AI client lazily to prevent crashing if api key is missing on start
  let aiClient: GoogleGenAI | null = null;
  function getAiClient(): GoogleGenAI {
    if (!aiClient) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY environment variable is not configured. Please add it via Settings > Secrets.");
      }
      aiClient = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    }
    return aiClient;
  }

  // Health and verification endpoint
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      hasKey: !!process.env.GEMINI_API_KEY 
    });
  });

  // TTS Recitation Generation API
  app.post("/api/recite", async (req, res) => {
    try {
      const { text, voice, style, speed } = req.body;

      if (!text || typeof text !== 'string' || text.trim() === '') {
        return res.status(400).json({ error: "请输入需要朗诵的文本内容。" });
      }

      const rawText = text.trim();
      const chosenVoice = voice || "Kore"; // Puck, Charon, Kore, Fenrir, Zephyr
      const chosenStyle = style || "default"; // elegant, solemn, emotional, energetic, dramatic
      const chosenSpeed = speed || "medium"; // slow, medium, fast

      // Direct Gemini TTS model with refined prompting based on Chinese context
      let styleInstruction = "";
      if (chosenStyle === "elegant") {
        styleInstruction = "朗诵风格应该充满儒雅和书卷气，语气温婉、和缓，带有古典文人的清雅，注重文字之间的灵动空隙和呼吸感。";
      } else if (chosenStyle === "solemn") {
        styleInstruction = "朗诵风格应当厚重、庄严、宏大而深邃，每个字音都要平稳中气十足，语速沉缓，营造出史诗般的沧桑感和崇高感。";
      } else if (chosenStyle === "emotional") {
        styleInstruction = "朗诵风格必须饱含深情、百转千回，情绪饱满而细腻，重点词句可以带有微微的颤音、叹息与情感波动，令人感同身受。";
      } else if (chosenStyle === "energetic") {
        styleInstruction = "朗诵风格高昂激越、充满力量和朝气，语调清亮，节奏明快富有节奏感，展现出无限活力和进取精神。";
      } else if (chosenStyle === "dramatic") {
        styleInstruction = "朗诵风格极富戏剧张力、跌宕起伏，时而低沉耳语，时而高亢爆发，善于利用节奏的急缓与语气的强烈对比。";
      } else {
        styleInstruction = "朗诵风格自然、流畅，语速适中，带有优雅的艺术美感和清晰的吐字。";
      }

      // Speed control directive
      let speedInstruction = "";
      if (chosenSpeed === "slow") {
        speedInstruction = "请以非常缓慢、优雅且沉稳的节奏进行朗诵，每句话结束留出充足的艺术空白，突出文字意境。";
      } else if (chosenSpeed === "fast") {
        speedInstruction = "请以轻快、流畅且连续的节奏进行朗诵，减少字词之间的停顿，保持饱满清晰。";
      } else {
        speedInstruction = "请以适宜朗诵的标准艺术节奏展示，主次分明，停顿有致。";
      }

      // Formulate the dynamic instructions to prepended in the prompt
      const textPrompt = `你是一位顶级的艺术朗诵家和配音大师。请用以下艺术风格和语速要求，深情并茂地朗诵后面的文本。
【朗诵风格要求】:${styleInstruction}
【语速掌控要求】:${speedInstruction}

注意：你只需要直接开始朗诵，不要输出任何其他的引言、解释、前言、结束语或任何干扰字符。只将以下给出的文字转化为纯粹的朗诵：

${rawText}`;

      console.log(`[Recite App] Generating recitation. Voice: ${chosenVoice}, Style: ${chosenStyle}, Length: ${rawText.length} chars`);

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: textPrompt }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: chosenVoice },
            },
          },
        },
      });

      // Diagnostics & Deep scanning of the candidates for inline audio data
      let base64PCM: string | undefined = undefined;
      let foundMimeType: string | undefined = undefined;
      let searchReport = "";

      if (response.candidates && response.candidates.length > 0) {
        for (let c = 0; c < response.candidates.length; c++) {
          const cand = response.candidates[c];
          searchReport += `Candidate ${c} (FinishReason: ${cand.finishReason}): `;
          if (cand.content?.parts && cand.content.parts.length > 0) {
            searchReport += `${cand.content.parts.length} parts found. `;
            for (let p = 0; p < cand.content.parts.length; p++) {
              const part = cand.content.parts[p];
              if (part.inlineData?.data) {
                base64PCM = part.inlineData.data;
                foundMimeType = part.inlineData.mimeType;
                searchReport += `[Found audio in Part ${p} with MIME: ${foundMimeType}] `;
                break;
              } else {
                searchReport += `[Part ${p} is text/other] `;
              }
            }
          } else {
            searchReport += "No parts. ";
          }
          if (base64PCM) break;
        }
      } else {
        searchReport = "No candidates returned by Gemini.";
      }

      console.log(`[Diagnostic Report] ${searchReport}`);
      if (response.promptFeedback) {
        console.log(`[Prompt Feedback]`, JSON.stringify(response.promptFeedback));
      }

      if (!base64PCM) {
        const errorDetail = {
          report: searchReport,
          finishReason: response.candidates?.[0]?.finishReason,
          safetyCategory: response.candidates?.[0]?.safetyRatings?.map((s: any) => `${s.category}:${s.probability}`).join(", ") || "none",
          promptFeedback: response.promptFeedback ? JSON.stringify(response.promptFeedback) : "none"
        };
        console.error("Gemini TTS response lacked audio. Detail:", errorDetail);
        return res.status(500).json({ 
          error: `Gemini TTS 产生错误：无音频部分。原因报告:\n${searchReport}\n首要原因: ${errorDetail.finishReason || "未知"}` 
        });
      }

      // Convert the raw PCM to a standard playable WAV file
      const base64Wav = pcmToWav(base64PCM, 24000);
      const dataSizeInBytes = Buffer.from(base64PCM, 'base64').length;
      // 24000 Hz * 16-bit (2 bytes) = 48000 bytes per second
      const calculatedDurationSec = Number((dataSizeInBytes / 48000).toFixed(2));

      return res.json({
        audioData: base64Wav,
        duration: calculatedDurationSec,
        voice: chosenVoice,
        textLength: rawText.length,
        promptUsed: textPrompt
      });

    } catch (error: any) {
      console.error("[Recite App] Server error:", error);
      return res.status(500).json({ 
        error: error.message || "朗诵生成失败，请检查设置或稍后重试。" 
      });
    }
  });

  // Serve static application asset bundle
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Recite App] server listening on port ${PORT}`);
  });
}

startServer();
