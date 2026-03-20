const http = require("http");
const { performance } = require("perf_hooks");

const PORT = Number(process.env.PORT || 8787);
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3";

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) {
    return {};
  }

  return JSON.parse(raw);
}

async function transcribeAudio(audioBase64, mimeType) {
  const sttStart = performance.now();

  if (!audioBase64) {
    throw new Error("audioBase64 is required");
  }

  // Phase 1 placeholder: replace with whisper.cpp process call.
  const simulatedTranscript =
    "I would like to practice speaking about my daily routine.";

  const sttMs = Math.round(performance.now() - sttStart);

  return {
    transcript: simulatedTranscript,
    timings: { sttMs },
    meta: { mimeType: mimeType || "audio/webm" }
  };
}

async function generateReply(transcript) {
  const llmStart = performance.now();

  if (!transcript) {
    throw new Error("transcript is required");
  }

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: `You are a concise language tutor. Respond naturally to the learner input.\nLearner: ${transcript}`,
        stream: false
      })
    });

    if (response.ok) {
      const data = await response.json();
      const llmMs = Math.round(performance.now() - llmStart);
      return {
        reply: data.response || "I heard you.",
        timings: { llmMs },
        model: OLLAMA_MODEL,
        source: "ollama"
      };
    }
  } catch (error) {
    // Intentionally falls through to local mock response.
  }

  const llmMs = Math.round(performance.now() - llmStart);
  return {
    reply: `Thanks for sharing: "${transcript}". Let's expand this with one more sentence in your target language.`,
    timings: { llmMs },
    model: "mock-tutor",
    source: "fallback"
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST,GET,OPTIONS"
    });
    res.end();
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, { ok: true, service: "bayan-backend" });
    return;
  }

  if (req.method === "POST" && req.url === "/api/stt") {
    try {
      const body = await readJsonBody(req);
      const result = await transcribeAudio(body.audioBase64, body.mimeType);
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/chat") {
    try {
      const body = await readJsonBody(req);
      const result = await generateReply(body.transcript);
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`[bayan-backend] listening on http://127.0.0.1:${PORT}`);
});
