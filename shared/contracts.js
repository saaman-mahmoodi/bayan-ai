/**
 * Shared request/response contracts for the Phase 5 pipeline.
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
 *
 * /api/assessment/start
 * request: { preferences?: { targetLanguage?: string, nativeLanguage?: string } }
 * response: {
 *   assessmentSessionId: number,
 *   currentPromptIndex: number,
 *   totalPrompts: number,
 *   currentPrompt: string
 * }
 *
 * /api/assessment/answer
 * request: { assessmentSessionId: number, transcript: string }
 * response: {
 *   reply: string,
 *   feedback: { grammarCorrection: string, pronunciationSuggestions: string[] },
 *   assessment: {
 *     completed: boolean,
 *     assessmentSessionId: number,
 *     currentPromptIndex?: number,
 *     totalPrompts?: number,
 *     currentPrompt?: string,
 *     result?: {
 *       cefrLevel: 'A1'|'A2'|'B1'|'B2'|'C1'|'C2',
 *       overallScore: number,
 *       speakingScore: number,
 *       grammarScore: number,
 *       vocabularyScore: number
 *     }
 *   }
 * }
 *
 * /api/assessment/latest
 * request: Authorization: Bearer <token>
 * response: {
 *   assessment: {
 *     assessmentSessionId: number,
 *     cefrLevel: 'A1'|'A2'|'B1'|'B2'|'C1'|'C2',
 *     overallScore: number,
 *     speakingScore: number,
 *     grammarScore: number,
 *     vocabularyScore: number,
 *     createdAt: string,
 *     reasoning?: object
 *   } | null
 * }
 *
 * /api/validation
 * response: {
 *   ok: boolean,
 *   checkedAt: string,
 *   checks: { key: string, ok: boolean, required: boolean, message: string }[],
 *   warnings: string[]
 * }
 *
 * /api/progress
 * request: Authorization: Bearer <token>
 * response: {
 *   streak: { currentDays: number, lastActiveDay: string | null },
 *   trends: { metricKey: string, points: { day: string, value: number }[] }[],
 *   recurringIssues: { type: 'grammar'|'pronunciation', text: string, count: number }[],
 *   totals: { snapshotCount: number, activityDays: number }
 * }
 */

const API_CONTRACT_VERSION = "phase5-v1";

module.exports = {
  API_CONTRACT_VERSION
};
