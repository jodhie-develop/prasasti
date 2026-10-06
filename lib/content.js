import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { get, put, del, BlobPreconditionFailedError } from "@vercel/blob";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_FILE = path.join(__dirname, "..", "data", "site-content.json");
const CONTENT_PATH = "site-content.json";

// Repo files (gallery/...) or files in this project's public Blob store.
const SRC_RE = /^(gallery\/[\w.\-\/]+|https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/[\w.\-\/]+)$/i;
const POSITION_RE = /^[a-z0-9.% ]{1,30}$/i;

export function blobConfigured() {
    return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

export function isBlobUrl(src) {
    return /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\//i.test(src);
}

function readSeed() {
    return JSON.parse(fs.readFileSync(SEED_FILE, "utf-8"));
}

/**
 * Current site content plus the ETag of the stored copy (null while the
 * site still runs on the seed file committed in the repo).
 */
export async function loadContent() {
    if (!blobConfigured()) return { content: readSeed(), etag: null };
    const result = await get(CONTENT_PATH, { access: "public", useCache: false });
    if (!result || result.statusCode !== 200) return { content: readSeed(), etag: null };
    const text = await new Response(result.stream).text();
    return { content: JSON.parse(text), etag: result.blob.etag };
}

export async function saveContent(content, etag) {
    await put(CONTENT_PATH, JSON.stringify(content), {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: false,
        cacheControlMaxAge: 60,
        ...(etag ? { ifMatch: etag } : { allowOverwrite: true })
    });
}

/**
 * Read-modify-write with an ETag check, retried once if another admin
 * saved in between.
 */
export async function updateContent(mutate) {
    for (let attempt = 0; ; attempt++) {
        const { content, etag } = await loadContent();
        const result = await mutate(content);
        try {
            await saveContent(content, etag);
            return { content, result };
        } catch (err) {
            if (attempt === 0 && err instanceof BlobPreconditionFailedError) continue;
            throw err;
        }
    }
}

// The admin page re-encodes every upload as WebP, or JPEG on browsers
// (Safari) whose canvas cannot encode WebP.
function imageType(buffer) {
    if (buffer.length > 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
        return { ext: "webp", contentType: "image/webp" };
    }
    if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return { ext: "jpg", contentType: "image/jpeg" };
    }
    return null;
}

export async function uploadImage(basePath, base64) {
    const buffer = Buffer.from(String(base64 || ""), "base64");
    const type = imageType(buffer);
    if (!type) throw new HttpError(400, "File harus berupa gambar WebP atau JPEG");
    const blob = await put(`${basePath}.${type.ext}`, buffer, {
        access: "public",
        contentType: type.contentType,
        addRandomSuffix: true,
        cacheControlMaxAge: 2592000
    });
    return blob.url;
}

export async function deleteBlobs(urls) {
    const targets = urls.filter(isBlobUrl);
    if (targets.length) await del(targets);
}

export class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

export function validSrc(src) {
    return typeof src === "string" && SRC_RE.test(src);
}

export function validPosition(position) {
    return typeof position === "string" && POSITION_RE.test(position);
}

export function cleanText(value, max) {
    return String(value ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max);
}
