// Import modul yang diperlukan
const { default: makeWASocket, useMultiFileAuthState, makeInMemoryStore, DisconnectReason } = require('@whiskeysockets/baileys');
const fs = require('fs');
const OpenAI = require("openai");
const dotenv = require("dotenv");


require('dotenv').config();

// Inisialisasi store untuk menyimpan session
dotenv.config();

// Inisialisasi OpenAI API
const openai = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY, // Gunakan API Key dari OpenRouter
    baseURL: "https://openrouter.ai/api/v1",  // API endpoint OpenRouter
});

async function generateCode(prompt) {
    try {
        console.log("Mengirim permintaan ke OpenRouter untuk:", prompt);
        const response = await openai.chat.completions.create({
            model: "mistralai/mistral-7b-instruct", // Ganti dengan ID model yang valid
            messages: [{ role: "user", content: `Buatkan kode untuk ${prompt}` }],
        });

        console.log("Respons dari OpenRouter:", response);
        return response.choices?.[0]?.message?.content || "⚠️ Tidak dapat menghasilkan kode.";
    } catch (error) {
        console.error("❌ Error OpenRouter:", error);
        return "⚠️ Terjadi kesalahan dalam mengambil respons dari OpenRouter.";
    }
}

const store = makeInMemoryStore({});


const allowedGroups = [
    "120363315962440251@g.us", // Ganti dengan ID grup yang diizinkan
    "1203633024913011450@g.us"
];

// **Daftar nomor yang diizinkan mengirim stiker**
const allowedStickerSenders = [
    "6283847288793", "6285806202559", "6285147191733", "6283815830898", "", "6285710176090", "6285657425563", "6281336490124", "6285657425563"
];

// Objek untuk menyimpan riwayat spam stiker
const stickerSpamTracker = {};
const SPAM_LIMIT = 10;
const SPAM_INTERVAL = 10000; // 10 detik

// Daftar kata kasar yang dilarang
const badWords = ["bego", "tolol", "anjing", "babi", "goblok", "kontol", "memek", "bgst", "ajg", "anj", "gendeng", "kntl", "mmk", "yatim", "piatu", "yatim piatu", "pukimak", "basori", "sugik", "uyung", "agus", "eko", "sucipto", "bacot"];
const violationTracker = {};
const VIOLATION_LIMIT = 10;


// Memuat atau membuat file skor
const scoresFile = 'scores.json';
let scores = fs.existsSync(scoresFile) ? JSON.parse(fs.readFileSync(scoresFile)) : {};

// Daftar teka-teki
const riddles = [
    { question: "Sapi sapi apa yg ada warnanya?", answer: "Sapidol" },
    { question: "Buah apa yang nggak bisa ketawa?", answer: "Semangka" },
    { question: "Aku punya ekor tapi bukan hewan, apakah aku?", answer: "Layangan" },
    { question: "Apa yang naik tapi tidak pernah turun?", answer: "Umur" },
    { question: "Apa yang jika dipotong malah tambah panjang?", answer: "Jalan" },
    { question: "Apa yang punya tangan tapi tidak bisa bertepuk tangan?", answer: "Jam" },
    { question: "Apa yang selalu di tengah malam?", answer: "Huruf L" }
];


const MathRidlles = [
    { question: "Jika 3x + 5 = 20, berapakah nilai x?", answer: "5" },
    { question: "Sebuah segitiga memiliki panjang alas 10 cm dan tinggi 12 cm. Berapakah luasnya?", answer: "60" },
    { question: "Jika 2a + 3b = 12 dan a - b = 2, berapakah nilai a dan b?", answer: "a=4, b=2" },
    { question: "Jika sebuah lingkaran memiliki jari-jari 7 cm, berapakah kelilingnya? (π = 3.14)", answer: "43.96" },
    { question: "Hitung hasil dari (4 + 6) × 2 - 5!", answer: "15" },
    { question: "Jika x^2 - 5x + 6 = 0, berapakah nilai x?", answer: "x=2 atau x=3" },
    { question: "Sebuah toko memberikan diskon 20% untuk barang seharga Rp150.000. Berapa harga setelah diskon?", answer: "120000" },
    { question: "Jika 5 pekerja dapat menyelesaikan pekerjaan dalam 12 hari, berapa lama waktu yang dibutuhkan oleh 10 pekerja?", answer: "6" },
    { question: "Jika sebuah persegi memiliki luas 144 cm², berapakah panjang sisinya?", answer: "12" },
    { question: "Hitung hasil dari 3/4 + 2/5!", answer: "23/20" }
];


