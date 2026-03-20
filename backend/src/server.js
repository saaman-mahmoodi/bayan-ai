const http = require("http");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { performance } = require("perf_hooks");

const PORT = Number(process.env.PORT || 8787);
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3";
const WHISPER_CPP_BIN = process.env.WHISPER_CPP_BIN || "";
const WHISPER_MODEL_PATH = process.env.WHISPER_MODEL_PATH || "";
const FFMPEG_BIN = process.env.FFMPEG_BIN || "";

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

function mimeTypeToExt(mimeType) {
  if (!mimeType) {
    return "webm";
  }

  if (mimeType.includes("wav")) {
    return "wav";
  }

  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) {
    return "mp3";
  }

  if (mimeType.includes("ogg")) {
    return "ogg";
  }

  return "webm";
}

async function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(`${command} exited with code ${code}: ${stderr || stdout}`));
    });
  });
}

async function transcribeWithWhisperCpp(audioBase64, mimeType) {
  if (!WHISPER_CPP_BIN || !WHISPER_MODEL_PATH) {
    return null;
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "bayan-stt-"));
  const inputExt = mimeTypeToExt(mimeType);
  const inputPath = path.join(workDir, `input.${inputExt}`);
  const wavPath = path.join(workDir, "input.wav");
  const outPrefix = path.join(workDir, "whisper_out");
  const outTextPath = `${outPrefix}.txt`;

  try {
    const audioBuffer = Buffer.from(audioBase64, "base64");
    await fs.writeFile(inputPath, audioBuffer);

    let sourcePath = inputPath;
    if (inputExt !== "wav") {
      if (!FFMPEG_BIN) {
        throw new Error("FFMPEG_BIN is required for non-wav microphone audio");
      }

      await runProcess(FFMPEG_BIN, ["-y", "-i", inputPath, wavPath]);
      sourcePath = wavPath;
    }

    await runProcess(WHISPER_CPP_BIN, [
      "-m",
      WHISPER_MODEL_PATH,
      "-f",
      sourcePath,
      "-of",
      outPrefix,
      "-otxt",
      "-np"
    ]);

    const transcript = (await fs.readFile(outTextPath, "utf8")).trim();
    if (!transcript) {
      throw new Error("Whisper.cpp returned empty transcript");
    }

    return transcript;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

async function transcribeAudio(audioBase64, mimeType) {
  const sttStart = performance.now();

  if (!audioBase64) {
    throw new Error("audioBase64 is required");
  }

  let transcript = "";
  let source = "fallback";

  try {
    const whisperTranscript = await transcribeWithWhisperCpp(audioBase64, mimeType);
    if (whisperTranscript) {
      transcript = whisperTranscript;
      source = "whisper.cpp";
    }
  } catch (error) {
    console.warn(`[bayan-backend] whisper.cpp STT failed: ${error.message}`);
  }

  if (!transcript) {
    transcript = "I would like to practice speaking about my daily routine.";
  }

  const sttMs = Math.round(performance.now() - sttStart);

  return {
    transcript,
    timings: { sttMs },
    meta: {
      mimeType: mimeType || "audio/webm",
      source
    }
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
