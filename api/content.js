import { loadContent } from "../lib/content.js";

// Public, read-only: the home page renders its gallery and hero slider from this.
export default async function handler(req, res) {

    if (req.method !== "GET") {
        return res.status(405).json({
            error: "Method Not Allowed"
        });
    }

    try {

        const { content } = await loadContent();

        res.setHeader("Cache-Control", "public, max-age=0, s-maxage=30, stale-while-revalidate=300");
        return res.status(200).json(content);

    } catch (err) {

        console.error(err);

        return res.status(500).json({
            error: "Gagal memuat konten"
        });

    }

}
