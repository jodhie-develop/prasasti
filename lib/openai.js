import fs from "fs";
import path from "path";

function readFile(relativePath) {

    try {

        return fs.readFileSync(
            path.join(process.cwd(), relativePath),
            "utf8"
        );

    } catch {

        return "";

    }

}

export async function askOpenAI({
    message,
    history = []
}) {

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {

        throw new Error("OPENAI_API_KEY belum diset.");

    }

    const systemPrompt = readFile("prompt/system.md");

    const company = readFile("knowledge/company.md");

    const services = readFile("knowledge/services.md");

    const faq = readFile("knowledge/faq.md");

    const messages = [

        {
            role: "system",
            content:
                systemPrompt +
                "\n\n" +
                company +
                "\n\n" +
                services +
                "\n\n" +
                faq
        },

        ...history,

        {
            role: "user",
            content: message
        }

    ];

    const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {

            method: "POST",

            headers: {

                Authorization: `Bearer ${apiKey}`,

                "Content-Type": "application/json"

            },

            body: JSON.stringify({

                model: "gpt-5.5-mini",

                temperature: 0.3,

                messages

            })

        }

    );

    const data = await response.json();

    if (!response.ok) {

        console.log(data);

        throw new Error(
            data.error?.message || "OpenAI Error"
        );

    }

    return data.choices[0].message.content;

}
