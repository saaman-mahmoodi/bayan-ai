const pttButton = document.getElementById("pttButton");
const statusEl = document.getElementById("status");
const messagesEl = document.getElementById("messages");
const loginViewEl = document.getElementById("loginView");
const appShellEl = document.getElementById("appShell");
const voiceStageEl = document.getElementById("voiceStage");
const waveformEl = document.getElementById("waveform");
const pageTitleEl = document.getElementById("pageTitle");
const languageSummaryEl = document.getElementById("languageSummary");
const userEmailEl = document.getElementById("userEmail");
const userAvatarEl = document.getElementById("userAvatar");
const sidebarToggleEl = document.getElementById("sidebarToggle");
const topSettingsButton = document.getElementById("topSettingsButton");
const authStatusEl = document.getElementById("authStatus");
const authForm = document.getElementById("authForm");
const authEmailEl = document.getElementById("authEmail");
const authPasswordEl = document.getElementById("authPassword");
const loginButton = document.getElementById("loginButton");
const registerButton = document.getElementById("registerButton");
const logoutButton = document.getElementById("logoutButton");
const sessionListEl = document.getElementById("sessionList");
const preferencesForm = document.getElementById("preferencesForm");
const targetLanguageEl = document.getElementById("targetLanguage");
const nativeLanguageEl = document.getElementById("nativeLanguage");
const grammarCorrectionEl = document.getElementById("grammarCorrection");
const pronunciationSuggestionsEl = document.getElementById("pronunciationSuggestions");
const assessmentStatusEl = document.getElementById("assessmentStatus");
const startAssessmentButton = document.getElementById("startAssessmentButton");
const assessmentPromptEl = document.getElementById("assessmentPrompt");
const assessmentSummaryEl = document.getElementById("assessmentSummary");
const assessmentSpeakingEl = document.getElementById("assessmentSpeaking");
const assessmentGrammarEl = document.getElementById("assessmentGrammar");
const assessmentVocabularyEl = document.getElementById("assessmentVocabulary");
const systemStatusEl = document.getElementById("systemStatus");
const systemChecksEl = document.getElementById("systemChecks");
const progressStatusEl = document.getElementById("progressStatus");
const streakCurrentEl = document.getElementById("streakCurrent");
const lastActiveDayEl = document.getElementById("lastActiveDay");
const progressTrendsEl = document.getElementById("progressTrends");
const recurringIssuesEl = document.getElementById("recurringIssues");

const captureMsEl = document.getElementById("captureMs");
const sttMsEl = document.getElementById("sttMs");
const llmMsEl = document.getElementById("llmMs");
const totalMsEl = document.getElementById("totalMs");
const navButtons = Array.from(document.querySelectorAll(".navButton"));
const panels = Array.from(document.querySelectorAll(".panel"));
const waveBars = Array.from(document.querySelectorAll(".waveBar"));

let mediaRecorder = null;
let mediaStream = null;
let recordingStart = 0;
let chunks = [];
let activeToken = "";
let currentSessionId = null;
let activeAssessmentSessionId = null;
let audioContext = null;
let analyserNode = null;
let sourceNode = null;
let waveformFrame = 0;
let activePanel = "practice";
let sidebarPinned = window.innerWidth >= 1280;
let sidebarOpen = false;

const PREFERENCES_STORAGE_KEY = "bayan.preferences.v1";
const AUTH_STORAGE_KEY = "bayan.auth.v1";
const PANEL_TITLES = {
  practice: "Practice",
  progress: "Progress",
  settings: "Settings"
};

function syncSidebarState() {
  const isMobile = window.innerWidth <= 820;
  const shouldExpand = !isMobile && sidebarPinned;
  const shouldOpen = isMobile && sidebarOpen;

  appShellEl.classList.toggle("sidebar-expanded", shouldExpand);
  appShellEl.classList.toggle("sidebar-open", shouldOpen);
  document.body.classList.toggle("sidebar-open", shouldOpen);

  if (sidebarToggleEl) {
    sidebarToggleEl.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
    sidebarToggleEl.textContent = shouldOpen ? "✕" : "☰";
  }
}

function closeSidebarMenu() {
  sidebarOpen = false;
  syncSidebarState();
}

