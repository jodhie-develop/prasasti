export default async function handler(req, res) {
    // Penanganan CORS Policy
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Mengambil API Key dari Environment Variables Vercel
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'Error: Konfigurasi GEMINI_API_KEY tidak ditemukan di Dashboard Vercel.' });
    }

    try {
        const { message } = req.body;
        if (!message) {
            return res.status(400).json({ error: 'Pesan kosong' });
        }

        // Menggunakan model Gemini 2.5 Flash terbaru
        const modelName = "gemini-2.5-flash";
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

        const geminiPayload = {
            contents: [
                {
                    parts: [{ text: message }]
                }
            ]
        };

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiPayload)
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({ error: data.error?.message || "Gemini API Gateway Error" });
        }

        // Ekstraksi teks balasan murni dari struktur json Google Gemini
        const replyText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Maaf, saya tidak dapat memproses jawaban saat ini.";

        return res.status(200).json({ reply: replyText });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
