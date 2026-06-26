// netlify/functions/analyze.js

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const apiKey = process.env.HUGGINGFACE_API_KEY;

  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "HUGGINGFACE_API_KEY environment variable is not set.",
      }),
    };
  }

  let body;

  try {
    body = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid JSON body." }),
    };
  }

  const { text } = body;

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "Missing or empty 'text' field.",
      }),
    };
  }

  const prompt = `You are a sentiment analysis engine. Analyze the sentiment of the following text and respond ONLY with a valid JSON object.

Text: "${text.replace(/"/g, '\\"')}"

Respond with exactly this JSON structure:
{
  "sentiment": "positive" | "negative" | "neutral",
  "confidence": <number 0-100>,
  "scores": {
    "positive": <number 0-100>,
    "negative": <number 0-100>,
    "neutral": <number 0-100>
  },
  "positiveWords": ["word1","word2"],
  "negativeWords": ["word1","word2"],
  "summary": "<one sentence explanation>"
}

Rules:
- scores must sum to 100
- confidence is the dominant score
- Extract up to 5 positive words and 5 negative words
- Respond ONLY with JSON`;

  try {
    const response = await fetch(
      "https://router.huggingface.co/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "meta-llama/Llama-3.1-8B-Instruct",
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.2,
          max_tokens: 1000,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({
          error: data.error?.message || "Hugging Face API error",
        }),
      };
    }

    const raw = data.choices[0].message.content;
    const clean = raw.replace(/```json|```/g, "").trim();
    const result = JSON.parse(clean);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(result),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message || "Internal server error",
      }),
    };
  }
};