function handleResponsiveLayout() {
  const width = window.innerWidth;
  if (width <= 820) {
    sidebarOpen = false;
  } else if (width < 1280) {
    sidebarPinned = false;
    sidebarOpen = false;
  }

  if (width >= 1280 && !sidebarOpen) {
    sidebarPinned = true;
  }

  syncSidebarState();
}

function setVoiceState(state) {
  voiceStageEl.dataset.voiceState = state;
}

function stopWaveformAnimation() {
  if (waveformFrame) {
    cancelAnimationFrame(waveformFrame);
    waveformFrame = 0;
  }

  for (const [index, bar] of waveBars.entries()) {
    bar.style.transform = `scaleY(${0.55 + index * 0.04})`;
  }
}

function startWaveformAnimation() {
  stopWaveformAnimation();

  const tick = () => {
    let intensity = 0.22;

    if (analyserNode) {
      const data = new Uint8Array(analyserNode.frequencyBinCount);
      analyserNode.getByteFrequencyData(data);
      const sum = data.reduce((total, value) => total + value, 0);
      intensity = Math.min(1, sum / Math.max(1, data.length * 128));
    } else if (voiceStageEl.dataset.voiceState !== "idle") {
      intensity = 0.38 + Math.abs(Math.sin(performance.now() / 220)) * 0.25;
    }

    waveBars.forEach((bar, index) => {
      const phase = performance.now() / 220 + index * 0.6;
      const scale = 0.65 + intensity * 2.1 + Math.abs(Math.sin(phase)) * 0.65;
      bar.style.transform = `scaleY(${scale.toFixed(2)})`;
    });

    if (voiceStageEl.dataset.voiceState === "listening" || voiceStageEl.dataset.voiceState === "processing") {
      waveformFrame = requestAnimationFrame(tick);
    } else {
      waveformFrame = 0;
    }
  };

  waveformFrame = requestAnimationFrame(tick);
}

function updateShellVisibility() {
  const authenticated = Boolean(activeToken);
  loginViewEl.classList.toggle("hidden", authenticated);
  appShellEl.classList.toggle("hidden", !authenticated);
}

function setActivePanel(panelName) {
  activePanel = panelName;
  pageTitleEl.textContent = PANEL_TITLES[panelName] || "Practice";
  closeSidebarMenu();

  for (const button of navButtons) {
    button.classList.toggle("active", button.dataset.panel === panelName);
  }

  for (const panel of panels) {
    panel.classList.toggle("active", panel.dataset.panel === panelName);
  }
}

function syncProfileUI(user = null) {
  const email = user?.email || "Signed out";
  userEmailEl.textContent = email;
  userAvatarEl.textContent = user?.email ? user.email[0].toUpperCase() : "B";
}

function syncLanguageSummary(preferences) {
  languageSummaryEl.textContent = `${preferences.targetLanguage} → ${preferences.nativeLanguage}`;
}

function setAuthStatus(text) {
  authStatusEl.textContent = text;
}

function setAuthState({ token = "", user = null } = {}) {
  activeToken = token;
  updateShellVisibility();
  syncProfileUI(user);

  if (!token || !user) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setAuthStatus("Signed out");
    setActivePanel("practice");
    return;
  }

  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token, user }));
  setAuthStatus(`Signed in as ${user.email}`);
}

function loadAuthState() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return { token: "", user: null };
    }

    const parsed = JSON.parse(raw);
    if (!parsed?.token || !parsed?.user) {
      return { token: "", user: null };
    }

    return {
      token: String(parsed.token),
      user: parsed.user
    };
  } catch (error) {
    return { token: "", user: null };
  }
}

function setStatus(text) {
  statusEl.textContent = text;
}

function setAssessmentStatus(text) {
  assessmentStatusEl.textContent = text;
}

function setSystemStatus(text) {
  systemStatusEl.textContent = text;
}

function setProgressStatus(text) {
  progressStatusEl.textContent = text;
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

function loadPreferences() {
  try {
    const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) {
      return {
        targetLanguage: targetLanguageEl.value || "English",
        nativeLanguage: nativeLanguageEl.value || "Arabic"
      };
    }

    const parsed = JSON.parse(raw);
    return {
      targetLanguage: parsed.targetLanguage || "English",
      nativeLanguage: parsed.nativeLanguage || "Arabic"
    };
  } catch (error) {
    return {
      targetLanguage: "English",
      nativeLanguage: "Arabic"
    };
  }
}

