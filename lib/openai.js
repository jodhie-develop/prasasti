const response = await fetch(
  "https://api.openai.com/v1/responses",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-5.5-mini",
      input: [
        {
          role: "system",
          content: systemPrompt + "\n\n" + company + "\n\n" + services + "\n\n" + faq
        },
        ...history,
        {
          role: "user",
          content: message
        }
      ],
      temperature: 0.3
    })
  }
);

const data = await response.json();

return data.output_text;
