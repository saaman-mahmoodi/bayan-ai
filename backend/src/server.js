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
const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const TRACKED_PROGRESS_METRICS = [
  "assessment.overall",
  "assessment.speaking",
  "assessment.grammar",
  "assessment.vocabulary"
];
const ASSESSMENT_PROMPTS = [
  "Introduce yourself and describe your daily routine in your target language.",
  "Tell a short story about a challenge you faced recently and how you handled it.",
  "Explain your opinion on why learning languages is valuable for your future."
];

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

function buildRecurringIssueToken(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function diffDays(a, b) {
  const utcA = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const utcB = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((utcA - utcB) / 86400000);
}

function withTimeout(promise, timeoutMs, timeoutMessage) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

async function checkFilePathAvailability(filePath) {
  if (!filePath) {
    return false;
  }

  try {
    await fs.access(filePath);
    return true;
  } catch (_error) {
    return false;
  }
}

async function runSystemValidation() {
  const checks = [];

  const whisperBinAvailable = await checkFilePathAvailability(WHISPER_CPP_BIN);
  const whisperModelAvailable = await checkFilePathAvailability(WHISPER_MODEL_PATH);
  const piperBinAvailable = await checkFilePathAvailability(PIPER_BIN);
  const piperModelAvailable = await checkFilePathAvailability(PIPER_MODEL_PATH);
  const ffmpegAvailable = await checkFilePathAvailability(FFMPEG_BIN);

  checks.push({
    key: "whisper.bin",
    ok: Boolean(WHISPER_CPP_BIN && whisperBinAvailable),
    required: false,
    message: WHISPER_CPP_BIN
      ? whisperBinAvailable
        ? "Whisper binary found."
        : "Whisper binary path is configured but not accessible."
      : "Whisper binary not configured; STT will use fallback transcript."
  });

  checks.push({
    key: "whisper.model",
    ok: Boolean(WHISPER_MODEL_PATH && whisperModelAvailable),
    required: false,
    message: WHISPER_MODEL_PATH
      ? whisperModelAvailable
        ? "Whisper model file found."
        : "Whisper model path is configured but not accessible."
      : "Whisper model not configured; STT will use fallback transcript."
  });

  checks.push({
    key: "ffmpeg.bin",
    ok: Boolean(FFMPEG_BIN && ffmpegAvailable),
    required: false,
    message: FFMPEG_BIN
      ? ffmpegAvailable
        ? "FFmpeg binary found."
        : "FFmpeg path is configured but not accessible."
      : "FFmpeg not configured; non-wav microphone formats may fail with whisper.cpp."
  });

  checks.push({
    key: "piper.bin",
    ok: Boolean(PIPER_BIN && piperBinAvailable),
    required: false,
    message: PIPER_BIN
      ? piperBinAvailable
        ? "Piper binary found."
        : "Piper binary path is configured but not accessible."
      : "Piper binary not configured; TTS will return silent fallback."
  });

  checks.push({
    key: "piper.model",
    ok: Boolean(PIPER_MODEL_PATH && piperModelAvailable),
    required: false,
    message: PIPER_MODEL_PATH
      ? piperModelAvailable
        ? "Piper model file found."
        : "Piper model path is configured but not accessible."
      : "Piper model not configured; TTS will return silent fallback."
  });

  let ollamaReachable = false;
  try {
    const ollamaProbe = await withTimeout(
      fetch(`${OLLAMA_BASE_URL}/api/tags`, { method: "GET" }),
      1500,
      "Ollama probe timed out"
    );
    ollamaReachable = ollamaProbe.ok;
  } catch (_error) {
    ollamaReachable = false;
  }

  checks.push({
    key: "ollama.reachable",
    ok: ollamaReachable,
    required: false,
    message: ollamaReachable
      ? "Ollama service is reachable."
      : "Ollama is unreachable; chat and assessment scoring will use fallback logic."
  });

  const warnings = checks.filter((check) => !check.ok).map((check) => check.message);

  return {
    ok: warnings.length === 0,
    checkedAt: new Date().toISOString(),
    checks,
    warnings
  };
}

async function buildProgressSummary(userId) {
  const snapshots = await dbAll(
    `
      SELECT
        metric_key AS metricKey,
        metric_value AS metricValue,
        recorded_at AS recordedAt
      FROM progress_snapshots
      WHERE user_id = ?
      ORDER BY datetime(recorded_at) DESC, id DESC
      LIMIT 400
    `,
    [userId]
  );

  const trendsByMetric = new Map();
  for (const key of TRACKED_PROGRESS_METRICS) {
    trendsByMetric.set(key, new Map());
  }

  for (const row of snapshots) {
    if (!trendsByMetric.has(row.metricKey)) {
      continue;
    }

    const day = String(row.recordedAt || "").slice(0, 10);
    if (!day) {
      continue;
    }

    const metricBucket = trendsByMetric.get(row.metricKey);
    if (!metricBucket.has(day)) {
      metricBucket.set(day, []);
    }
    metricBucket.get(day).push(Number(row.metricValue || 0));
  }

  const trends = TRACKED_PROGRESS_METRICS.map((metricKey) => {
    const dayMap = trendsByMetric.get(metricKey);
    const points = Array.from(dayMap.entries())
      .map(([day, values]) => {
        const total = values.reduce((sum, value) => sum + value, 0);
        const average = values.length ? total / values.length : 0;
        return {
          day,
          value: Math.round(average * 10) / 10
        };
      })
      .sort((a, b) => a.day.localeCompare(b.day))
      .slice(-14);

    return {
      metricKey,
      points
    };
  });

  const activityRows = await dbAll(
    `
      SELECT day
      FROM (
        SELECT date(created_at) AS day
        FROM practice_turns
        WHERE user_id = ?
        UNION
        SELECT date(created_at) AS day
        FROM assessment_turns
        WHERE user_id = ?
      )
      WHERE day IS NOT NULL
      ORDER BY day DESC
    `,
    [userId, userId]
  );

  const activityDays = activityRows.map((row) => row.day);
  let streakDays = 0;
  let lastActiveDay = activityDays[0] || null;

  if (lastActiveDay) {
    const today = new Date();
    const lastActiveDate = new Date(`${lastActiveDay}T00:00:00.000Z`);
    const ageInDays = diffDays(today, lastActiveDate);

    if (ageInDays <= 1) {
      streakDays = 1;
      let expectedDate = lastActiveDate;

      for (let index = 1; index < activityDays.length; index += 1) {
        const candidate = new Date(`${activityDays[index]}T00:00:00.000Z`);
        if (diffDays(expectedDate, candidate) === 1) {
          streakDays += 1;
          expectedDate = candidate;
        } else {
          break;
        }
      }
    }
  }

  const recurringSourceRows = await dbAll(
    `
      SELECT grammar_correction AS grammarCorrection, pronunciation_suggestions AS pronunciationSuggestions
      FROM practice_turns
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT 120
    `,
    [userId]
  );

  const issueCounts = new Map();
  for (const row of recurringSourceRows) {
    const grammar = String(row.grammarCorrection || "").trim();
    if (grammar) {
      const token = `grammar:${buildRecurringIssueToken(grammar)}`;
      if (token.length > 8) {
        const existing = issueCounts.get(token) || { type: "grammar", text: grammar, count: 0 };
        existing.count += 1;
        issueCounts.set(token, existing);
      }
    }

    const suggestions = parseJsonList(row.pronunciationSuggestions);
    for (const suggestion of suggestions) {
      const text = String(suggestion || "").trim();
      if (!text) {
        continue;
      }
      const token = `pronunciation:${buildRecurringIssueToken(text)}`;
      const existing = issueCounts.get(token) || { type: "pronunciation", text, count: 0 };
      existing.count += 1;
      issueCounts.set(token, existing);
    }
  }

  const recurringIssues = Array.from(issueCounts.values())
    .filter((issue) => issue.count > 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    streak: {
      currentDays: streakDays,
      lastActiveDay
    },
    trends,
    recurringIssues,
    totals: {
      snapshotCount: snapshots.length,
      activityDays: activityDays.length
    }
  };
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

function parseJsonObject(value) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch (error) {
    return null;
  }
}

function clampScore(value) {
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(asNumber)));
}

