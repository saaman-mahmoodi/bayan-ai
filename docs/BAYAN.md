# Bayan — Technical Specification

## 1. Overview

Bayan is an open-source, privacy-first desktop application that provides voice-powered language tutoring using locally hosted AI models. The system is designed to run fully offline after initial setup, ensuring low latency and full data ownership.

---

## 2. Core Requirements

### Functional Requirements

* Email-based authentication
* Initial language proficiency assessment
* Language selection (target + native)
* Push-to-talk voice interaction
* Real-time transcription
* AI-generated conversational responses
* Pronunciation and grammar feedback
* Progress tracking and persistence

### Non-Functional Requirements

* Offline-first capability
* Low latency (< 1.5s response target)
* Cross-platform (Windows, macOS, Linux)
* Modular AI components
* Extensible plugin architecture

---

## 3. Desktop Application Stack

### Framework

* Electron (recommended for fastest development)

  * Alternative: Tauri (lighter, more performant)

### Frontend

* React (with Vite)
* TailwindCSS for UI
* Zustand or Redux for state management

### Backend (Local Service Layer)

* Node.js (Express or Fastify)

  * Alternative: Python (FastAPI) for tighter AI integration

### Communication

* IPC (Electron)
* WebSocket (for real-time streaming between UI and AI pipeline)

---

## 4. AI Stack (Local Models)

### 4.1 Speech-to-Text (STT)

* Whisper.cpp (primary choice)

  * Model: base or small for performance
  * Language-specific fine-tuning optional

### 4.2 Language Model (LLM)

* Primary Options:

  * Mistral 7B Instruct
  * LLaMA 3 (8B or 13B depending on hardware)

* Runtime:

  * Ollama (recommended for simplicity)
  * llama.cpp (for lower-level control)

* Requirements:

  * Quantized models (GGUF format)
  * Target: run on CPU with optional GPU acceleration

### 4.3 Text-to-Speech (TTS)

* Piper (lightweight, fast)
* Coqui TTS (higher quality, heavier)

---

## 5. System Architecture

### Pipeline Flow

1. User presses push-to-talk button
2. Audio captured via microphone
3. Audio processed by STT (Whisper)
4. Transcription sent to LLM
5. LLM generates:

   * Conversational reply
   * Corrections
   * Suggestions
6. Response sent to TTS engine
7. Audio playback to user

---

## 6. Data Storage

### Local Database

* SQLite (default)

### Stored Data

* User credentials (hashed)
* Assessment results
* Conversation history
* Progress metrics

### Optional Sync (Future)

* Encrypted cloud sync

---

## 7. Authentication System

### MVP Approach

* Email + password
* Local authentication (no external provider)
* Password hashing (bcrypt)

### Future Enhancements

* OAuth (Google, GitHub)
* Magic link login

---

## 8. Assessment System

### Components

* Voice-based prompts
* AI evaluation scoring

### Output

* CEFR level (A1–C2)
* Skill breakdown:

  * Speaking
  * Grammar
  * Vocabulary

---

## 9. Performance Requirements

### Minimum Hardware

* CPU: 4 cores
* RAM: 8GB
* Storage: 10GB

### Recommended

* CPU: 8+ cores
* RAM: 16GB
* GPU: Optional (for faster inference)

---

## 10. Development Setup

### Package Management

* pnpm or npm

### Containerization

* Docker (for backend + AI services)

### Model Management

* Ollama CLI
* Local model directory structure

---

## 11. Security Considerations

* All data stored locally
* No external API calls required
* Encrypted storage (future enhancement)
* Secure password hashing

---

## 12. Repository Structure

```
bayan/
 ├── desktop/        # Electron/Tauri app
 ├── backend/        # Local API service
 ├── ai/
 │    ├── stt/
 │    ├── llm/
 │    ├── tts/
 ├── shared/
 ├── docs/
 └── scripts/
```

---

## 13. MVP Milestones

### Phase 1

* Basic desktop app
* Push-to-talk working
* Whisper integration
* Simple LLM responses

### Phase 2

* TTS integration
* Feedback system
* Authentication

### Phase 3

* Assessment system
* Progress tracking

---

## 14. Future Enhancements

* Multi-language support
* Mobile app version
* Real-time streaming conversation
* Advanced pronunciation scoring
* Teacher dashboard

---

## 15. License

Recommended: MIT License

---

## 16. Conclusion

Bayan aims to provide a fully offline, privacy-respecting, voice-first language learning experience powered by modern local AI models. The architecture prioritizes modularity, performance, and extensibility for open-source collaboration.