function savePreferences(preferences) {
  localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
}

function getPreferencesFromForm() {
  return {
    targetLanguage: (targetLanguageEl.value || "English").trim() || "English",
    nativeLanguage: (nativeLanguageEl.value || "Arabic").trim() || "Arabic"
  };
}

function applyPreferencesToForm(preferences) {
  targetLanguageEl.value = preferences.targetLanguage;
  nativeLanguageEl.value = preferences.nativeLanguage;
  syncLanguageSummary(preferences);
}

function clearMessages() {
  messagesEl.innerHTML = "";
}

function updateAssessmentPrompt(text) {
  assessmentPromptEl.textContent = text || "No active assessment.";
}

function updateAssessmentResultCard(result) {
  if (!result) {
    assessmentSummaryEl.textContent = "No assessment completed yet.";
    assessmentSpeakingEl.textContent = "-";
    assessmentGrammarEl.textContent = "-";
    assessmentVocabularyEl.textContent = "-";
    return;
  }

  assessmentSummaryEl.textContent = `CEFR ${result.cefrLevel} (overall ${result.overallScore})`;
  assessmentSpeakingEl.textContent = String(result.speakingScore);
  assessmentGrammarEl.textContent = String(result.grammarScore);
  assessmentVocabularyEl.textContent = String(result.vocabularyScore);
}

function metricKeyToLabel(metricKey) {
  const labels = {
    "assessment.overall": "Overall",
    "assessment.speaking": "Speaking",
    "assessment.grammar": "Grammar",
    "assessment.vocabulary": "Vocabulary"
  };
  return labels[metricKey] || metricKey;
}

function renderSystemValidation(validation) {
  systemChecksEl.innerHTML = "";
  if (!validation?.checks?.length) {
    const item = document.createElement("li");
    item.textContent = "No validation checks available.";
    systemChecksEl.appendChild(item);
    return;
  }

  for (const check of validation.checks) {
    const item = document.createElement("li");
    item.textContent = `${check.ok ? "OK" : "Warn"}: ${check.message}`;
    item.className = check.ok ? "checkOk" : "checkWarn";
    systemChecksEl.appendChild(item);
  }
}

function renderProgressSummary(progress) {
  const streakDays = Number(progress?.streak?.currentDays || 0);
  streakCurrentEl.textContent = `${streakDays} day${streakDays === 1 ? "" : "s"}`;
  lastActiveDayEl.textContent = progress?.streak?.lastActiveDay || "-";

  progressTrendsEl.innerHTML = "";
  const trends = Array.isArray(progress?.trends) ? progress.trends : [];
  if (!trends.length) {
    const empty = document.createElement("li");
    empty.textContent = "No trend data yet. Complete an assessment to start tracking.";
    progressTrendsEl.appendChild(empty);
  } else {
    for (const trend of trends) {
      const item = document.createElement("li");
      const points = Array.isArray(trend.points) ? trend.points : [];
      const latestPoint = points[points.length - 1];
      item.textContent = `${metricKeyToLabel(trend.metricKey)}: ${latestPoint ? latestPoint.value : "-"}`;
      progressTrendsEl.appendChild(item);
    }
  }

  recurringIssuesEl.innerHTML = "";
  const issues = Array.isArray(progress?.recurringIssues) ? progress.recurringIssues : [];
  if (!issues.length) {
    const empty = document.createElement("li");
    empty.textContent = "No recurring issues detected yet.";
    recurringIssuesEl.appendChild(empty);
    return;
  }

  for (const issue of issues) {
    const item = document.createElement("li");
    item.textContent = `${issue.type}: ${issue.text} (${issue.count}x)`;
    recurringIssuesEl.appendChild(item);
  }
}

async function hydrateSystemValidation() {
  try {
    const validation = await window.bayan.getSystemValidation();
    renderSystemValidation(validation);
    if (validation.ok) {
      setSystemStatus("System validation passed.");
    } else {
      setSystemStatus(`Validation warnings: ${validation.warnings.length}`);
    }
  } catch (error) {
    setSystemStatus(`Validation unavailable: ${error.message}`);
    renderSystemValidation(null);
  }
}

