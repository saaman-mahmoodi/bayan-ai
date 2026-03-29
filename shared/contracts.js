/**
 * Shared request/response contracts for the Phase 5–7 pipeline.
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
 *
 * --- Phase 6: Plugin System ---
 *
 * /api/plugins
 * response: { plugins: { name: string, version: string }[] }
 *
 * Plugin hook contexts:
 *   onPrompt:    { prompt: string, transcript: string, targetLanguage: string, nativeLanguage: string }
 *   onReply:     { reply: string, raw: string, transcript: string, targetLanguage: string, nativeLanguage: string }
 *   onFeedback:  { grammarCorrection: string, pronunciationSuggestions: string[], transcript: string, targetLanguage: string, nativeLanguage: string }
 *   onScore:     { cefrLevel: string, overallScore: number, speakingScore: number, grammarScore: number, vocabularyScore: number, reasoning: object }
 *   onTurnSaved: { userId: number, sessionId: number, turnId: number, transcript: string, reply: string, feedback: object }
 *
 * --- Phase 7: Intelligence Layer ---
 *
 * /api/intelligence/profile
 * request: Authorization: Bearer <token>
 * response: {
 *   profile: {
 *     weakAreas: string[],
 *     strongAreas: string[],
 *     mistakeCountGrammar: number,
 *     mistakeCountPronunciation: number,
 *     mistakeCountVocabulary: number,
 *     totalTurns: number,
 *     updatedAt: string | null
 *   }
 * }
 *
 * /api/intelligence/errors
 * request: Authorization: Bearer <token>
 * response: {
 *   clusters: {
 *     grammar: { id: number, token: string, exampleText: string, count: number, lastSeenAt: string }[],
 *     pronunciation: { id: number, token: string, exampleText: string, count: number, lastSeenAt: string }[],
 *     vocabulary: { id: number, token: string, exampleText: string, count: number, lastSeenAt: string }[]
 *   }
 * }
 *
 * /api/intelligence/curriculum
 * request: Authorization: Bearer <token>, query: ?goalId=<number>
 * response: {
 *   steps: { id: number, goalId: number|null, stepIndex: number, title: string, description: string, focusArea: string, status: 'pending'|'completed', createdAt: string, completedAt: string|null }[]
 * }
 *
 * /api/intelligence/curriculum/generate
 * request: Authorization: Bearer <token>, body: { goalId?: number }
 * response: { steps: CurriculumStep[] }
 *
 * /api/intelligence/curriculum/complete-step
 * request: Authorization: Bearer <token>, body: { stepId: number }
 * response: { ok: boolean, stepId: number }
 *
 * /api/intelligence/goals
 * GET:  Authorization: Bearer <token>
 *       response: { goals: { id: number, goalType: string, goalLabel: string, targetCefr: string|null, status: string, createdAt: string }[] }
 * POST: Authorization: Bearer <token>, body: { goalType: string, goalLabel: string, targetCefr?: string }
 *       response: { goal: { id: number, goalType: string, goalLabel: string, targetCefr: string|null, status: string }, steps: CurriculumStep[] }
 *
 * /api/intelligence/goals/:id
 * DELETE: Authorization: Bearer <token>
 *         response: { ok: boolean, goalId: number }
 */

const API_CONTRACT_VERSION = "phase7-v1";

module.exports = {
  API_CONTRACT_VERSION
};
