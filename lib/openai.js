import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");

/**
 * Safely read a text file, returning "" if it doesn't exist yet
 * (so the bot never crashes just because a knowledge file is missing).
 */
function readTextFile(relativePath) {
    try {
        return fs.readFileSync(path.join(ROOT, relativePath), "utf-8");
    } catch (err) {
        console.warn(`[openai.js] Could not read ${relativePath}:`, err.message);
        return "";
    }
}

// Load the persona/rules + knowledge base once when the function cold-starts.
const systemPrompt = readTextFile("prompt/system.md");
const company = readTextFile("knowledge/company.md");
const services = readTextFile("knowledge/services.md");
const faq = readTextFile("knowledge/faq.md");

const BASE_SYSTEM_MESSAGE = [
    systemPrompt,
    "\n--- INFORMASI PERUSAHAAN ---\n" + company,
    "\n--- LAYANAN ---\n" + services,
    "\n--- FAQ ---\n" + faq
].join("\n");

/**
 * Calls the OpenAI Responses API and returns the assistant's reply text.
 *
 * @param {Object} params
 * @param {string} params.message - The user's latest message.
 * @param {Array<{role: string, content: string}>} [params.history] - Prior turns of the conversation.
 * @param {string} [params.extraContext] - Optional extra instructions/context sent from the frontend
 *                                         (e.g. live rate rules shown in the UI). Treated as additional
 *                                         reference info, never overrides the base persona/rules above.
 */
export async function askOpenAI({ message, history = [], extraContext = "" }) {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
        throw new Error(
            "OPENAI_API_KEY belum diatur. Tambahkan di Vercel Project Settings > Environment Variables."
        );
    }

    const systemMessage = extraContext
        ? `${BASE_SYSTEM_MESSAGE}\n\n--- KONTEKS TAMBAHAN DARI FRONTEND ---\n${extraContext}`
        : BASE_SYSTEM_MESSAGE;

    // Normalize whatever shape of history we got into the {role, content} format the API expects.
    const normalizedHistory = (Array.isArray(history) ? history : [])
        .filter((turn) => turn && turn.role && turn.content)
        .map((turn) => ({ role: turn.role, content: String(turn.content) }));

    const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: process.env.OPENAI_MODEL || "gpt-5.5-mini",
            input: [
                { role: "system", content: systemMessage },
                ...normalizedHistory,
                { role: "user", content: message }
            ],
            temperature: 0.3
        })
    });

    const data = await response.json();

    if (!response.ok) {
        const apiError = data?.error?.message || `OpenAI API error (status ${response.status})`;
        throw new Error(apiError);
    }

    const reply = data.output_text?.trim();

    if (!reply) {
        throw new Error("OpenAI tidak mengembalikan jawaban yang valid.");
    }

    return reply;
}