let currentRiddles = null;
let currentMathRidlles = null;

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    let sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        browser: ['Sticker Remover Bot', 'Chrome', '1.0.0'],
        syncFullHistory: true,
        fireInitQueries: true,
        connectTimeoutMs: 60000
    });

    store.bind(sock.ev);
    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(`⚠️ Bot terputus, mencoba reconnect: ${shouldReconnect}`);
            if (shouldReconnect) {
                setTimeout(startBot, 5000);
            } else {
                console.log("❌ Bot logged out. Scan QR lagi untuk masuk.");
            }
        } else if (connection === 'open') {
            console.log("✅ Bot terhubung kembali!");
        }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
        try {
            const msg = messages?.[0];
            if (!msg?.message || !msg.key?.remoteJid) return;

            const jid = msg.key.remoteJid;
            const senderNumber = (msg.key.participant || jid).split('@')[0];
            const textMessage = msg.message.conversation || "";

            if (!scores[senderNumber]) {
                scores[senderNumber] = 0;
            }

            if (textMessage === '.menu') {
                try {
                    let profilePictureUrl;
                    try {
                        profilePictureUrl = await sock.profilePictureUrl(jid, 'image'); // Ambil PP pengguna atau grup
                    } catch {
                        profilePictureUrl = './download.jpg'; // Gambar default jika tidak ada PP
                    }

                    const menuText = "🤖 *Menu Bot Rexx*\n\n" +
                        "1. *.menu* - Menampilkan menu\n" +
                        "2. *.mtk* - Teka-teki matematika\n" +
                        "3. *.coding <apa yg mau kamu mau codenya>* - Generate code\n" +
                        "4. *.jawab <jawaban>* - Menjawab teka-teki\n" +
                        "5. *.tagall* - Mention semua member grup (khusus grup)\n" +
                        "6. *.spam <kata> <jumlah>* - Spam text\n" +
                        "7.*.search <query>* - Cari Apapun (jika error di maklumi karena menggunakan openai gratis)";

                    await sock.sendMessage(jid, {
                        image: { url: profilePictureUrl },
                        caption: menuText
                    });

                } catch (error) {
                    console.error("❌ Error mengambil foto profil:", error);
                    await sock.sendMessage(jid, { text: "⚠️ Gagal mengambil foto profil!" });
                }
                return;
            }

            const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

            // 🔍 Fitur Pencarian Wikipedia
            if (textMessage.startsWith(".search ")) {
                let query = textMessage.replace(".search ", "").trim();

                if (!query) {
                    await sock.sendMessage(jid, { text: "⚠️ Harap masukkan kata kunci pencarian!" });
                    return;
                }

                query = query.replace(/^(siapa itu|apa itu|pengertian|definisi) /i, "").trim();

                try {
                    const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
                    const data = await response.json();

                    if (response.status === 404 || !data.extract) {
                        await sock.sendMessage(jid, { text: `❌ Tidak ditemukan hasil untuk: *${query}* di Wikipedia.` });
                        return;
                    }

                    let message = `📖 *${data.title}*\n\n${data.extract}`;
                    if (data.content_urls && data.content_urls.desktop) {
                        message += `\n\n🔗 ${data.content_urls.desktop.page}`;
                    }

                    await sock.sendMessage(jid, { text: message });

                } catch (error) {
                    console.error("❌ Terjadi kesalahan saat mencari:", error);
                    await sock.sendMessage(jid, { text: "⚠️ Terjadi kesalahan saat mengambil data pencarian." });
                }
            }

            // 🌦 Fitur Cuaca
            if (textMessage.startsWith(".cuaca ")) {
                const location = textMessage.replace(".cuaca ", "").trim();

                if (!location) {
                    await sock.sendMessage(jid, { text: "⚠️ Harap masukkan lokasi! Contoh: *.cuaca Jakarta*" });
                    return;
                }

                try {
                    const apiKey = "e35b5bb5f7994b6e8fb110907251502"; // Ganti dengan API Key dari WeatherAPI
                    const url = `http://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${encodeURIComponent(location)}&aqi=no`;

                    const response = await fetch(url);
                    const data = await response.json();

                    if (data.error) {
                        await sock.sendMessage(jid, { text: `❌ Tidak dapat menemukan cuaca untuk: *${location}*` });
                        return;
                    }

                    const weatherTranslation = {
                        "Sunny": "Cerah",
                        "Clear": "Cerah",
                        "Partly cloudy": "Berawan sebagian",
                        "Cloudy": "Berawan",
                        "Overcast": "Mendung",
                        "Mist": "Berkabut",
                        "Patchy rain possible": "Hujan ringan kemungkinan",
                        "Light rain": "Hujan ringan",
                        "Moderate rain": "Hujan sedang",
                        "Heavy rain": "Hujan lebat",
                        "Thundery outbreaks possible": "Kemungkinan badai petir",
                        "Snow": "Salju",
                        "Fog": "Kabut",
                        "Haze": "Kabut asap"
                    };

                    const kondisiInggris = data.current.condition.text;
                    const kondisiIndonesia = weatherTranslation[kondisiInggris] || kondisiInggris;

                    const weatherInfo = `🌤 *Cuaca di ${data.location.name}, ${data.location.region}, ${data.location.country}*\n\n` +
                        `🌡 Suhu: ${data.current.temp_c}°C\n` +
                        `🌬 Kecepatan Angin: ${data.current.wind_kph} km/h\n` +
                        `💧 Kelembaban: ${data.current.humidity}%\n` +
                        `☁️ Kondisi: ${kondisiIndonesia}`;

                    await sock.sendMessage(jid, { text: weatherInfo });

                } catch (error) {
                    console.error("❌ Terjadi kesalahan saat mengambil cuaca:", error);
                    await sock.sendMessage(jid, { text: "⚠️ Terjadi kesalahan saat mengambil data cuaca." });
                }
            }
            if (textMessage.startsWith(".tagall")) {
                if (!msg.key.remoteJid.endsWith('@g.us')) {
                    await sock.sendMessage(jid, { text: "⚠️ Perintah ini hanya bisa digunakan di grup!" });
                    return;
                }

                let groupMetadata = await sock.groupMetadata(jid);
                let participants = groupMetadata.participants.map(p => p.id);
                let mentions = participants;

                let customMessage = textMessage.replace('.tagall', '').trim();
                let tagText = "📢 *Mention Semua Anggota* 📢\n\n";

                if (customMessage.length > 0) {
                    tagText += `📌 Pesan: ${customMessage}\n\n`;
                }

                participants.forEach(p => {
                    tagText += `@${p.split('@')[0]}\n`;
                });

                await sock.sendMessage(jid, { text: tagText, mentions });
                return;
            }

            if (textMessage === '.mtk') {
                if (!MathRidlles || MathRidlles.length === 0) {
                    await sock.sendMessage(jid, { text: "⚠️ Tidak ada soal tersedia saat ini!" });
                    return;
                }

                if (!currentMathRidlles) currentMathRidlles = {}; // Pastikan objek tidak null
                currentMathRidlles[senderNumber] = MathRidlles[Math.floor(Math.random() * MathRidlles.length)];

                await sock.sendMessage(jid, {
                    text: `🤔 Teka-teki matematika: ${currentMathRidlles[senderNumber].question}\n⏳ Kamu punya 60 detik untuk menjawab!`
                });

                setTimeout(async () => {
                    if (currentMathRidlles[senderNumber]) {
                        await sock.sendMessage(jid, {
                            text: `⏳ Waktu habis! Jawaban yang benar adalah: *${currentMathRidlles[senderNumber].answer}*`
                        });
                        delete currentMathRidlles[senderNumber]; // Hapus setelah waktu habis
                    }
                }, 60000);

                return;
            }

            if (textMessage.startsWith('.jawab ')) {
                const userAnswer = textMessage.replace('.jawab ', '').trim().toLowerCase();

                if (!currentMathRidlles[senderNumber]) {
                    await sock.sendMessage(jid, { text: "⚠️ Kamu belum mendapatkan soal! Gunakan .mtk untuk memulai." });
                    return;
                }

                if (userAnswer === currentMathRidlles[senderNumber].answer.toLowerCase()) {
                    scores[senderNumber] = (scores[senderNumber] || 0) + 1;

                    try {
                        fs.writeFileSync(scoresFile, JSON.stringify(scores));
                    } catch (error) {
                        console.error("❌ Gagal menyimpan skor:", error);
                    }

                    await sock.sendMessage(jid, { text: `🎉 Jawaban benar! Poin kamu: ${scores[senderNumber]}` });
                    delete currentMathRidlles[senderNumber]; // Hapus soal setelah dijawab
                } else {
                    await sock.sendMessage(jid, { text: "❌ Jawaban salah! Coba lagi." });
                }
            }

            if (textMessage.startsWith(".spam ")) {
                const args = textMessage.split(" ").slice(1); // Menghapus ".spam"

                if (args.length < 1 || isNaN(args[1])) {
                    await sock.sendMessage(jid, { text: "⚠️ Format salah! Gunakan: *.spam <kata> <jumlah>*" });
                    return;
                }

                const kata = args[0];
                const jumlah = Math.min(parseInt(args[1]), 20); // Batas maksimal spam 10 biar ga flood

                for (let i = 0; i < jumlah; i++) {
                    await sock.sendMessage(jid, { text: kata });
                }
            }

            if (!stickerSpamTracker) stickerSpamTracker = {};
            if (!violationTracker) violationTracker = {};

            if (stickerSpamTracker[senderNumber]) {
                const { count, lastTime } = stickerSpamTracker[senderNumber];

                if (Date.now() - lastTime < SPAM_INTERVAL) {
                    stickerSpamTracker[senderNumber].count += 1;
                } else {
                    stickerSpamTracker[senderNumber] = { count: 1, lastTime: Date.now() };
                }

                if (stickerSpamTracker[senderNumber].count >= SPAM_LIMIT) {
                    console.log(`🚫 ${senderNumber} dikeluarkan karena spam stiker.`);
                    await kickMembers(jid, [senderJid]);
                    delete stickerSpamTracker[senderNumber];
                    return;
                }
            } else {
                stickerSpamTracker[senderNumber] = { count: 1, lastTime: Date.now() };
            }

            if (badWords.some(word => textMessage.toLowerCase().includes(word))) {
                violationTracker[senderNumber] = (violationTracker[senderNumber] || 0) + 1;
                console.log(`🚨 ${senderNumber} mengirim kata kasar! Total pelanggaran: ${violationTracker[senderNumber]}`);

                // Hapus pesan dengan try-catch untuk menghindari error
                try {
                    await sock.sendMessage(jid, { delete: message.key });
                } catch (error) {
                    console.error(`❌ Gagal menghapus pesan dari ${senderNumber}:`, error);
                }

                // Kirim peringatan
                await sock.sendMessage(jid, {
                    text: `⚠️ @${senderNumber}, pesan kamu dihapus karena mengandung kata kasar! Pelanggaran: ${violationTracker[senderNumber]}/${VIOLATION_LIMIT}`,
                    mentions: [senderJid]
                });

                if (violationTracker[senderNumber] >= VIOLATION_LIMIT) {
                    console.log(`🚫 ${senderNumber} dikeluarkan karena terlalu banyak pelanggaran.`);
                    await kickMembers(jid, [senderJid]);
                    delete violationTracker[senderNumber];
                }
                return;
            }

            if (msg.message?.stickerMessage) {
                console.log(`🎭 Stiker diterima dari ${senderNumber}`);
                if (!allowedStickerSenders.includes(senderNumber)) {
                    console.log(`🗑 Menghapus stiker dari ${senderNumber}`);
                    try {
                        await sock.sendMessage(jid, { delete: message.key });
                    } catch (error) {
                        console.error(`❌ Gagal menghapus stiker dari ${senderNumber}:`, error);
                    }
                }
                // Cek jika menjawab soal matematika
                if (currentMathRidlles[senderNumber]) {
                    if (userAnswer === currentMathRidlles[senderNumber].answer.toLowerCase()) {
                        scores[senderNumber] = (scores[senderNumber] || 0) + 1;
                        fs.writeFileSync(scoresFile, JSON.stringify(scores));
                        await sock.sendMessage(jid, { text: `🎉 Jawaban benar! Poin kamu: ${scores[senderNumber]}` });
                        delete currentMathRidlles[senderNumber]; // Hapus soal setelah dijawab
                    } else {
                        await sock.sendMessage(jid, { text: "❌ Jawaban salah! Coba lagi." });
                    }
                    return;

                }
            }


            if (textMessage.startsWith(".coding ")) {
                const query = textMessage.replace(".coding ", "").trim();
                const code = await generateCode(query);

                await sock.sendMessage(msg.key.remoteJid, { text: `📜 Kode untuk ${query}:*\n\n\`\`\`${code}\`\`\`` });
                return;
            }
        } catch (error) {
            console.error("❌ Terjadi kesalahan dalam proses pesan:", error);
        }
    });
}
startBot();