function scoreToCefrLevel(score) {
  if (score >= 85) {
    return "C2";
  }
  if (score >= 70) {
    return "C1";
  }
  if (score >= 55) {
    return "B2";
  }
  if (score >= 40) {
    return "B1";
  }
  if (score >= 25) {
    return "A2";
  }
  return "A1";
}

function tokenizeWords(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-zA-Z\s']/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function buildRuleBasedAssessment(turns = []) {
  const transcripts = turns.map((turn) => String(turn.transcript || "")).filter(Boolean);
  const allWords = transcripts.flatMap((text) => tokenizeWords(text));
  const totalWords = allWords.length;
  const uniqueWords = new Set(allWords).size;
  const averageWordsPerTurn = transcripts.length ? totalWords / transcripts.length : 0;
  const longTurnCount = transcripts.filter((text) => tokenizeWords(text).length >= 14).length;

  const speakingScore = clampScore((averageWordsPerTurn / 40) * 100);
  const grammarScore = clampScore((transcripts.length ? longTurnCount / transcripts.length : 0) * 70 + 20);
  const vocabularyDensity = totalWords ? uniqueWords / totalWords : 0;
  const vocabularyScore = clampScore(vocabularyDensity * 130);
  const overallScore = clampScore(speakingScore * 0.4 + grammarScore * 0.35 + vocabularyScore * 0.25);

  return {
    cefrLevel: scoreToCefrLevel(overallScore),
    overallScore,
    speakingScore,
    grammarScore,
    vocabularyScore,
    reasoning: {
      source: "rules",
      totalWords,
      uniqueWords,
      averageWordsPerTurn: Math.round(averageWordsPerTurn * 10) / 10,
      longTurnCount
    }
  };
}

function normalizeAssessmentPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const speakingScore = clampScore(payload.speakingScore);
  const grammarScore = clampScore(payload.grammarScore);
  const vocabularyScore = clampScore(payload.vocabularyScore);
  const overallScore = clampScore(payload.overallScore);
  const cefrLevel = CEFR_LEVELS.includes(payload.cefrLevel) ? payload.cefrLevel : scoreToCefrLevel(overallScore);

  return {
    cefrLevel,
    overallScore,
    speakingScore,
    grammarScore,
    vocabularyScore,
    reasoning: {
      source: "llm-rubric",
      notes: String(payload.notes || "").slice(0, 400)
    }
  };
}

async function buildLlmAssessment(turns = [], preferences = {}) {
  if (!turns.length) {
    return null;
  }

  const targetLanguage = preferences.targetLanguage || "English";
  const nativeLanguage = preferences.nativeLanguage || "Arabic";
  const transcriptBlock = turns
    .map((turn, index) => `${index + 1}. Prompt: ${turn.prompt}\n   Answer: ${turn.transcript}`)
    .join("\n");

  const prompt = [
    "You are a strict CEFR assessment evaluator.",
    `Target language: ${targetLanguage}. Learner native language: ${nativeLanguage}.`,
    "Given the prompts and learner answers, return ONLY valid JSON with keys:",
    "cefrLevel, overallScore, speakingScore, grammarScore, vocabularyScore, notes.",
    "cefrLevel must be one of A1,A2,B1,B2,C1,C2.",
    "All scores must be integers from 0 to 100.",
    "Assessment transcript:",
    transcriptBlock
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

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const parsed = parseTutorPayload(data.response || "");
    return normalizeAssessmentPayload(parsed);
  } catch (error) {
    return null;
  }
}

async function scoreAssessment(turns = [], preferences = {}) {
  const rules = buildRuleBasedAssessment(turns);
  const llm = await buildLlmAssessment(turns, preferences);

  if (!llm) {
    return rules;
  }

  const speakingScore = clampScore(rules.speakingScore * 0.4 + llm.speakingScore * 0.6);
  const grammarScore = clampScore(rules.grammarScore * 0.4 + llm.grammarScore * 0.6);
  const vocabularyScore = clampScore(rules.vocabularyScore * 0.4 + llm.vocabularyScore * 0.6);
  const overallScore = clampScore(speakingScore * 0.4 + grammarScore * 0.35 + vocabularyScore * 0.25);

  return {
    cefrLevel: scoreToCefrLevel(overallScore),
    overallScore,
    speakingScore,
    grammarScore,
    vocabularyScore,
    reasoning: {
      source: "hybrid",
      llm,
      rules
    }
  };
}

