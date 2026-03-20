# Bayan Roadmap

This roadmap translates the technical specification in `BAYAN.md` into execution phases with clear deliverables and exit criteria.

## Phase 0 - Project Foundation (Week 0-1)

**Goal:** Make the repository runnable and lock key architecture decisions.

### Actions
- Create the monorepo structure: `desktop/`, `backend/`, `ai/`, `shared/`, `docs/`, `scripts/`
- Finalize stack decisions:
  - Electron + React + Vite + TailwindCSS
  - Node.js local service layer (Express or Fastify)
  - SQLite local database
- Define IPC and WebSocket message contracts for real-time flow
- Add linting, formatting, and CI checks
- Add environment/config conventions and model path conventions
w
### Deliverables
- One command dev startup for desktop + backend
- Architecture note and interface contract docs
- CI running lint/test/build checks

### Exit Criteria
- Fresh clone can run the app shell
- Team agrees on folder boundaries and message schemas

---

## Phase 1 - Core Voice Loop MVP (Week 1-3)

**Goal:** Ship a complete push-to-talk to text response loop.

### Actions
- Implement push-to-talk audio capture in desktop app
- Integrate STT with Whisper.cpp (`base` or `small` model)
- Send transcripts to local LLM runtime (Ollama + quantized GGUF model)
- Display assistant responses in chat UI
- Add latency metrics per stage to track the 1.5s target

### Deliverables
- User can speak and receive an AI text response end-to-end
- Working chat/session screen
- Latency instrumentation (capture -> STT -> LLM)

### Exit Criteria
- Works fully offline after initial setup
- End-to-end median latency near target on recommended hardware

---

## Phase 2 - Speech Output + Tutor Feedback (Week 3-5)

**Goal:** Make interactions feel like a spoken tutoring session.

### Actions
- Integrate TTS (start with Piper; optionally add Coqui)
- Update prompt format so LLM returns:
  - Conversational reply
  - Grammar correction
  - Pronunciation suggestions
- Build structured feedback UI cards
- Persist and apply target/native language preferences

### Deliverables
- AI responses are shown and spoken
- Feedback rendered clearly for each turn
- Language preferences saved locally

### Exit Criteria
- Every turn provides actionable feedback
- TTS playback is stable under normal usage

---

## Phase 3 - Authentication + Persistence (Week 5-6)

**Goal:** Add local accounts and reliable data persistence.

### Actions
- Implement local email/password auth with bcrypt
- Create SQLite schema for users, sessions, transcripts, feedback, progress
- Build onboarding/login flow
- Add session history and resume capability

### Deliverables
- Offline local account creation/login
- Persistent conversations and progress data
- Basic profile/preferences page

### Exit Criteria
- Auth and persistence work across restarts
- Stored data is queryable and visible in UI

---

## Phase 4 - Assessment System (Week 6-8)

**Goal:** Launch baseline proficiency assessment and CEFR output.

### Actions
- Build guided, voice-driven assessment prompt flow
- Implement scoring pipeline (rules + LLM rubric)
- Output CEFR level (A1-C2) and skill breakdown:
  - Speaking
  - Grammar
  - Vocabulary
- Persist baseline scores with timestamps

### Deliverables
- First-run assessment experience
- Assessment results page
- Baseline data stored for future comparison

### Exit Criteria
- New users can complete assessment in one session
- Results are consistent and persisted correctly

---

## Phase 5 - Progress Tracking + Hardening (Week 8-10)

**Goal:** Make Bayan robust for daily use.

### Actions
- Build progress dashboard (trends, streaks, recurring issues)
- Add reliability handling:
  - Missing model handling
  - Microphone/device failure handling
  - Startup environment validation
- Performance tuning for minimum hardware targets
- Package app for Windows, macOS, Linux

### Deliverables
- Progress dashboard with historical metrics
- Clear and recoverable error states
- Installable cross-platform builds

### Exit Criteria
- Stable operation on minimum hardware
- Cross-platform builds pass smoke tests

---

## Phase 6 - Plugin and Extensibility Layer (Post-MVP)

**Goal:** Enable external contributions and modular extension.

### Actions
- Define plugin API (hooks for prompts, scoring, feedback modules)
- Add plugin loading lifecycle and safety boundaries
- Publish SDK docs and sample plugin
- Design optional encrypted sync abstraction for future cloud support

### Deliverables
- v1 plugin API + example plugin
- Extension development documentation

### Exit Criteria
- New tutoring behavior can be added without core code changes

---

## Continuous Tracks Across All Phases

1. **Testing:** unit, integration, and voice pipeline smoke tests
2. **Security:** local-first defaults, secure credential handling, secret hygiene
3. **Performance:** stage-level latency budgets and monitoring
4. **Documentation:** setup, model installation, troubleshooting, architecture updates

---

## Starter Backlog (First 10 Tickets)

1. Monorepo bootstrap and workspace tooling
2. Electron shell + React app mount
3. Local backend scaffold + health endpoint
4. Shared IPC/WebSocket event schema
5. Push-to-talk capture + WAV buffering
6. Whisper.cpp service wrapper + transcript endpoint
7. Ollama integration + tutor prompt template
8. Chat UI with loading/streaming states
9. SQLite migrations and initial schema
10. Baseline telemetry for per-stage latency
