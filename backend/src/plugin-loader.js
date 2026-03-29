/**
 * Bayan Plugin Loader — Phase 6
 *
 * Scans a plugins directory and safely loads each plugin into the registry.
 * Each plugin must be a directory containing an index.js (or a single .js file)
 * with a manifest comment block or package.json-style metadata.
 *
 * Safety boundaries:
 *   - Plugins run in the same Node.js process but are wrapped in try/catch.
 *   - Each hook invocation has a MAX_HOOK_DURATION_MS timeout (see plugin-api.js).
 *   - Plugin directories are resolved relative to BAYAN_PLUGINS_DIR env var
 *     (defaults to <repo-root>/plugins).
 *   - Plugins that throw during register() are skipped with a warning.
 */

const path = require("path");
const fs = require("fs");
const { registry } = require("./plugin-api");

const DEFAULT_PLUGINS_DIR = path.join(__dirname, "..", "..", "plugins");
const PLUGINS_DIR = process.env.BAYAN_PLUGINS_DIR || DEFAULT_PLUGINS_DIR;

function resolvePluginEntry(pluginPath) {
  const stat = fs.statSync(pluginPath);
  if (stat.isDirectory()) {
    const indexPath = path.join(pluginPath, "index.js");
    if (fs.existsSync(indexPath)) {
      return indexPath;
    }
    return null;
  }

  if (stat.isFile() && pluginPath.endsWith(".js")) {
    return pluginPath;
  }

  return null;
}

function readPluginMeta(pluginPath) {
  const dir = fs.statSync(pluginPath).isDirectory() ? pluginPath : path.dirname(pluginPath);
  const pkgPath = path.join(dir, "package.json");

  try {
    if (fs.existsSync(pkgPath)) {
      const raw = fs.readFileSync(pkgPath, "utf8");
      const pkg = JSON.parse(raw);
      return {
        name: pkg.name || path.basename(dir),
        version: pkg.version || "0.0.0",
        description: pkg.description || ""
      };
    }
  } catch (_error) {
    // Ignore malformed package.json.
  }

  return {
    name: path.basename(dir),
    version: "0.0.0",
    description: ""
  };
}

function loadPlugins() {
  if (!fs.existsSync(PLUGINS_DIR)) {
    console.log(`[bayan-plugins] plugins directory not found at ${PLUGINS_DIR}, skipping plugin load`);
    return;
  }

  let entries;
  try {
    entries = fs.readdirSync(PLUGINS_DIR);
  } catch (error) {
    console.warn(`[bayan-plugins] failed to read plugins directory: ${error.message}`);
    return;
  }

  let loaded = 0;
  let skipped = 0;

  for (const entry of entries) {
    const fullPath = path.join(PLUGINS_DIR, entry);
    const entryFile = resolvePluginEntry(fullPath);

    if (!entryFile) {
      continue;
    }

    const meta = readPluginMeta(fullPath);

    try {
      const pluginModule = require(entryFile);
      registry.register(pluginModule, meta);
      loaded += 1;
    } catch (error) {
      console.warn(`[bayan-plugins] failed to load plugin "${meta.name}": ${error.message}`);
      skipped += 1;
    }
  }

  console.log(`[bayan-plugins] plugin scan complete — loaded: ${loaded}, skipped: ${skipped}`);
}

module.exports = { loadPlugins, PLUGINS_DIR };
