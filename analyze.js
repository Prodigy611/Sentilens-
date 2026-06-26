// netlify/functions/analyze.js
// This serverless function proxies requests to the Anthropic API.
// Your API key lives ONLY here as a Netlify environment variable — never in the browser.

exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "ANTHROPIC_API_KEY environment variable is not set." }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body." }) };
  }

  const { text } = body;
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: "Missing or empty 'text' field." }) };
  }

  const prompt = `You are a sentiment analysis engine. Analyze the sentiment of the following text and respond ONLY with a valid JSON object (no markdown, no explanation):

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
  "positiveWords": ["word1", "word2"],
  "negativeWords": ["word1", "word2"],
  "summary": "<one sentence explanation>"
}

Rules:
- scores.positive + scores.negative + scores.neutral must sum to 100
- confidence is the score of the dominant sentiment
- Extract up to 5 key positive signal words and 5 key negative signal words from the actual text
- Be accurate and nuanced`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: data.error?.message || "Anthropic API error" }),
      };
    }

    const raw = data.content.map((b) => b.text || "").join("");
    const clean = raw.replace(/```json|```/g, "").trim();
    const result = JSON.parse(clean);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "Internal server error" }),
    };
  }
};
