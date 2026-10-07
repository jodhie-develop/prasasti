// Contact form on the home page: forwards each message to the office inbox via Resend.
const TO = "info@prasastiindonesia.com";
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;

// Best effort only: Fluid Compute reuses instances, so this blocks bursts from one visitor.
const RATE_LIMIT = 5;
const RATE_WINDOW = 10 * 60 * 1000;
const recent = new Map();

function limited(ip) {
    const now = Date.now();
    const hits = (recent.get(ip) || []).filter(t => now - t < RATE_WINDOW);
    if (hits.length >= RATE_LIMIT) return true;
    hits.push(now);
    recent.set(ip, hits);
    if (recent.size > 1000) recent.delete(recent.keys().next().value);
    return false;
}

function clean(value, max) {
    return String(value ?? "").replace(/\r\n?/g, "\n").trim().slice(0, max);
}

function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);
}

async function sendEmail({ name, email, message }) {
    const domain = process.env.RESEND_EMAIL_DOMAIN || "prasastiindonesia.com";
    const html = `
        <p><b>Nama:</b> ${escapeHtml(name)}<br>
        <b>Email:</b> ${escapeHtml(email)}</p>
        <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
        <hr><p style="color:#888;font-size:12px">Dikirim dari form kontak prasastiindonesia.com. Klik Reply untuk membalas pengirim.</p>`;
    const text = `Nama: ${name}\nEmail: ${email}\n\n${message}\n\n--\nDikirim dari form kontak prasastiindonesia.com.`;

    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            from: `Website Prasasti <website@${domain}>`,
            to: [TO],
            reply_to: email,
            subject: `Pesan website dari ${name.replace(/\s+/g, " ").slice(0, 60)}`,
            html,
            text
        })
    });

    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Resend ${res.status}: ${detail.slice(0, 300)}`);
    }
}

export default async function handler(req, res) {

    res.setHeader("Cache-Control", "no-store");

    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Method Not Allowed"
        });
    }

    if (!process.env.RESEND_API_KEY) {
        return res.status(500).json({
            error: "Layanan email belum dikonfigurasi"
        });
    }

    const body = req.body || {};

    // Honeypot: real visitors never see or fill this field.
    if (body.website) {
        return res.status(200).json({
            ok: true
        });
    }

    const name = clean(body.name, 100);
    const email = clean(body.email, 200);
    const message = clean(body.message, 5000);

    if (!name || !email || !message) {
        return res.status(400).json({
            error: "Nama, email, dan pesan wajib diisi"
        });
    }

    if (!EMAIL_RE.test(email)) {
        return res.status(400).json({
            error: "Alamat email tidak valid"
        });
    }

    const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
    if (limited(ip)) {
        return res.status(429).json({
            error: "Terlalu banyak pesan. Coba lagi beberapa menit lagi."
        });
    }

    try {

        await sendEmail({ name, email, message });

        return res.status(200).json({
            ok: true
        });

    } catch (err) {

        console.error(err);

        return res.status(502).json({
            error: "Pesan gagal terkirim. Silakan coba lagi atau email langsung ke info@prasastiindonesia.com"
        });

    }

}