async function hydrateProgressSummary() {
  if (!activeToken) {
    setProgressStatus("Sign in to load progress dashboard.");
    renderProgressSummary(null);
    return;
  }

  try {
    const progress = await window.bayan.getProgressSummary({ token: activeToken });
    renderProgressSummary(progress);
    setProgressStatus("Progress summary updated.");
  } catch (error) {
    setProgressStatus(`Unable to load progress: ${error.message}`);
    renderProgressSummary(null);
  }
}

async function hydrateLatestAssessment() {
  if (!activeToken) {
    updateAssessmentResultCard(null);
    return;
  }

  try {
    const latest = await window.bayan.getLatestAssessment({ token: activeToken });
    updateAssessmentResultCard(latest.assessment || null);
  } catch (_error) {
    updateAssessmentResultCard(null);
  }
}

function updateFeedback(feedback) {
  const grammarText = feedback?.grammarCorrection || "No grammar feedback available.";
  const suggestions = Array.isArray(feedback?.pronunciationSuggestions)
    ? feedback.pronunciationSuggestions
    : [];

  grammarCorrectionEl.textContent = grammarText;
  pronunciationSuggestionsEl.innerHTML = "";

  if (!suggestions.length) {
    const empty = document.createElement("li");
    empty.textContent = "No pronunciation suggestions for this turn.";
    pronunciationSuggestionsEl.appendChild(empty);
    return;
  }

  for (const suggestion of suggestions) {
    const item = document.createElement("li");
    item.textContent = suggestion;
    pronunciationSuggestionsEl.appendChild(item);
  }
}

async function prepareAudioAnalyser(stream) {
  if (!window.AudioContext && !window.webkitAudioContext) {
    return;
  }

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;

  if (!audioContext) {
    audioContext = new AudioContextCtor();
  }

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  if (!analyserNode) {
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 64;
    analyserNode.smoothingTimeConstant = 0.75;
  }

  if (sourceNode) {
    sourceNode.disconnect();
  }

  sourceNode = audioContext.createMediaStreamSource(stream);
  sourceNode.connect(analyserNode);
}

async function playTts(tts) {
  if (!tts?.audioBase64 || !tts?.mimeType) {
    return;
  }

  setVoiceState("responding");
  const audio = new Audio(`data:${tts.mimeType};base64,${tts.audioBase64}`);
  await audio.play();

  await new Promise((resolve) => {
    audio.addEventListener("ended", resolve, { once: true });
    audio.addEventListener("error", resolve, { once: true });
  });
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
    await prepareAudioAnalyser(mediaStream);
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
    setVoiceState("listening");
    startWaveformAnimation();
    setStatus("Recording...");
  } catch (error) {
    setVoiceState("idle");
    stopWaveformAnimation();
    setStatus(`Microphone error: ${error.message}`);
  }
}

async function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state !== "recording") {
    return;
  }

  setVoiceState("processing");
  startWaveformAnimation();
  setStatus("Processing...");

  await new Promise((resolve) => {
    mediaRecorder.addEventListener("stop", resolve, { once: true });
    mediaRecorder.stop();
  });

  const captureMs = Math.round(performance.now() - recordingStart);
  captureMsEl.textContent = String(captureMs);

  if (!chunks.length) {
    setVoiceState("idle");
    stopWaveformAnimation();
    setStatus("No audio captured");
    return;
  }

  const blob = new Blob(chunks, { type: mediaRecorder.mimeType || "audio/webm" });
  const audioBase64 = await blobToBase64(blob);
  const preferences = getPreferencesFromForm();

  try {
    const isAssessmentTurn = Boolean(activeAssessmentSessionId && activeToken);
    const result = isAssessmentTurn
      ? await window.bayan.processAssessmentAudio({
          audioBase64,
          mimeType: blob.type,
          token: activeToken,
          assessmentSessionId: activeAssessmentSessionId
        })
      : await window.bayan.processAudio({
          audioBase64,
          mimeType: blob.type,
          preferences,
          token: activeToken || undefined,
          sessionId: currentSessionId
        });

    appendMessage("You", result.transcript);
    appendMessage(
      "Bayan",
      result.reply,
      `${result.model} (${result.source})`
    );
    updateFeedback(result.feedback);
    if (!isAssessmentTurn && result.sessionId) {
      currentSessionId = result.sessionId;
      await refreshSessionList();
    }

    if (isAssessmentTurn && result.assessment) {
      if (result.assessment.completed) {
        activeAssessmentSessionId = null;
        updateAssessmentPrompt("No active assessment.");
        setAssessmentStatus("Assessment completed. Results saved.");
        updateAssessmentResultCard(result.assessment.result || null);
        await hydrateProgressSummary();
      } else {
        updateAssessmentPrompt(result.assessment.currentPrompt || "No active assessment.");
        setAssessmentStatus(
          `Assessment in progress (${result.assessment.currentPromptIndex + 1}/${result.assessment.totalPrompts})`
        );
      }
    }

    try {
      await playTts(result.tts);
    } catch (error) {
      setVoiceState("idle");
      stopWaveformAnimation();
      setStatus(`Idle (TTS playback failed: ${error.message})`);
      return;
    }

    sttMsEl.textContent = String(result.timings.sttMs || 0);
    llmMsEl.textContent = String(result.timings.llmMs || 0);
    totalMsEl.textContent = String(result.timings.totalMs || 0);
    setVoiceState("idle");
    stopWaveformAnimation();
    setStatus("Idle");
  } catch (error) {
    setVoiceState("idle");
    stopWaveformAnimation();
    setStatus(`Pipeline error: ${error.message}`);
  }
}

