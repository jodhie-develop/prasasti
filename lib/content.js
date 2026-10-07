import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { head, list, put, del, BlobNotFoundError } from "@vercel/blob";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_FILE = path.join(__dirname, "..", "data", "site-content.json");

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

// Every save writes a new, never-overwritten file content/rev-<n>.json.
// Overwriting one file does not work for a public store: reads come through
// the CDN, which can serve the previous version for up to a minute, so two
// saves in a row would each start from stale data and drop earlier changes.
// A fresh pathname is never cached, and list() comes from the API, not the CDN.
const VERSION_PREFIX = "content/rev-";
const KEEP_VERSIONS = 10;
// Written by earlier builds of the admin; still read until the first new save.
const LEGACY_PATH = "site-content.json";

const versionPath = (rev) => `${VERSION_PREFIX}${String(rev).padStart(8, "0")}.json`;

async function listVersions() {
    const { blobs } = await list({ prefix: VERSION_PREFIX, limit: 1000 });
    return blobs
        .map(b => ({ url: b.url, rev: parseInt(b.pathname.slice(VERSION_PREFIX.length), 10) }))
        .filter(v => Number.isFinite(v.rev))
        .sort((a, b) => a.rev - b.rev);
}

async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Gagal membaca konten (${res.status})`);
    return res.json();
}

async function loadLegacy() {
    try {
        const meta = await head(LEGACY_PATH);
        return await fetchJson(`${meta.url}?v=${encodeURIComponent(meta.etag)}`);
    } catch (err) {
        if (err instanceof BlobNotFoundError) return readSeed();
        throw err;
    }
}

/**
 * Current site content plus its revision number (0 while the site still runs
 * on the seed file committed in the repo, or on the legacy single file).
 */
export async function loadContent() {
    if (!blobConfigured()) return { content: readSeed(), rev: 0 };
    const latest = (await listVersions()).at(-1);
    if (!latest) return { content: await loadLegacy(), rev: 0 };
    return { content: await fetchJson(latest.url), rev: latest.rev };
}

class ConflictError extends Error {}

async function saveContent(content, rev) {
    const pathname = versionPath(rev + 1);
    try {
        await put(pathname, JSON.stringify(content), {
            access: "public",
            contentType: "application/json",
            addRandomSuffix: false,
            allowOverwrite: false,
            cacheControlMaxAge: 31536000
        });
    } catch (err) {
        // put() refuses an existing pathname: someone else saved this revision first.
        const taken = await head(pathname).then(() => true, () => false);
        throw taken ? new ConflictError() : err;
    }
}

async function pruneVersions() {
    const old = (await listVersions()).slice(0, -KEEP_VERSIONS).map(v => v.url);
    if (old.length) await del(old);
}

/**
 * Read-modify-write. A save that loses a race to another admin starts over
 * from the newer content instead of overwriting it.
 */
export async function updateContent(mutate) {
    for (let attempt = 0; ; attempt++) {
        const { content, rev } = await loadContent();
        const result = await mutate(content);
        try {
            await saveContent(content, rev);
        } catch (err) {
            if (err instanceof ConflictError && attempt < 3) continue;
            if (err instanceof ConflictError) throw new HttpError(409, "Konten sedang diubah admin lain, coba lagi");
            throw err;
        }
        await pruneVersions().catch(err => console.error("prune failed", err));
        return { content, result };
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
