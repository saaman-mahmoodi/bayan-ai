# Bayan

**Privacy-first, offline-capable voice language tutoring powered by local AI models.**

Bayan is an open-source desktop application that provides voice-powered language learning using locally hosted AI models. The system runs fully offline after initial setup, ensuring low latency, complete privacy, and full data ownership.

## Features

- 🎤 **Push-to-talk voice interaction** with real-time transcription
- 🤖 **Local AI models** - runs completely offline using Ollama, Whisper.cpp, and Piper
- 🔒 **Privacy-first** - all data stored locally, no external API calls required
- 📊 **Progress tracking** - CEFR assessment, streaks, and recurring issue detection
- 🎯 **Personalized feedback** - grammar corrections and pronunciation suggestions
- 🌍 **Multi-language support** - configurable target and native languages
- 💾 **Session persistence** - save and resume practice sessions

## Prerequisites

### Required
- **Node.js** 18+ and npm/pnpm
- **Electron** (installed via npm)
- **SQLite** (bundled with sqlite3 package)

### Recommended for Full Functionality
- **Ollama** - for LLM-powered conversational responses
  - Download: [https://ollama.ai](https://ollama.ai)
  - Recommended model: `llama3` or `mistral`
- **Whisper.cpp** - for speech-to-text transcription
  - Build from: [https://github.com/ggerganov/whisper.cpp](https://github.com/ggerganov/whisper.cpp)
  - Recommended model: `base` or `small`
- **FFmpeg** - for audio format conversion (if using non-WAV input)
- **Piper** - for text-to-speech output
  - Download: [https://github.com/rhasspy/piper](https://github.com/rhasspy/piper)

### Hardware Requirements

**Minimum:**
- CPU: 4 cores
- RAM: 8GB
- Storage: 10GB

**Recommended:**
- CPU: 8+ cores
- RAM: 16GB
- GPU: Optional (for faster inference)

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/bayan.git
   cd bayan
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and set paths for your local AI models:
   ```env
   PORT=8787
   BAYAN_DB_PATH=data/bayan.sqlite
   
   # Ollama
   OLLAMA_BASE_URL=http://127.0.0.1:11434
   OLLAMA_MODEL=llama3
   
   # Whisper.cpp (optional)
   WHISPER_CPP_BIN=/path/to/whisper.cpp/main
   WHISPER_MODEL_PATH=/path/to/models/ggml-base.bin
   FFMPEG_BIN=/usr/bin/ffmpeg
   
   # Piper TTS (optional)
   PIPER_BIN=/path/to/piper
   PIPER_MODEL_PATH=/path/to/piper/model.onnx
   
   # Desktop app
   BAYAN_BACKEND_URL=http://127.0.0.1:8787
   ```

4. **Download AI models**
   ```bash
   # Install Ollama model
   ollama pull llama3
   
   # Download Whisper model (if using whisper.cpp)
   # See whisper.cpp documentation for model downloads
   ```

## Usage

### Development Mode

Start both backend and desktop app:

**Windows (PowerShell):**
```powershell
.\run-dev.ps1
```

**Manual start:**
```bash
# Terminal 1 - Backend server
npm run dev:backend

# Terminal 2 - Desktop app
npm run dev:desktop
```

### Production Build

```bash
npm start
```

## Quick Start Guide

1. **Launch the application** using the development script
2. **Create an account** - email and password (stored locally)
3. **Set your languages** - target language you're learning and your native language
4. **Start assessment** (optional) - get your baseline CEFR level
5. **Practice speaking** - hold the microphone button and speak
6. **Review feedback** - see grammar corrections and pronunciation tips
7. **Track progress** - view your streaks and improvement trends

## Project Structure

```
bayan/
├── backend/          # Local API service (Node.js/Express)
│   └── src/
│       └── server.js # Main backend server
├── desktop/          # Electron desktop app
│   ├── main.js       # Electron main process
│   ├── preload.js    # IPC bridge
│   └── renderer/     # Frontend UI
│       ├── index.html
│       ├── app.js
│       └── styles.css
├── shared/           # Shared contracts/types
│   └── contracts.js
├── data/             # SQLite database (gitignored)
├── docs/             # Technical documentation
│   ├── BAYAN.md      # Full technical spec
│   └── roadmap.md    # Development roadmap
└── .env.example      # Environment template
```

## Architecture

Bayan uses a local client-server architecture:

1. **Desktop App (Electron)** - UI and audio capture
2. **Local Backend (Node.js)** - API endpoints and database
3. **AI Pipeline:**
   - Audio → Whisper.cpp (STT) → Transcript
   - Transcript → Ollama (LLM) → Response + Feedback
   - Response → Piper (TTS) → Audio playback

All components run locally on your machine. No internet connection required after setup.

## Development Phases

Bayan is currently in **Phase 5** (Progress Tracking + Hardening). See [`docs/roadmap.md`](docs/roadmap.md) for the full development plan.

**Completed:**
- ✅ Phase 1: Core voice loop (STT → LLM → response)
- ✅ Phase 2: TTS integration and feedback system
- ✅ Phase 3: Authentication and persistence
- ✅ Phase 4: Assessment system with CEFR scoring
- ✅ Phase 5: Progress tracking and cross-platform packaging

**Upcoming:**
- 🔄 Phase 6: Plugin and extensibility layer

## Contributing

We welcome contributions! Please see [`CONTRIBUTING.md`](CONTRIBUTING.md) for guidelines on:
- Setting up your development environment
- Code style and conventions
- Submitting issues and pull requests
- Testing requirements

## Documentation

- **[Technical Specification](docs/BAYAN.md)** - Complete technical overview
- **[Development Roadmap](docs/roadmap.md)** - Phased development plan
- **[Environment Setup](.env.example)** - Configuration reference

## Troubleshooting

### Backend won't start
- Check that port 8787 is available
- Verify database directory exists: `mkdir -p data`

### STT returns fallback transcript
- Verify `WHISPER_CPP_BIN` and `WHISPER_MODEL_PATH` are set correctly
- Check that whisper.cpp binary has execute permissions
- Ensure FFmpeg is installed if using non-WAV audio

### LLM responses are generic
- Confirm Ollama is running: `ollama list`
- Test Ollama connection: `curl http://127.0.0.1:11434/api/tags`
- Pull the model: `ollama pull llama3`

### TTS is silent
- Verify `PIPER_BIN` and `PIPER_MODEL_PATH` are configured
- Check Piper binary has execute permissions

## Performance Targets

- **End-to-end latency:** < 1.5s (capture → STT → LLM → TTS)
- **STT latency:** < 500ms (Whisper base model)
- **LLM latency:** < 800ms (quantized 7B model on CPU)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- **Whisper.cpp** - Fast STT inference
- **Ollama** - Simple local LLM runtime
- **Piper** - Lightweight TTS engine
- **Electron** - Cross-platform desktop framework

## Support

- **Issues:** [GitHub Issues](https://github.com/yourusername/bayan/issues)
- **Discussions:** [GitHub Discussions](https://github.com/yourusername/bayan/discussions)

---

**Built with ❤️ for privacy-conscious language learners**