function renderSessionList(sessions) {
  sessionListEl.innerHTML = "";

  if (!sessions.length) {
    const empty = document.createElement("li");
    empty.textContent = activeToken ? "No saved sessions yet." : "Sign in to view saved sessions.";
    sessionListEl.appendChild(empty);
    return;
  }

  for (const session of sessions) {
    const item = document.createElement("li");
    item.className = "sessionItem";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "sessionButton";
    button.textContent = `${session.title} (${session.turnCount} turns)`;
    button.addEventListener("click", () => {
      void openSession(session.id);
    });

    item.appendChild(button);
    sessionListEl.appendChild(item);
  }
}

async function refreshSessionList() {
  if (!activeToken) {
    renderSessionList([]);
    return;
  }

  try {
    const result = await window.bayan.listSessions({ token: activeToken });
    renderSessionList(Array.isArray(result.sessions) ? result.sessions : []);
  } catch (error) {
    renderSessionList([]);
    setStatus(`Unable to load sessions: ${error.message}`);
  }
}

async function openSession(sessionId) {
  if (!activeToken) {
    return;
  }

  try {
    const result = await window.bayan.getSessionTurns({
      token: activeToken,
      sessionId
    });

    const turns = Array.isArray(result.turns) ? result.turns : [];
    clearMessages();
    for (let index = turns.length - 1; index >= 0; index -= 1) {
      const turn = turns[index];
      appendMessage("Bayan", turn.reply, `Saved turn ${turn.id}`);
      appendMessage("You", turn.transcript);
    }

    const latestTurn = turns[turns.length - 1];
    if (latestTurn) {
      updateFeedback({
        grammarCorrection: latestTurn.grammarCorrection,
        pronunciationSuggestions: latestTurn.pronunciationSuggestions
      });
    }

    currentSessionId = sessionId;
    setStatus(`Loaded session #${sessionId}`);
  } catch (error) {
    setStatus(`Failed to open session: ${error.message}`);
  }
}

async function syncPreferencesToServer(preferences) {
  if (!activeToken) {
    return;
  }

  await window.bayan.updatePreferences({
    token: activeToken,
    preferences
  });
}

async function hydrateAuthState() {
  const saved = loadAuthState();
  if (!saved.token) {
    setAuthState({ token: "", user: null });
    return;
  }

  try {
    const profile = await window.bayan.me({ token: saved.token });
    setAuthState({
      token: saved.token,
      user: profile.user
    });

    if (profile.user?.preferences) {
      applyPreferencesToForm(profile.user.preferences);
      savePreferences(profile.user.preferences);
    }
  } catch (error) {
    setAuthState({ token: "", user: null });
  }
}

