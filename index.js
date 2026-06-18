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

// ==========================================
// SYSTEM INSTRUCTION (Dioptimalkan agar AI lebih cerdas)
// ==========================================
const SYSTEM_INSTRUCTION = `Anda adalah virtual assistant/helpdesk resmi KPU Kabupaten Sekadau.
TUGAS UTAMA: Membantu pengguna memberikan informasi akurat seputar SIPOL, proses pendaftaran, verifikasi, pemutakhiran data partai politik berkelanjutan, serta aturan hukum KPU (Keputusan KPU No. 1365/2023 & No. 658/2024).

PEDOMAN PERILAKU:
1. Jawablah dengan gaya bahasa yang sopan, formal, ringkas, dan solutif.
2. Jika ada sapaan atau basa-basi di dalam konteks pembahasan Parpol/SIPOL, terima sapaan tersebut dengan ramah, lalu jawab inti pertanyaannya.
3. Jika pertanyaannya benar-benar di luar topik kepemiluan, regulasi KPU, SIPOL, atau pemutakhiran parpol, Anda WAJIB menjawab dengan tepat satu kata kunci saja: "OUT_OF_TOPIC".`;

// ==========================================
// KAMUS SAPAAN / BASA-BASI AWAL
// ==========================================
const sapaanKamus = [
  "halo", "hai", "hi", "p", "ping", "assalamualaikum", "sampurasun",
  "mau nanya", "mau tanya", "mo nanya", "mok nanyak", "nanyak", "tanya", 
  "permisi", "selamat pagi", "selamat siang", "selamat sore", "selamat malam",
  "helpdesk", "asisten", "spol"
];

const checkSapaanOnly = (text) => {
  const cleanedText = text.toLowerCase().trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~() font-medium?]/g, "");
  // Jika teks kosong setelah dibersihkan atau termasuk dalam daftar kamus sapaan murni
  return sapaanKamus.some(sapaan => cleanedText === sapaan.replace(/\s+/g, ""));
};

// ==========================================
// FUNGSI GENERATE MULTI-TURN CHAT
// ==========================================
const generateWithChatHistory = async (currentPrompt, formattedHistory) => {
  const availableModels = ["gemini-1.5-flash", "gemini-2.5-flash"];
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    const selectedModel = availableModels[Math.floor(Math.random() * availableModels.length)];
    try {
      const model = genAI.getGenerativeModel({
        model: selectedModel,
        systemInstruction: SYSTEM_INSTRUCTION,
      });

      // Memulai sesi chat dengan menyuntikkan history sebelumnya
      const chatSession = model.startChat({
        history: formattedHistory,
      });

      const result = await chatSession.sendMessage(currentPrompt);
      return result.response.text();
    } catch (error) {
      attempts++;
      console.error(`Gagal menggunakan model ${selectedModel} (Percobaan ${attempts}):`, error);
      if (error.status !== 429 && error.status !== 403) throw error;
      if (attempts === maxAttempts) throw new Error("Semua model AI sedang sibuk.");
    }
  }
};

// ==========================================
// ENDPOINT CHAT
// ==========================================
app.post("/api/chat", async (req, res) => {
  const { prompt, history } = req.body;

  if (!prompt) return res.status(400).json({ error: "Prompt diperlukan" });

  try {
    const cleanPrompt = prompt.trim();

    // 1. Cek Kamus Sapaan Murni (Hemat Kuota & Respons Instan)
    if (checkSapaanOnly(cleanPrompt)) {
      return res.json({
        source: "local_dictionary",
        reply: "Halo! Selamat datang di Helpdesk KPU Kabupaten Sekadau. Ada yang bisa kami bantu seputar penggunaan SIPOL atau Pemutakhiran Data Partai Politik?"
      });
    }

    const isFirstQuestion = !history || history.length <= 1;

    // 2. Cek database (Hanya untuk pertanyaan mandiri/pertama agar tidak salah context)
    if (isFirstQuestion) {
      const faq = await prisma.faq.findFirst({
        where: { question: { contains: cleanPrompt } },
      });

      if (faq) {
        await prisma.faq.update({
          where: { id: faq.id },
          data: { hitCount: { increment: 1 } },
        });
        return res.json({ source: "database", reply: faq.answer });
      }

      const cachedAi = await prisma.aiCache.findFirst({
        where: { prompt: cleanPrompt },
      });

      if (cachedAi) {
        return res.json({ source: "cache", reply: cachedAi.response });
      }
    }

    // 3. Format History dari Frontend untuk SDK Gemini ({ role: "user" | "model", parts })
    const formattedHistory = [];
    if (history && history.length > 1) {
      // Ambil semua pesan kecuali pesan paling akhir yang sedang diproses saat ini
      const previousMessages = history.slice(0, -1);
      
      previousMessages.forEach((msg) => {
        formattedHistory.push({
          role: msg.role === "user" ? "user" : "model", // SDK Gemini menggunakan "model"
          parts: [{ text: msg.text }],
        });
      });
    }

    // 4. Panggil AI dengan context history penuh
    const reply = await generateWithChatHistory(cleanPrompt, formattedHistory);

    // 5. Validasi respon AI dari filter OUT_OF_TOPIC
    if (reply.includes("OUT_OF_TOPIC") || reply.length < 4) {
      return res.status(409).json({
        error: "Pertanyaan tidak relevan atau tidak dimengerti. Mohon ajukan pertanyaan seputar aplikasi SIPOL atau regulasi pemutakhiran data Parpol KPU.",
      });
    }

    // 6. Simpan ke cache jika ini adalah pertanyaan pembuka yang valid
    if (isFirstQuestion) {
      await prisma.aiCache.create({
        data: { prompt: cleanPrompt, response: reply },
      });
    }

    return res.json({ source: "gemini", reply });
  } catch (error) {
    console.error("Error pada endpoint chat:", error);
    res.status(500).json({ error: "Terjadi kesalahan pada server." });
  }
});

httpServer.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});