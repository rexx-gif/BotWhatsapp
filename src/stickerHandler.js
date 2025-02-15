// Fungsi untuk mengecek apakah stiker melanggar aturan
async function checkSticker(message) {
    // Implementasikan logika deteksi stiker yang tidak sesuai
    // Contoh: Blokir stiker berdasarkan hash tertentu
    const bannedStickers = ['HASH_STIKER_TIDAK_DIIZINKAN'];
    
    if (message.message?.stickerMessage?.fileSha256) {
        const hash = Buffer.from(message.message.stickerMessage.fileSha256).toString('base64');
        return bannedStickers.includes(hash);
    }
    
    return false; // Default tidak dilarang
}

module.exports = { checkSticker };