async function handleAuth(action) {
  const email = (authEmailEl.value || "").trim().toLowerCase();
  const password = authPasswordEl.value || "";
  if (!email || !password) {
    setAuthStatus("Email and password are required");
    return;
  }

  try {
    const payload = { email, password, preferences: getPreferencesFromForm() };
    const result = action === "register" ? await window.bayan.register(payload) : await window.bayan.login(payload);
    setAuthState({ token: result.token, user: result.user });
    currentSessionId = null;
    activeAssessmentSessionId = null;
    updateAssessmentPrompt("No active assessment.");
    setAssessmentStatus("Ready to start assessment.");
    await refreshSessionList();
    await hydrateLatestAssessment();
    await hydrateProgressSummary();
    setStatus(`Authenticated as ${result.user.email}`);
  } catch (error) {
    setAuthStatus(`Auth error: ${error.message}`);
  }
}

async function handleLogout() {
  try {
    if (activeToken) {
      await window.bayan.logout({ token: activeToken });
    }
  } catch (error) {
    // Ignore logout failures and clear local state regardless.
  }

  setAuthState({ token: "", user: null });
  currentSessionId = null;
  activeAssessmentSessionId = null;
  updateAssessmentPrompt("No active assessment.");
  setAssessmentStatus("Sign in to start assessment.");
  updateAssessmentResultCard(null);
  setProgressStatus("Sign in to load progress dashboard.");
  renderProgressSummary(null);
  renderSessionList([]);
  clearMessages();
  setVoiceState("idle");
  stopWaveformAnimation();
  setStatus("Logged out");
}

async function startAssessment() {
  if (!activeToken) {
    setAssessmentStatus("Sign in first to start assessment.");
    return;
  }

  try {
    const preferences = getPreferencesFromForm();
    const result = await window.bayan.startAssessment({
      token: activeToken,
      preferences
    });

    activeAssessmentSessionId = result.assessmentSessionId;
    currentSessionId = null;
    clearMessages();
    updateAssessmentPrompt(result.currentPrompt || "No active assessment.");
    setAssessmentStatus(`Assessment in progress (1/${result.totalPrompts})`);
    setStatus("Assessment started. Hold to speak for each prompt.");
  } catch (error) {
    setAssessmentStatus(`Unable to start assessment: ${error.message}`);
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

preferencesForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const preferences = getPreferencesFromForm();
  savePreferences(preferences);
  void syncPreferencesToServer(preferences)
    .then(() => {
      setStatus(`Preferences saved (${preferences.targetLanguage}/${preferences.nativeLanguage})`);
    })
    .catch((error) => {
      setStatus(`Preferences saved locally (server sync failed: ${error.message})`);
    });
});

authForm.addEventListener("submit", (event) => {
  event.preventDefault();
});

loginButton.addEventListener("click", () => {
  void handleAuth("login");
});

registerButton.addEventListener("click", () => {
  void handleAuth("register");
});

logoutButton.addEventListener("click", () => {
  void handleLogout();
});

startAssessmentButton.addEventListener("click", () => {
  void startAssessment();
});

topSettingsButton.addEventListener("click", () => {
  setActivePanel("settings");
});

if (sidebarToggleEl) {
  sidebarToggleEl.addEventListener("click", () => {
    if (window.innerWidth <= 820) {
      sidebarOpen = !sidebarOpen;
    } else {
      sidebarPinned = !sidebarPinned;
    }

    syncSidebarState();
  });
}

for (const button of navButtons) {
  button.addEventListener("click", () => {
    setActivePanel(button.dataset.panel || "practice");
  });
}

window.addEventListener("resize", handleResponsiveLayout);

document.addEventListener("click", (event) => {
  if (window.innerWidth > 820 || !sidebarOpen) {
    return;
  }

  const target = event.target;
  if (!(target instanceof Node)) {
    return;
  }

  if (appShellEl.contains(target) && !target.closest(".sidebar") && !target.closest(".sidebarToggle")) {
    closeSidebarMenu();
  }
});

window.addEventListener("DOMContentLoaded", async () => {
  const savedPreferences = loadPreferences();
  applyPreferencesToForm(savedPreferences);
  updateShellVisibility();
  setActivePanel("practice");
  handleResponsiveLayout();
  setVoiceState("idle");
  stopWaveformAnimation();

  await hydrateAuthState();
  await refreshSessionList();
  await hydrateLatestAssessment();
  await hydrateSystemValidation();
  await hydrateProgressSummary();

  if (activeToken) {
    setAssessmentStatus("Ready to start assessment.");
  }

  const config = await window.bayan.getConfig();
  setStatus(`Idle (backend: ${config.backendUrl})`);
});
