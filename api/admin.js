import crypto from "crypto";
import {
    blobConfigured, loadContent, updateContent, uploadImage, deleteBlobs,
    HttpError, validSrc, validPosition, cleanText
} from "../lib/content.js";

const MAX_SLIDES = 12;

function authorized(req) {
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) return false;
    const given = (req.headers.authorization || "").replace(/^Bearer /, "");
    // Compare hashes so the check takes the same time whatever the input length.
    const a = crypto.createHash("sha256").update(given).digest();
    const b = crypto.createHash("sha256").update(expected).digest();
    return crypto.timingSafeEqual(a, b);
}

function slug(name) {
    return String(name || "foto").toLowerCase().replace(/\.[a-z0-9]+$/, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "foto";
}

// Sources the site still points at; anything else from the Blob store can be deleted.
function usedSources(content) {
    const used = new Set(content.slider.slides.map(s => s.src));
    content.gallery.forEach(g => { used.add(g.full); used.add(g.thumb); });
    return used;
}

const actions = {

    async get() {
        const { content } = await loadContent();
        return content;
    },

    async upload(body) {
        const target = body.target === "slider" ? "slider" : "gallery";
        const name = slug(body.name);
        const full = await uploadImage(`${target}/${name}-full`, body.full);

        if (target === "slider") return { src: full };

        let thumb;
        try {
            thumb = await uploadImage(`gallery/${name}-thumb`, body.thumb);
        } catch (err) {
            await deleteBlobs([full]);
            throw err;
        }
        const { content, result } = await updateContent(content => {
            if (!content.categories.some(c => c.id === body.cat)) {
                throw new HttpError(400, "Kategori tidak dikenal");
            }
            const item = {
                id: `${name}-${crypto.randomBytes(4).toString("hex")}`,
                cat: body.cat,
                full,
                thumb,
                alt: cleanText(body.alt, 120) || content.categories.find(c => c.id === body.cat).label,
                w: Math.max(1, Math.min(4000, parseInt(body.w, 10) || 600)),
                h: Math.max(1, Math.min(4000, parseInt(body.h, 10) || 600))
            };
            // Keep photos grouped by category, newest last within its group.
            let at = -1;
            content.gallery.forEach((g, i) => { if (g.cat === item.cat) at = i; });
            content.gallery.splice(at === -1 ? content.gallery.length : at + 1, 0, item);
            return item;
        }).catch(async err => {
            await deleteBlobs([full, thumb]);
            throw err;
        });
        return { content, item: result };
    },

    async update(body) {
        const { content } = await updateContent(content => {
            const item = content.gallery.find(g => g.id === body.id);
            if (!item) throw new HttpError(404, "Foto tidak ditemukan");
            if (body.cat !== undefined) {
                if (!content.categories.some(c => c.id === body.cat)) throw new HttpError(400, "Kategori tidak dikenal");
                item.cat = body.cat;
            }
            if (body.alt !== undefined) item.alt = cleanText(body.alt, 120) || item.alt;
        });
        return { content };
    },

    async delete(body) {
        const { content, result: removed } = await updateContent(content => {
            const item = content.gallery.find(g => g.id === body.id);
            if (!item) throw new HttpError(404, "Foto tidak ditemukan");
            if (content.slider.slides.some(s => s.src === item.full)) {
                throw new HttpError(409, "Foto ini dipakai di slider. Hapus dulu dari slider.");
            }
            content.gallery = content.gallery.filter(g => g !== item);
            return item;
        });
        const used = usedSources(content);
        await deleteBlobs([removed.full, removed.thumb].filter(src => !used.has(src)));
        return { content };
    },

    async slider(body) {
        const slides = Array.isArray(body.slides) ? body.slides : [];
        if (!slides.length) throw new HttpError(400, "Slider minimal berisi 1 foto");
        if (slides.length > MAX_SLIDES) throw new HttpError(400, `Slider maksimal ${MAX_SLIDES} foto`);
        const clean = slides.map(s => {
            if (!validSrc(s.src)) throw new HttpError(400, "Alamat gambar slider tidak valid");
            return { src: s.src, position: validPosition(s.position) ? s.position.trim() : "center" };
        });
        const interval = Math.max(3, Math.min(30, parseInt(body.interval, 10) || 7));

        let previous = [];
        const { content } = await updateContent(content => {
            previous = content.slider.slides.map(s => s.src);
            content.slider = { interval, slides: clean };
        });
        const used = usedSources(content);
        await deleteBlobs(previous.filter(src => !used.has(src)));
        return { content };
    }

};

export default async function handler(req, res) {

    res.setHeader("Cache-Control", "no-store");

    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Method Not Allowed"
        });
    }

    if (!process.env.ADMIN_PASSWORD) {
        return res.status(500).json({
            error: "ADMIN_PASSWORD belum diset di Environment Variables Vercel"
        });
    }

    if (!authorized(req)) {
        return res.status(401).json({
            error: "Password salah"
        });
    }

    const body = req.body || {};
    const action = actions[body.action];

    if (!action) {
        return res.status(400).json({
            error: "Aksi tidak dikenal"
        });
    }

    if (body.action !== "get" && !blobConfigured()) {
        return res.status(500).json({
            error: "Vercel Blob belum dihubungkan ke project ini"
        });
    }

    try {

        return res.status(200).json(await action(body));

    } catch (err) {

        if (err instanceof HttpError) {
            return res.status(err.status).json({
                error: err.message
            });
        }

        console.error(err);

        return res.status(500).json({
            error: err.message
        });

    }

}
