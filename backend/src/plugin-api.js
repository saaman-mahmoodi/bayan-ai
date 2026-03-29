/**
 * Bayan Plugin API — Phase 6
 *
 * Plugins are plain Node.js modules that export a `register(api)` function.
 * The `api` object exposes lifecycle hooks plugins can subscribe to.
 *
 * Supported hooks:
 *   api.onPrompt(fn)         — mutate or observe the LLM prompt before it is sent
 *   api.onReply(fn)          — mutate or observe the LLM reply after it arrives
 *   api.onFeedback(fn)       — mutate or observe the feedback object (grammarCorrection, pronunciationSuggestions)
 *   api.onScore(fn)          — mutate or observe the assessment score object
 *   api.onTurnSaved(fn)      — observe a persisted practice turn (read-only)
 *
 * Hook function signatures:
 *   onPrompt:    async (context: PromptContext)   => PromptContext   | void
 *   onReply:     async (context: ReplyContext)    => ReplyContext    | void
 *   onFeedback:  async (context: FeedbackContext) => FeedbackContext | void
 *   onScore:     async (context: ScoreContext)    => ScoreContext    | void
 *   onTurnSaved: async (context: TurnContext)     => void
 *
 * Context shapes are documented in shared/contracts.js.
 */

const SUPPORTED_HOOKS = ["onPrompt", "onReply", "onFeedback", "onScore", "onTurnSaved"];
const MAX_HOOK_DURATION_MS = 2000;

class PluginRegistry {
  constructor() {
    this._hooks = new Map();
    this._loaded = [];

    for (const hook of SUPPORTED_HOOKS) {
      this._hooks.set(hook, []);
    }
  }

  _makeApi(pluginMeta) {
    const registry = this;
    const api = {};

    for (const hookName of SUPPORTED_HOOKS) {
      api[hookName] = (fn) => {
        if (typeof fn !== "function") {
          throw new TypeError(`[plugin:${pluginMeta.name}] ${hookName} handler must be a function`);
        }
        registry._hooks.get(hookName).push({ fn, meta: pluginMeta });
      };
    }

    return api;
  }

  register(pluginModule, meta = {}) {
    const name = String(meta.name || pluginModule?.name || "unnamed-plugin");
    const version = String(meta.version || "0.0.0");
    const pluginMeta = { name, version };

    if (typeof pluginModule?.register !== "function") {
      throw new TypeError(`[plugin:${name}] must export a register(api) function`);
    }

    const api = this._makeApi(pluginMeta);
    pluginModule.register(api);
    this._loaded.push({ name, version });
    console.log(`[bayan-plugins] loaded plugin: ${name}@${version}`);
  }

  async runHook(hookName, context) {
    const handlers = this._hooks.get(hookName);
    if (!handlers || !handlers.length) {
      return context;
    }

    let current = context;
    for (const { fn, meta } of handlers) {
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`hook timed out after ${MAX_HOOK_DURATION_MS}ms`)), MAX_HOOK_DURATION_MS)
        );
        const result = await Promise.race([Promise.resolve(fn(current)), timeoutPromise]);
        if (result !== undefined && result !== null) {
          current = result;
        }
      } catch (error) {
        console.warn(`[bayan-plugins] hook ${hookName} from plugin ${meta.name} threw: ${error.message}`);
      }
    }

    return current;
  }

  getLoadedPlugins() {
    return this._loaded.map((p) => ({ ...p }));
  }
}

const registry = new PluginRegistry();

module.exports = { registry, PluginRegistry, SUPPORTED_HOOKS };
