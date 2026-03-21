const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { performance } = require("perf_hooks");

const BACKEND_URL = process.env.BAYAN_BACKEND_URL || "http://127.0.0.1:8787";

function createWindow() {
  const window = new BrowserWindow({
    width: 1100,
    height: 760,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.loadFile(path.join(__dirname, "renderer", "index.html"));
}

async function backendRequest(endpoint, { method = "GET", body, token } = {}) {
  const headers = {
    "Content-Type": "application/json"
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${BACKEND_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `${method} ${endpoint} failed`);
  }

  return payload;
}

ipcMain.handle("auth:register", async (_event, payload) => {
  return backendRequest("/api/auth/register", {
    method: "POST",
    body: payload
  });
});

ipcMain.handle("auth:login", async (_event, payload) => {
  return backendRequest("/api/auth/login", {
    method: "POST",
    body: payload
  });
});

ipcMain.handle("auth:logout", async (_event, payload) => {
  return backendRequest("/api/auth/logout", {
    method: "POST",
    token: payload?.token
  });
});

ipcMain.handle("auth:me", async (_event, payload) => {
  return backendRequest("/api/me", {
    method: "GET",
    token: payload?.token
  });
});

ipcMain.handle("profile:update-preferences", async (_event, payload) => {
  return backendRequest("/api/preferences", {
    method: "PUT",
    token: payload?.token,
    body: {
      preferences: payload?.preferences || {}
    }
  });
});

ipcMain.handle("sessions:list", async (_event, payload) => {
  return backendRequest("/api/sessions", {
    method: "GET",
    token: payload?.token
  });
});

ipcMain.handle("sessions:get-turns", async (_event, payload) => {
  const sessionId = Number(payload?.sessionId);
  if (!sessionId) {
    throw new Error("sessionId is required");
  }

  return backendRequest(`/api/sessions/${sessionId}/turns`, {
    method: "GET",
    token: payload?.token
  });
});

ipcMain.handle("assessment:start", async (_event, payload) => {
  return backendRequest("/api/assessment/start", {
    method: "POST",
    token: payload?.token,
    body: {
      preferences: payload?.preferences || {}
    }
  });
});

ipcMain.handle("assessment:latest", async (_event, payload) => {
  return backendRequest("/api/assessment/latest", {
    method: "GET",
    token: payload?.token
  });
});

ipcMain.handle("system:validation", async () => {
  return backendRequest("/api/validation", {
    method: "GET"
  });
});

ipcMain.handle("progress:summary", async (_event, payload) => {
  return backendRequest("/api/progress", {
    method: "GET",
    token: payload?.token
  });
});

ipcMain.handle("assessment:process-audio", async (_event, payload) => {
  const totalStart = performance.now();

  const sttResponse = await fetch(`${BACKEND_URL}/api/stt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audioBase64: payload.audioBase64,
      mimeType: payload.mimeType
    })
  });

  if (!sttResponse.ok) {
    const sttError = await sttResponse.json().catch(() => ({ error: "stt_failed" }));
    throw new Error(sttError.error || "STT request failed");
  }

  const sttResult = await sttResponse.json();

  const answerResponse = await fetch(`${BACKEND_URL}/api/assessment/answer`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(payload?.token ? { Authorization: `Bearer ${payload.token}` } : {})
    },
    body: JSON.stringify({
      assessmentSessionId: payload.assessmentSessionId,
      transcript: sttResult.transcript
    })
  });

  if (!answerResponse.ok) {
    const answerError = await answerResponse.json().catch(() => ({ error: "assessment_answer_failed" }));
    throw new Error(answerError.error || "Assessment answer request failed");
  }

  const answerResult = await answerResponse.json();

  let ttsResult = {
    audioBase64: null,
    mimeType: null,
    source: "not-requested"
  };

  try {
    const ttsResponse = await fetch(`${BACKEND_URL}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: answerResult.reply })
    });

    if (ttsResponse.ok) {
      ttsResult = await ttsResponse.json();
    }
  } catch (error) {
    ttsResult = {
      audioBase64: null,
      mimeType: null,
      source: "error"
    };
  }

  return {
    transcript: sttResult.transcript,
    reply: answerResult.reply,
    feedback: answerResult.feedback || {
      grammarCorrection: "No structured feedback was returned.",
      pronunciationSuggestions: []
    },
    assessment: answerResult.assessment,
    tts: ttsResult,
    timings: {
      sttMs: sttResult.timings?.sttMs || 0,
      llmMs: answerResult.timings?.llmMs || 0,
      totalMs: Math.round(performance.now() - totalStart)
    },
    model: answerResult.model,
    source: answerResult.source || "unknown"
  };
});

ipcMain.handle("pipeline:process-audio", async (_event, payload) => {
  const totalStart = performance.now();
  const preferences = payload.preferences || {};
  const token = payload.token;

  const sttResponse = await fetch(`${BACKEND_URL}/api/stt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audioBase64: payload.audioBase64,
      mimeType: payload.mimeType
    })
  });

  if (!sttResponse.ok) {
    const sttError = await sttResponse.json().catch(() => ({ error: "stt_failed" }));
    throw new Error(sttError.error || "STT request failed");
  }

  const sttResult = await sttResponse.json();

  const chatResponse = await fetch(`${BACKEND_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      transcript: sttResult.transcript,
      preferences,
      sessionId: payload.sessionId || null
    })
  });

  if (!chatResponse.ok) {
    const chatError = await chatResponse.json().catch(() => ({ error: "chat_failed" }));
    throw new Error(chatError.error || "Chat request failed");
  }

  const chatResult = await chatResponse.json();

  let ttsResult = {
    audioBase64: null,
    mimeType: null,
    source: "not-requested"
  };

  try {
    const ttsResponse = await fetch(`${BACKEND_URL}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: chatResult.reply })
    });

    if (ttsResponse.ok) {
      ttsResult = await ttsResponse.json();
    }
  } catch (error) {
    ttsResult = {
      audioBase64: null,
      mimeType: null,
      source: "error"
    };
  }

  return {
    transcript: sttResult.transcript,
    reply: chatResult.reply,
    feedback: chatResult.feedback || {
      grammarCorrection: "No structured feedback was returned.",
      pronunciationSuggestions: []
    },
    tts: ttsResult,
    timings: {
      sttMs: sttResult.timings?.sttMs || 0,
      llmMs: chatResult.timings?.llmMs || 0,
      totalMs: Math.round(performance.now() - totalStart)
    },
    model: chatResult.model,
    source: chatResult.source || "unknown",
    sessionId: chatResult.sessionId || payload.sessionId || null,
    turnId: chatResult.turnId || null,
    persisted: Boolean(chatResult.persisted)
  };
});

ipcMain.handle("pipeline:get-config", () => ({
  backendUrl: BACKEND_URL
}));

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
