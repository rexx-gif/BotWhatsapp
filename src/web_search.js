const axios = require('axios');
require('dotenv').config();

async function webSearch(query) {
    try {
        const response = await axios.get('https://api.duckduckgo.com/', {
            params: {
                q: query,
                format: 'json'
            },
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; Bot/1.0; +https://example.com/bot)'
            }
        });

        if (response.data.Abstract) {
            return response.data.Abstract;
        } else if (response.data.RelatedTopics && response.data.RelatedTopics.length > 0) {
            return response.data.RelatedTopics[0].Text;
        } else {
            return "Maaf, saya tidak menemukan jawaban yang relevan.";
        }
    } catch (error) {
        console.error("❌ Error saat mencari di web:", error.response ? error.response.data : error.message);
        return "Terjadi kesalahan saat mencari jawaban.";
    }
}

module.exports = { webSearch };