async function getLatestAssessmentForUser(userId) {
  const result = await dbGet(
    `
      SELECT
        id,
        assessment_session_id AS assessmentSessionId,
        cefr_level AS cefrLevel,
        overall_score AS overallScore,
        speaking_score AS speakingScore,
        grammar_score AS grammarScore,
        vocabulary_score AS vocabularyScore,
        reasoning,
        created_at AS createdAt
      FROM assessment_results
      WHERE user_id = ?
      ORDER BY datetime(created_at) DESC, id DESC
      LIMIT 1
    `,
    [userId]
  );

  if (!result) {
    return null;
  }

  return {
    ...result,
    reasoning: parseJsonObject(result.reasoning)
  };
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

  await dbRun(`
    CREATE TABLE IF NOT EXISTS assessment_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      target_language TEXT NOT NULL DEFAULT 'English',
      native_language TEXT NOT NULL DEFAULT 'Arabic',
      status TEXT NOT NULL DEFAULT 'active',
      current_prompt_index INTEGER NOT NULL DEFAULT 0,
      prompt_set TEXT NOT NULL,
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS assessment_turns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assessment_session_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      prompt TEXT NOT NULL,
      transcript TEXT NOT NULL,
      reply TEXT NOT NULL,
      grammar_correction TEXT NOT NULL,
      pronunciation_suggestions TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(assessment_session_id) REFERENCES assessment_sessions(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS assessment_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      assessment_session_id INTEGER NOT NULL,
      cefr_level TEXT NOT NULL,
      overall_score REAL NOT NULL,
      speaking_score REAL NOT NULL,
      grammar_score REAL NOT NULL,
      vocabulary_score REAL NOT NULL,
      reasoning TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(assessment_session_id) REFERENCES assessment_sessions(id)
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

  if (req.method === "POST" && req.url === "/api/assessment/start") {
    try {
      const auth = await requireAuth(req);
      const body = await readJsonBody(req);
      const preferences = await upsertPreferences(auth.user.id, body.preferences || auth.user.preferences || {});
      const promptSet = JSON.stringify(ASSESSMENT_PROMPTS);
      const created = await dbRun(
        `
          INSERT INTO assessment_sessions (
            user_id,
            target_language,
            native_language,
            status,
            current_prompt_index,
            prompt_set,
            started_at
          )
          VALUES (?, ?, ?, 'active', 0, ?, CURRENT_TIMESTAMP)
        `,
        [auth.user.id, preferences.targetLanguage, preferences.nativeLanguage, promptSet]
      );

      sendJson(res, 201, {
        assessmentSessionId: created.lastID,
        currentPromptIndex: 0,
        totalPrompts: ASSESSMENT_PROMPTS.length,
        currentPrompt: ASSESSMENT_PROMPTS[0]
      });
    } catch (error) {
      sendJson(res, 401, { error: error.message });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/api/assessment/answer") {
    try {
      const auth = await requireAuth(req);
      const body = await readJsonBody(req);
      const assessmentSessionId = Number(body.assessmentSessionId || 0);
      if (!assessmentSessionId) {
        sendJson(res, 400, { error: "assessmentSessionId is required" });
        return;
      }

      const session = await dbGet(
        `
          SELECT
            id,
            user_id AS userId,
            target_language AS targetLanguage,
            native_language AS nativeLanguage,
            status,
            current_prompt_index AS currentPromptIndex,
            prompt_set AS promptSet
          FROM assessment_sessions
          WHERE id = ? AND user_id = ?
        `,
        [assessmentSessionId, auth.user.id]
      );

      if (!session) {
        sendJson(res, 404, { error: "assessment session not found" });
        return;
      }

      if (session.status !== "active") {
        sendJson(res, 400, { error: "assessment session is not active" });
        return;
      }

      const transcript = String(body.transcript || "").trim();
      if (!transcript) {
        sendJson(res, 400, { error: "transcript is required" });
        return;
      }

      const prompts = parseJsonList(session.promptSet);
      const currentPrompt = prompts[session.currentPromptIndex];
      if (!currentPrompt) {
        sendJson(res, 400, { error: "assessment prompt set is invalid" });
        return;
      }

      const resolvedPreferences = {
        targetLanguage: session.targetLanguage,
        nativeLanguage: session.nativeLanguage
      };
      const result = await generateReply(transcript, resolvedPreferences);

      await dbRun(
        `
          INSERT INTO assessment_turns (
            assessment_session_id,
            user_id,
            prompt,
            transcript,
            reply,
            grammar_correction,
            pronunciation_suggestions,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `,
        [
          assessmentSessionId,
          auth.user.id,
          currentPrompt,
          transcript,
          result.reply,
          result.feedback.grammarCorrection,
          JSON.stringify(result.feedback.pronunciationSuggestions || [])
        ]
      );

      const nextPromptIndex = session.currentPromptIndex + 1;
      const totalPrompts = prompts.length;

      if (nextPromptIndex < totalPrompts) {
        await dbRun(
          "UPDATE assessment_sessions SET current_prompt_index = ? WHERE id = ?",
          [nextPromptIndex, assessmentSessionId]
        );

        sendJson(res, 200, {
          ...result,
          assessment: {
            assessmentSessionId,
            completed: false,
            currentPromptIndex: nextPromptIndex,
            totalPrompts,
            currentPrompt: prompts[nextPromptIndex]
          }
        });
        return;
      }

      const turns = await dbAll(
        `
          SELECT prompt, transcript
          FROM assessment_turns
          WHERE assessment_session_id = ? AND user_id = ?
          ORDER BY id ASC
        `,
        [assessmentSessionId, auth.user.id]
      );

      const assessmentResult = await scoreAssessment(turns, resolvedPreferences);
      const createdAssessmentResult = await dbRun(
        `
          INSERT INTO assessment_results (
            user_id,
            assessment_session_id,
            cefr_level,
            overall_score,
            speaking_score,
            grammar_score,
            vocabulary_score,
            reasoning,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `,
        [
          auth.user.id,
          assessmentSessionId,
          assessmentResult.cefrLevel,
          assessmentResult.overallScore,
          assessmentResult.speakingScore,
          assessmentResult.grammarScore,
          assessmentResult.vocabularyScore,
          JSON.stringify(assessmentResult.reasoning || null)
        ]
      );

      await dbRun(
        "UPDATE assessment_sessions SET status = 'completed', current_prompt_index = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
        [nextPromptIndex, assessmentSessionId]
      );

      await dbRun(
        "INSERT INTO progress_snapshots (user_id, metric_key, metric_value, recorded_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
        [auth.user.id, "assessment.overall", assessmentResult.overallScore]
      );
      await dbRun(
        "INSERT INTO progress_snapshots (user_id, metric_key, metric_value, recorded_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
        [auth.user.id, "assessment.speaking", assessmentResult.speakingScore]
      );
      await dbRun(
        "INSERT INTO progress_snapshots (user_id, metric_key, metric_value, recorded_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
        [auth.user.id, "assessment.grammar", assessmentResult.grammarScore]
      );
      await dbRun(
        "INSERT INTO progress_snapshots (user_id, metric_key, metric_value, recorded_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
        [auth.user.id, "assessment.vocabulary", assessmentResult.vocabularyScore]
      );

      sendJson(res, 200, {
        ...result,
        assessment: {
          id: createdAssessmentResult.lastID,
          assessmentSessionId,
          completed: true,
          result: {
            cefrLevel: assessmentResult.cefrLevel,
            overallScore: assessmentResult.overallScore,
            speakingScore: assessmentResult.speakingScore,
            grammarScore: assessmentResult.grammarScore,
            vocabularyScore: assessmentResult.vocabularyScore,
            createdAt: new Date().toISOString()
          }
        }
      });
    } catch (error) {
      sendJson(res, 401, { error: error.message });
    }
    return;
  }

  if (req.method === "GET" && req.url === "/api/assessment/latest") {
    try {
      const auth = await requireAuth(req);
      const latest = await getLatestAssessmentForUser(auth.user.id);
      sendJson(res, 200, { assessment: latest });
    } catch (error) {
      sendJson(res, 401, { error: error.message });
    }
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

  if (req.method === "GET" && req.url === "/api/validation") {
    try {
      const validation = await runSystemValidation();
      sendJson(res, 200, validation);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (req.method === "GET" && req.url === "/api/progress") {
    try {
      const auth = await requireAuth(req);
      const progress = await buildProgressSummary(auth.user.id);
      sendJson(res, 200, progress);
    } catch (error) {
      sendJson(res, 401, { error: error.message });
    }
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

async function startServer() {
  await initDatabase();
  console.log(`[bayan-backend] sqlite db at ${DB_PATH}`);

  const startupValidation = await runSystemValidation();
  if (startupValidation.warnings.length) {
    for (const warning of startupValidation.warnings) {
      console.warn(`[bayan-backend] startup validation: ${warning}`);
    }
  }

  server.listen(PORT, () => {
    console.log(`[bayan-backend] listening on http://127.0.0.1:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("[bayan-backend] startup failed", error);
  process.exit(1);
});
