import express from "express";
import { createServer } from "http";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { PrismaClient } from "@prisma/client";

const app = express();
const PORT = 8080;
const httpServer = createServer(app);
const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.API_KEY);

app.use(express.json());
app.use(cors({ origin: true, credentials: true }));

// Definisi batasan topik
const SYSTEM_INSTRUCTION = `Anda adalah asisten virtual KPU Kabupaten Sekadau. 
TUGAS UTAMA: Hanya menjawab pertanyaan seputar SIPOL, verifikasi/pemutakhiran data partai politik, dan aturan hukum KPU (Keputusan KPU No. 1365/2023 & No. 658/2024).
ATURAN: 
1. Jika pertanyaan di luar topik tersebut, jawab dengan kata kunci "OUT_OF_TOPIC".
2. Jangan memberikan jawaban jika Anda tidak memahami maksud pertanyaan.
3. Jawaban harus singkat, akurat, dan formal.`;

const generateWithRandomModel = async (prompt) => {
  const availableModels = ["gemini-3.1-flash-lite-preview", "gemini-2.5-flash"];

  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    const selectedModel =
      availableModels[Math.floor(Math.random() * availableModels.length)];
    try {
      const model = genAI.getGenerativeModel({
        model: selectedModel,
        systemInstruction: SYSTEM_INSTRUCTION,
      });

      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      attempts++;
      if (error.status !== 429 && error.status !== 403) throw error;
      if (attempts === maxAttempts)
        throw new Error("Semua model sedang sibuk.");
    }
  }
};

// Endpoint Chat
app.post("/api/chat", async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) return res.status(400).json({ error: "Prompt diperlukan" });

  try {
    // 1. Cek di Tabel Faq (Gratis)
    const faq = await prisma.faq.findFirst({
      where: { question: { contains: prompt } },
    });

    if (faq) {
      await prisma.faq.update({
        where: { id: faq.id },
        data: { hitCount: { increment: 1 } },
      });
      return res.json({ source: "database", reply: faq.answer });
    }

    // 2. Cek di AiCache
    const cachedAi = await prisma.aiCache.findFirst({
      where: { prompt: prompt },
    });

    if (cachedAi) {
      return res.json({ source: "cache", reply: cachedAi.response });
    }

    // 3. Panggil AI
    const reply = await generateWithRandomModel(prompt);

    // 4. Validasi respon AI (Cek apakah di luar topik)
    if (reply.includes("OUT_OF_TOPIC") || reply.length < 5) {
      return res.status(409).json({
        error:
          "Pertanyaan tidak relevan atau tidak dimengerti. Mohon ajukan pertanyaan seputar SIPOL atau regulasi KPU.",
      });
    }

    // 5. Simpan hasil yang valid ke AiCache
    await prisma.aiCache.create({
      data: { prompt, response: reply },
    });

    return res.json({ source: "gemini", reply });
  } catch (error) {
    console.error("Error pada endpoint chat:", error);
    res.status(500).json({ error: "Terjadi kesalahan pada server." });
  }
});

httpServer.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});
