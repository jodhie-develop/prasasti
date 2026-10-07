// Contact form on the home page: forwards each message to the office inbox via Resend
// and sends the visitor a short confirmation.
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

// Accepts "0812-3456-789", "+62 812...", "62812..." etc. and returns digits with country code.
function waNumber(raw) {
    let digits = raw.replace(/[\s().-]/g, "");
    if (!/^\+?\d{8,16}$/.test(digits)) return null;
    digits = digits.replace(/^\+/, "");
    if (digits.startsWith("0")) digits = "62" + digits.slice(1);
    return digits;
}

function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);
}

const domain = () => process.env.RESEND_EMAIL_DOMAIN || "prasastiindonesia.com";

async function resend(payload) {
    const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Resend ${res.status}: ${detail.slice(0, 300)}`);
    }
}

function notifyOffice({ name, whatsapp, wa, email, message }) {
    const html = `
        <p><b>Nama:</b> ${escapeHtml(name)}<br>
        <b>WhatsApp:</b> ${escapeHtml(whatsapp)} &middot; <a href="https://wa.me/${wa}">Chat di WhatsApp</a><br>
        <b>Email:</b> ${escapeHtml(email)}</p>
        <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
        <hr><p style="color:#888;font-size:12px">Dikirim dari form kontak prasastiindonesia.com. Klik Reply untuk membalas pengirim.</p>`;
    const text = `Nama: ${name}
WhatsApp: ${whatsapp} (https://wa.me/${wa})
Email: ${email}

${message}

--
Dikirim dari form kontak prasastiindonesia.com.`;

    return resend({
        from: `Website Prasasti <website@${domain()}>`,
        to: [TO],
        reply_to: email,
        subject: `Pesan website dari ${name.replace(/\s+/g, " ").slice(0, 60)}`,
        html,
        text
    });
}

// Confirmation to the visitor. It deliberately does not echo their message, so the form
// can't be used to send arbitrary text to someone else's inbox from our domain.
function replyToVisitor({ name, email }) {
    const first = name.replace(/\s+/g, " ").slice(0, 40);
    const html = `
        <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#1a2433;max-width:560px">
        <p>Halo ${escapeHtml(first)},</p>
        <p>Terima kasih telah menghubungi <b>PT. Prasasti Adyadma Sentosa</b>. Pesan Anda sudah kami terima dan tim kami akan segera menghubungi Anda kembali.</p>
        <p>Untuk kebutuhan mendesak, silakan hubungi kami di <a href="mailto:${TO}">${TO}</a> atau kunjungi <a href="https://www.prasastiindonesia.com">prasastiindonesia.com</a>.</p>
        <p style="color:#666">Thank you for contacting PT. Prasasti Adyadma Sentosa. We have received your message and our team will get back to you shortly.</p>
        <p>Salam,<br><b>PT. Prasasti Adyadma Sentosa</b><br>International Air &amp; Sea Freight Forwarder Logistics</p>
        </div>`;
    const text = `Halo ${first},

Terima kasih telah menghubungi PT. Prasasti Adyadma Sentosa. Pesan Anda sudah kami terima dan tim kami akan segera menghubungi Anda kembali.

Untuk kebutuhan mendesak, silakan hubungi kami di ${TO} atau kunjungi https://www.prasastiindonesia.com.

Thank you for contacting PT. Prasasti Adyadma Sentosa. We have received your message and our team will get back to you shortly.

Salam,
PT. Prasasti Adyadma Sentosa
International Air & Sea Freight Forwarder Logistics`;

    return resend({
        from: `PT. Prasasti Adyadma Sentosa <info@${domain()}>`,
        to: [email],
        reply_to: TO,
        subject: "Terima kasih, pesan Anda sudah kami terima",
        html,
        text
    });
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
    const whatsapp = clean(body.whatsapp, 30);
    const email = clean(body.email, 200);
    const message = clean(body.message, 5000);

    if (!name || !whatsapp || !email || !message) {
        return res.status(400).json({
            error: "Nama, nomor WhatsApp, email, dan pesan wajib diisi"
        });
    }

    const wa = waNumber(whatsapp);
    if (!wa) {
        return res.status(400).json({
            error: "Nomor WhatsApp tidak valid"
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

        await notifyOffice({ name, whatsapp, wa, email, message });

        // The office already has the message, so a failed confirmation shouldn't show an error.
        await replyToVisitor({ name, email }).catch(err => console.error("Auto-reply failed:", err));

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
