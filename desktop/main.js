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

ipcMain.handle("pipeline:process-audio", async (_event, payload) => {
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

  const chatResponse = await fetch(`${BACKEND_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transcript: sttResult.transcript
    })
  });

  if (!chatResponse.ok) {
    const chatError = await chatResponse.json().catch(() => ({ error: "chat_failed" }));
    throw new Error(chatError.error || "Chat request failed");
  }

  const chatResult = await chatResponse.json();

  return {
    transcript: sttResult.transcript,
    reply: chatResult.reply,
    timings: {
      sttMs: sttResult.timings?.sttMs || 0,
      llmMs: chatResult.timings?.llmMs || 0,
      totalMs: Math.round(performance.now() - totalStart)
    },
    model: chatResult.model,
    source: chatResult.source || "unknown"
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
