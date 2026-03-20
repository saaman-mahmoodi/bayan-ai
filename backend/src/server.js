const http = require("http");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { performance } = require("perf_hooks");
const { randomBytes } = require("crypto");
const bcrypt = require("bcryptjs");
const sqlite3 = require("sqlite3").verbose();

const PORT = Number(process.env.PORT || 8787);
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3";
const WHISPER_CPP_BIN = process.env.WHISPER_CPP_BIN || "";
const WHISPER_MODEL_PATH = process.env.WHISPER_MODEL_PATH || "";
const FFMPEG_BIN = process.env.FFMPEG_BIN || "";
const PIPER_BIN = process.env.PIPER_BIN || "";
const PIPER_MODEL_PATH = process.env.PIPER_MODEL_PATH || "";
const AUTH_SESSION_TTL_DAYS = Number(process.env.AUTH_SESSION_TTL_DAYS || 30);
const DB_PATH = process.env.BAYAN_DB_PATH || path.join(__dirname, "..", "..", "data", "bayan.sqlite");

let db;

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }

      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(row || null);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(rows || []);
    });
  });
}

async function initDatabase() {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });

  db = await new Promise((resolve, reject) => {
    const instance = new sqlite3.Database(DB_PATH, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(instance);
    });
  });

  await dbRun(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id INTEGER PRIMARY KEY,
      target_language TEXT NOT NULL DEFAULT 'English',
      native_language TEXT NOT NULL DEFAULT 'Arabic',
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS practice_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS practice_turns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      transcript TEXT NOT NULL,
      reply TEXT NOT NULL,
      grammar_correction TEXT NOT NULL,
      pronunciation_suggestions TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(session_id) REFERENCES practice_sessions(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS progress_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      metric_key TEXT NOT NULL,
      metric_value REAL NOT NULL,
      recorded_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function buildAuthHeaders(req) {
  const value = req.headers.authorization || "";
  if (!value.startsWith("Bearer ")) {
    return null;
  }

  return value.slice("Bearer ".length).trim();
}

async function getAuthUser(req) {
  const token = buildAuthHeaders(req);
  if (!token) {
    return null;
  }

  const row = await dbGet(
    `
      SELECT u.id, u.email, p.target_language AS targetLanguage, p.native_language AS nativeLanguage
      FROM auth_sessions s
      JOIN users u ON u.id = s.user_id
      LEFT JOIN user_preferences p ON p.user_id = u.id
      WHERE s.token = ? AND datetime(s.expires_at) > datetime('now')
    `,
    [token]
  );

  if (!row) {
    return null;
  }

  return {
    token,
    user: {
      id: row.id,
      email: row.email,
      preferences: {
        targetLanguage: row.targetLanguage || "English",
        nativeLanguage: row.nativeLanguage || "Arabic"
      }
    }
  };
}

async function requireAuth(req) {
  const auth = await getAuthUser(req);
  if (!auth) {
    throw new Error("Unauthorized");
  }

  return auth;
}

async function issueAuthSession(userId) {
  const token = randomBytes(24).toString("hex");
  const expiresAt = addDays(new Date(), AUTH_SESSION_TTL_DAYS).toISOString();
  await dbRun("INSERT INTO auth_sessions (token, user_id, expires_at) VALUES (?, ?, ?)", [
    token,
    userId,
    expiresAt
  ]);
  return token;
}

async function upsertPreferences(userId, preferences = {}) {
  const targetLanguage = (preferences.targetLanguage || "English").trim() || "English";
  const nativeLanguage = (preferences.nativeLanguage || "Arabic").trim() || "Arabic";

  await dbRun(
    `
      INSERT INTO user_preferences (user_id, target_language, native_language, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        target_language = excluded.target_language,
        native_language = excluded.native_language,
        updated_at = CURRENT_TIMESTAMP
    `,
    [userId, targetLanguage, nativeLanguage]
  );

  return {
    targetLanguage,
    nativeLanguage
  };
}

async function ensureSessionForUser(userId, transcript, requestedSessionId) {
  if (requestedSessionId) {
    const existing = await dbGet("SELECT id FROM practice_sessions WHERE id = ? AND user_id = ?", [
      requestedSessionId,
      userId
    ]);
    if (existing) {
      return existing.id;
    }
  }

  const title = (transcript || "Practice Session").slice(0, 60);
  const insert = await dbRun(
    "INSERT INTO practice_sessions (user_id, title, created_at, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
    [userId, title || "Practice Session"]
  );

  return insert.lastID;
}

function parseSessionTurnsRoute(url) {
  const match = /^\/api\/sessions\/(\d+)\/turns$/.exec(url || "");
  if (!match) {
    return null;
  }

  return Number(match[1]);
}

function parseJsonList(value) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function toPublicUser(authUser) {
  return {
    id: authUser.id,
    email: authUser.email,
    preferences: authUser.preferences
  };
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
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

async function runProcessWithInput(command, args, inputText) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"]
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

    child.stdin.end(inputText || "");
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

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function parseTutorPayload(raw) {
  if (!raw) {
    return null;
  }

  const direct = safeJsonParse(raw);
  if (direct) {
    return direct;
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  const candidate = raw.slice(firstBrace, lastBrace + 1);
  return safeJsonParse(candidate);
}

function normalizeFeedback(payload) {
  const grammarCorrection = payload?.grammarCorrection || "Great effort. Try one clearer, slightly longer sentence next time.";
  const pronunciationSuggestions = Array.isArray(payload?.pronunciationSuggestions)
    ? payload.pronunciationSuggestions.filter(Boolean).slice(0, 3)
    : [];

  return {
    grammarCorrection,
    pronunciationSuggestions
  };
}

async function generateReply(transcript, preferences = {}) {
  const llmStart = performance.now();

  if (!transcript) {
    throw new Error("transcript is required");
  }

  const targetLanguage = preferences.targetLanguage || "English";
  const nativeLanguage = preferences.nativeLanguage || "Arabic";

  const prompt = [
    "You are a concise language tutor.",
    `Target language: ${targetLanguage}.`,
    `Learner native language: ${nativeLanguage}.`,
    "Return valid JSON with keys: reply, grammarCorrection, pronunciationSuggestions.",
    "pronunciationSuggestions must be a short array of strings.",
    `Learner: ${transcript}`
  ].join("\n");

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false
      })
    });

    if (response.ok) {
      const data = await response.json();
      const parsed = parseTutorPayload(data.response || "");
      const feedback = normalizeFeedback(parsed);
      const llmMs = Math.round(performance.now() - llmStart);
      return {
        reply: parsed?.reply || data.response || "I heard you.",
        feedback,
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
    feedback: {
      grammarCorrection: "Try to include a clear subject + verb + detail in one complete sentence.",
      pronunciationSuggestions: [
        "Slow down slightly at the end of each sentence.",
        "Stress the main content word in your final phrase."
      ]
    },
    timings: { llmMs },
    model: "mock-tutor",
    source: "fallback"
  };
}

async function synthesizeWithPiper(text) {
  if (!PIPER_BIN || !PIPER_MODEL_PATH || !text) {
    return null;
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "bayan-tts-"));
  const outputPath = path.join(workDir, "speech.wav");

  try {
    await runProcessWithInput(
      PIPER_BIN,
      [
        "--model",
        PIPER_MODEL_PATH,
        "--output_file",
        outputPath
      ],
      `${text}\n`
    );

    const wavBuffer = await fs.readFile(outputPath);
    return {
      audioBase64: wavBuffer.toString("base64"),
      mimeType: "audio/wav",
      source: "piper"
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

async function synthesizeSpeech(text) {
  if (!text) {
    throw new Error("text is required");
  }

  try {
    const piperAudio = await synthesizeWithPiper(text);
    if (piperAudio) {
      return piperAudio;
    }
  } catch (error) {
    console.warn(`[bayan-backend] piper TTS failed: ${error.message}`);
  }

  return {
    audioBase64: null,
    mimeType: null,
    source: "fallback"
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST,GET,PUT,OPTIONS"
    });
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/api/auth/register") {
    try {
      const body = await readJsonBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");

      if (!email || !password || password.length < 6) {
        sendJson(res, 400, { error: "email and password (min 6 chars) are required" });
        return;
      }

      const existing = await dbGet("SELECT id FROM users WHERE email = ?", [email]);
      if (existing) {
        sendJson(res, 409, { error: "email already exists" });
        return;
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const created = await dbRun("INSERT INTO users (email, password_hash) VALUES (?, ?)", [
        email,
        passwordHash
      ]);

      const preferences = await upsertPreferences(created.lastID, body.preferences || {});
      const token = await issueAuthSession(created.lastID);

      sendJson(res, 201, {
        token,
        user: {
          id: created.lastID,
          email,
          preferences
        }
      });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/auth/login") {
    try {
      const body = await readJsonBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");

      const user = await dbGet(
        `
          SELECT u.id, u.email, u.password_hash, p.target_language AS targetLanguage, p.native_language AS nativeLanguage
          FROM users u
          LEFT JOIN user_preferences p ON p.user_id = u.id
          WHERE u.email = ?
        `,
        [email]
      );

      if (!user) {
        sendJson(res, 401, { error: "invalid credentials" });
        return;
      }

      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        sendJson(res, 401, { error: "invalid credentials" });
        return;
      }

      const token = await issueAuthSession(user.id);
      sendJson(res, 200, {
        token,
        user: {
          id: user.id,
          email: user.email,
          preferences: {
            targetLanguage: user.targetLanguage || "English",
            nativeLanguage: user.nativeLanguage || "Arabic"
          }
        }
      });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/auth/logout") {
    try {
      const token = buildAuthHeaders(req);
      if (token) {
        await dbRun("DELETE FROM auth_sessions WHERE token = ?", [token]);
      }
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (req.method === "GET" && req.url === "/api/me") {
    try {
      const auth = await requireAuth(req);
      sendJson(res, 200, { user: toPublicUser(auth.user) });
    } catch (error) {
      sendJson(res, 401, { error: error.message });
    }
    return;
  }

  if (req.method === "PUT" && req.url === "/api/preferences") {
    try {
      const auth = await requireAuth(req);
      const body = await readJsonBody(req);
      const preferences = await upsertPreferences(auth.user.id, body.preferences || {});
      sendJson(res, 200, {
        preferences
      });
    } catch (error) {
      sendJson(res, 401, { error: error.message });
    }
    return;
  }

  if (req.method === "GET" && req.url === "/api/sessions") {
    try {
      const auth = await requireAuth(req);
      const sessions = await dbAll(
        `
          SELECT
            s.id,
            s.title,
            s.created_at AS createdAt,
            s.updated_at AS updatedAt,
            COUNT(t.id) AS turnCount
          FROM practice_sessions s
          LEFT JOIN practice_turns t ON t.session_id = s.id
          WHERE s.user_id = ?
          GROUP BY s.id
          ORDER BY datetime(s.updated_at) DESC
        `,
        [auth.user.id]
      );

      sendJson(res, 200, { sessions });
    } catch (error) {
      sendJson(res, 401, { error: error.message });
    }
    return;
  }

  const turnsSessionId = parseSessionTurnsRoute(req.url);
  if (req.method === "GET" && turnsSessionId) {
    try {
      const auth = await requireAuth(req);
      const session = await dbGet("SELECT id, title FROM practice_sessions WHERE id = ? AND user_id = ?", [
        turnsSessionId,
        auth.user.id
      ]);

      if (!session) {
        sendJson(res, 404, { error: "session not found" });
        return;
      }

      const turns = await dbAll(
        `
          SELECT
            id,
            transcript,
            reply,
            grammar_correction AS grammarCorrection,
            pronunciation_suggestions AS pronunciationSuggestions,
            created_at AS createdAt
          FROM practice_turns
          WHERE session_id = ? AND user_id = ?
          ORDER BY id ASC
        `,
        [turnsSessionId, auth.user.id]
      );

      sendJson(res, 200, {
        session,
        turns: turns.map((turn) => ({
          ...turn,
          pronunciationSuggestions: parseJsonList(turn.pronunciationSuggestions)
        }))
      });
    } catch (error) {
      sendJson(res, 401, { error: error.message });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/tts") {
    try {
      const body = await readJsonBody(req);
      const result = await synthesizeSpeech(body.text);
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
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
      const auth = await getAuthUser(req);
      const resolvedPreferences = body.preferences || auth?.user?.preferences || {};
      const result = await generateReply(body.transcript, resolvedPreferences);

      if (auth?.user?.id) {
        if (body.preferences) {
          await upsertPreferences(auth.user.id, body.preferences);
        }

        const sessionId = await ensureSessionForUser(auth.user.id, body.transcript, body.sessionId);
        const insert = await dbRun(
          `
            INSERT INTO practice_turns (
              session_id,
              user_id,
              transcript,
              reply,
              grammar_correction,
              pronunciation_suggestions,
              created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `,
          [
            sessionId,
            auth.user.id,
            body.transcript,
            result.reply,
            result.feedback.grammarCorrection,
            JSON.stringify(result.feedback.pronunciationSuggestions || [])
          ]
        );

        await dbRun("UPDATE practice_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = ?", [sessionId]);

        sendJson(res, 200, {
          ...result,
          sessionId,
          turnId: insert.lastID,
          persisted: true
        });
        return;
      }

      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

async function startServer() {
  await initDatabase();

  server.listen(PORT, () => {
    console.log(`[bayan-backend] listening on http://127.0.0.1:${PORT}`);
    console.log(`[bayan-backend] sqlite db at ${DB_PATH}`);
  });
}

startServer().catch((error) => {
  console.error("[bayan-backend] startup failed", error);
  process.exit(1);
});
