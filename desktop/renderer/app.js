const pttButton = document.getElementById("pttButton");
const statusEl = document.getElementById("status");
const messagesEl = document.getElementById("messages");

const captureMsEl = document.getElementById("captureMs");
const sttMsEl = document.getElementById("sttMs");
const llmMsEl = document.getElementById("llmMs");
const totalMsEl = document.getElementById("totalMs");

let mediaRecorder = null;
let mediaStream = null;
let recordingStart = 0;
let chunks = [];

function setStatus(text) {
  statusEl.textContent = text;
}

function appendMessage(role, text, meta = "") {
  const wrapper = document.createElement("article");
  wrapper.className = `message ${role}`;

  const roleEl = document.createElement("h3");
  roleEl.textContent = role;

  const textEl = document.createElement("p");
  textEl.textContent = text;

  wrapper.appendChild(roleEl);
  wrapper.appendChild(textEl);

  if (meta) {
    const metaEl = document.createElement("small");
    metaEl.textContent = meta;
    wrapper.appendChild(metaEl);
  }

  messagesEl.prepend(wrapper);
}

async function blobToBase64(blob) {
  const buffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const subarray = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...subarray);
  }

  return btoa(binary);
}

async function ensureStream() {
  if (!mediaStream) {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  }

  return mediaStream;
}

async function startRecording() {
  try {
    const stream = await ensureStream();
    chunks = [];
    recordingStart = performance.now();

    mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    });

    mediaRecorder.start();
    setStatus("Recording...");
  } catch (error) {
    setStatus(`Microphone error: ${error.message}`);
  }
}

async function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state !== "recording") {
    return;
  }

  setStatus("Processing...");

  await new Promise((resolve) => {
    mediaRecorder.addEventListener("stop", resolve, { once: true });
    mediaRecorder.stop();
  });

  const captureMs = Math.round(performance.now() - recordingStart);
  captureMsEl.textContent = String(captureMs);

  if (!chunks.length) {
    setStatus("No audio captured");
    return;
  }

  const blob = new Blob(chunks, { type: mediaRecorder.mimeType || "audio/webm" });
  const audioBase64 = await blobToBase64(blob);

  try {
    const result = await window.bayan.processAudio({
      audioBase64,
      mimeType: blob.type
    });

    appendMessage("You", result.transcript);
    appendMessage(
      "Bayan",
      result.reply,
      `${result.model} (${result.source})`
    );

    sttMsEl.textContent = String(result.timings.sttMs || 0);
    llmMsEl.textContent = String(result.timings.llmMs || 0);
    totalMsEl.textContent = String(result.timings.totalMs || 0);
    setStatus("Idle");
  } catch (error) {
    setStatus(`Pipeline error: ${error.message}`);
  }
}

pttButton.addEventListener("mousedown", startRecording);
pttButton.addEventListener("mouseup", stopRecording);
pttButton.addEventListener("mouseleave", stopRecording);
pttButton.addEventListener("touchstart", (event) => {
  event.preventDefault();
  startRecording();
});
pttButton.addEventListener("touchend", (event) => {
  event.preventDefault();
  stopRecording();
});

window.addEventListener("DOMContentLoaded", async () => {
  const config = await window.bayan.getConfig();
  setStatus(`Idle (backend: ${config.backendUrl})`);
});
