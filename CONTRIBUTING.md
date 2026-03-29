# Contributing to Bayan

Thank you for your interest in contributing to Bayan! We welcome contributions from the community to help make this privacy-first language learning tool even better.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)

## Code of Conduct

This project adheres to a code of conduct that all contributors are expected to follow. Please be respectful, inclusive, and constructive in all interactions.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/yourusername/bayan.git
   cd bayan
   ```
3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/original/bayan.git
   ```

## Development Setup

### Prerequisites

- Node.js 18+ and npm
- Ollama (for LLM functionality)
- Whisper.cpp (optional, for STT)
- Piper (optional, for TTS)
- FFmpeg (optional, for audio conversion)

### Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your local paths and settings.

3. **Initialize database**:
   The SQLite database will be created automatically on first run.

4. **Start development servers**:
   ```powershell
   # Windows
   .\run-dev.ps1
   ```
   
   Or manually:
   ```bash
   # Terminal 1 - Backend
   npm run dev:backend
   
   # Terminal 2 - Desktop app
   npm run dev:desktop
   ```

## How to Contribute

### Types of Contributions

- **Bug fixes** - Fix issues in existing code
- **New features** - Implement features from the roadmap
- **Documentation** - Improve docs, add examples, fix typos
- **Performance** - Optimize latency, memory usage, or startup time
- **Testing** - Add unit tests, integration tests, or smoke tests
- **UI/UX** - Improve the desktop interface
- **Accessibility** - Make the app more accessible

### Before You Start

1. **Check existing issues** - See if someone is already working on it
2. **Create an issue** - Discuss major changes before implementing
3. **Review the roadmap** - See [`docs/roadmap.md`](docs/roadmap.md) for planned work

## Coding Standards

### JavaScript Style

- Use **ES6+ features** where appropriate
- Use **async/await** for asynchronous code
- Use **const** by default, **let** when reassignment is needed
- Avoid **var**
- Use **template literals** for string interpolation
- Use **arrow functions** for callbacks

### Code Organization

- Keep functions **small and focused** (single responsibility)
- Use **descriptive variable names** (no single-letter names except loop counters)
- Add **JSDoc comments** for public APIs
- Group related functions together
- Separate concerns (UI, business logic, data access)

### File Structure

- Backend code goes in `backend/src/`
- Desktop app code goes in `desktop/`
- Shared types/contracts go in `shared/`
- Documentation goes in `docs/`

### Naming Conventions

- **Files**: `camelCase.js` or `kebab-case.js`
- **Functions**: `camelCase()`
- **Constants**: `UPPER_SNAKE_CASE`
- **Classes**: `PascalCase`
- **Database columns**: `snake_case`

### Error Handling

- Always handle errors gracefully
- Provide meaningful error messages
- Log errors with context
- Don't expose sensitive information in error messages

### Performance Considerations

- Target **< 1.5s end-to-end latency** for voice pipeline
- Minimize database queries
- Use prepared statements for SQL
- Clean up resources (close streams, cancel timers)
- Avoid blocking the main thread

## Testing

### Running Tests

Currently, the project uses manual testing. Automated tests are planned for future phases.

### Manual Testing Checklist

Before submitting a PR, verify:

- [ ] Backend starts without errors
- [ ] Desktop app launches successfully
- [ ] User can register and login
- [ ] Push-to-talk recording works
- [ ] Audio transcription completes
- [ ] LLM generates responses
- [ ] Feedback is displayed correctly
- [ ] Sessions are saved and can be reopened
- [ ] Assessment flow works end-to-end
- [ ] Progress dashboard loads
- [ ] No console errors or warnings

### Testing with Fallbacks

The app gracefully degrades when AI services are unavailable:

- **No Whisper** → Uses fallback transcript
- **No Ollama** → Uses fallback response
- **No Piper** → Silent TTS (no audio playback)

Test both with and without AI services running.

## Submitting Changes

### Commit Messages

Use clear, descriptive commit messages:

```
Add pronunciation scoring to assessment system

- Implement phoneme-level analysis
- Add pronunciation score to CEFR rubric
- Update assessment results UI
- Add tests for pronunciation scoring

Fixes #123
```

Format:
- **First line**: Brief summary (50 chars or less)
- **Blank line**
- **Body**: Detailed explanation (wrap at 72 chars)
- **Footer**: Reference issues with `Fixes #123` or `Relates to #456`

### Pull Request Process

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** and commit them:
   ```bash
   git add .
   git commit -m "Your descriptive commit message"
   ```

3. **Keep your branch updated**:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

4. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

5. **Open a Pull Request** on GitHub with:
   - Clear title describing the change
   - Description of what changed and why
   - Reference to related issues
   - Screenshots (if UI changes)
   - Testing notes

6. **Respond to feedback** - Address review comments promptly

### PR Review Criteria

Your PR will be reviewed for:

- **Functionality** - Does it work as intended?
- **Code quality** - Is it readable and maintainable?
- **Performance** - Does it meet latency targets?
- **Security** - Are there any vulnerabilities?
- **Documentation** - Are changes documented?
- **Testing** - Has it been tested thoroughly?

## Reporting Bugs

### Before Reporting

1. **Search existing issues** - Your bug may already be reported
2. **Test with latest version** - The bug may already be fixed
3. **Verify it's reproducible** - Can you consistently reproduce it?

### Bug Report Template

```markdown
**Describe the bug**
A clear description of what the bug is.

**To Reproduce**
Steps to reproduce:
1. Go to '...'
2. Click on '...'
3. See error

**Expected behavior**
What you expected to happen.

**Actual behavior**
What actually happened.

**Screenshots**
If applicable, add screenshots.

**Environment:**
- OS: [e.g., Windows 11, macOS 14]
- Node version: [e.g., 18.16.0]
- Electron version: [e.g., 31.7.7]
- Ollama model: [e.g., llama3]

**Logs**
Relevant console output or error messages.

**Additional context**
Any other relevant information.
```

## Suggesting Features

### Feature Request Template

```markdown
**Is your feature request related to a problem?**
A clear description of the problem.

**Describe the solution you'd like**
What you want to happen.

**Describe alternatives you've considered**
Other solutions you've thought about.

**Additional context**
Mockups, examples, or references.

**Roadmap alignment**
Does this align with the existing roadmap?
```

## Development Workflow

### Typical Development Cycle

1. **Pick an issue** or create one
2. **Create a branch** from `main`
3. **Implement changes** following coding standards
4. **Test thoroughly** using the manual checklist
5. **Commit changes** with clear messages
6. **Push to your fork**
7. **Open a PR** with detailed description
8. **Address review feedback**
9. **Merge** once approved

### Branch Naming

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `test/` - Adding tests
- `perf/` - Performance improvements

## Questions?

- **Issues**: [GitHub Issues](https://github.com/yourusername/bayan/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/bayan/discussions)

## License

By contributing to Bayan, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Bayan! 🎉
