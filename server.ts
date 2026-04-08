import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 4173;
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = "llama-3.3-70b-versatile";

if (!GROQ_API_KEY) {
  console.error("GROQ_API_KEY is not set. AI features will fail.");
} else {
  console.log("GROQ_API_KEY is set (length: " + GROQ_API_KEY.length + ")");
}

app.use(express.json());

// Service worker needs to be served from root with correct scope
app.get('/sw.js', (_req, res) => {
  res.setHeader('Service-Worker-Allowed', '/');
  res.sendFile(path.join(__dirname, 'dist', 'sw.js'));
});

app.use(express.static(path.join(__dirname, "dist")));

// Rate limiting: simple in-memory per-IP limiter
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30; // requests per window
const RATE_WINDOW = 60_000; // 1 minute

function rateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  const ip = req.ip || "unknown";
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return next();
  }
  if (entry.count >= RATE_LIMIT) {
    return res.status(429).json({ error: "Too many requests. Please wait a moment." });
  }
  entry.count++;
  return next();
}

// Proxy endpoint for Groq API
app.post("/api/chat", rateLimit, async (req, res) => {
  try {
    const { systemPrompt, userPrompt } = req.body;

    if (!systemPrompt || !userPrompt) {
      return res.status(400).json({ error: "systemPrompt and userPrompt are required." });
    }
    if (typeof systemPrompt !== "string" || typeof userPrompt !== "string") {
      return res.status(400).json({ error: "Prompts must be strings." });
    }
    if (systemPrompt.length > 2000 || userPrompt.length > 2000) {
      return res.status(400).json({ error: "Prompt too long (max 2000 chars)." });
    }

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        response_format: { type: "json_object" },
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error("Groq API error:", groqRes.status, groqRes.statusText, errText);
      return res.status(502).json({ error: "AI service error. Please try again. Status: " + groqRes.status });
    }

    const data = await groqRes.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return res.status(502).json({ error: "Empty response from AI." });
    }

    res.json({ content });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

// SPA fallback
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Karka server running at http://localhost:${PORT}`);
});
