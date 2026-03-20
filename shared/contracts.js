/**
 * Shared request/response contracts for the Phase 1 pipeline.
 *
 * /api/stt
 * request: { audioBase64: string, mimeType: string }
 * response: { transcript: string, timings: { sttMs: number } }
 *
 * /api/chat
 * request: { transcript: string }
 * response: {
 *   reply: string,
 *   timings: { llmMs: number },
 *   model: string
 * }
 */

const API_CONTRACT_VERSION = "phase1-v1";

module.exports = {
  API_CONTRACT_VERSION
};
