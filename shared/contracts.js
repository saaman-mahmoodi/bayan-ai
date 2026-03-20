/**
 * Shared request/response contracts for the Phase 3 pipeline.
 *
 * /api/stt
 * request: { audioBase64: string, mimeType: string }
 * response: { transcript: string, timings: { sttMs: number } }
 *
 * /api/chat
 * request: {
 *   transcript: string,
 *   preferences?: { targetLanguage?: string, nativeLanguage?: string }
 * }
 * response: {
 *   reply: string,
 *   feedback: {
 *     grammarCorrection: string,
 *     pronunciationSuggestions: string[]
 *   },
 *   timings: { llmMs: number },
 *   model: string
 * }
 *
 * /api/tts
 * request: { text: string }
 * response: { audioBase64: string | null, mimeType: string | null, source: string }
 *
 * /api/auth/register
 * request: { email: string, password: string, preferences?: { targetLanguage?: string, nativeLanguage?: string } }
 * response: { token: string, user: { id: number, email: string, preferences: { targetLanguage: string, nativeLanguage: string } } }
 *
 * /api/auth/login
 * request: { email: string, password: string }
 * response: { token: string, user: { id: number, email: string, preferences: { targetLanguage: string, nativeLanguage: string } } }
 *
 * /api/me
 * request: Authorization: Bearer <token>
 * response: { user: { id: number, email: string, preferences: { targetLanguage: string, nativeLanguage: string } } }
 *
 * /api/preferences
 * request: { preferences: { targetLanguage?: string, nativeLanguage?: string } }
 * response: { preferences: { targetLanguage: string, nativeLanguage: string } }
 *
 * /api/sessions
 * response: { sessions: { id: number, title: string, createdAt: string, updatedAt: string, turnCount: number }[] }
 *
 * /api/sessions/:id/turns
 * response: {
 *   session: { id: number, title: string },
 *   turns: {
 *     id: number,
 *     transcript: string,
 *     reply: string,
 *     grammarCorrection: string,
 *     pronunciationSuggestions: string[],
 *     createdAt: string
 *   }[]
 * }
 */

const API_CONTRACT_VERSION = "phase3-v1";

module.exports = {
  API_CONTRACT_VERSION
};
