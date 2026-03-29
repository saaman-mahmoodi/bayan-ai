/**
 * Bayan Sample Plugin: strict-mode
 *
 * Demonstrates the Phase 6 plugin API.
 * This plugin adjusts the tutor's tone to be more direct and adds
 * a formal grammar note prefix to every correction.
 *
 * Usage: place this directory inside the plugins/ folder.
 * It will be auto-loaded by bayan-backend on startup.
 */

function register(api) {
  api.onPrompt((context) => {
    return {
      ...context,
      prompt: context.prompt + "\nBe strict and formal in your corrections. Prioritize grammar precision."
    };
  });

  api.onFeedback((context) => {
    const original = context.grammarCorrection || "";
    return {
      ...context,
      grammarCorrection: original ? `[Strict Mode] ${original}` : original
    };
  });
}

module.exports = { register };
