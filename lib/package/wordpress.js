const { stripBom } = require("../text");
const { ValidationError } = require("../errors");

const HEADER_BYTES = 8192;
const THEME_FILE = "style.css";

const NO_HEADER =
  "No WordPress plugin or theme header found. Put style.css with a Theme Name header, or a .php file with a Plugin Name header, at the top of the zip or inside one top-level folder.";

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseHeader = (data, fields) => {
  const text = stripBom(data.subarray(0, HEADER_BYTES).toString("utf8")).replace(/\r/g, "\n");
  const out = {};
  for (const [key, label] of Object.entries(fields)) {
    const match = new RegExp(`^(?:[ \\t]*<\\?php)?[ \\t\\/*#@]*${escapeRegex(label)}:(.*)$`, "mi").exec(text);
    const value = match ? match[1].replace(/\s*(?:\*\/|\?>).*/, "").trim() : "";
    out[key] = value || null;
  }
  return out;
};

const THEME_FIELDS = { name: "Theme Name", version: "Version", description: "Description" };
const PLUGIN_FIELDS = { name: "Plugin Name", version: "Version", description: "Description" };

const isRootFile = (path) => !path.includes("/");

const findHeader = (files, preferred) => {
  const theme = files.find((f) => f.path === THEME_FILE);
  if (theme) {
    const fields = parseHeader(theme.data, THEME_FIELDS);
    if (fields.name) return { type: "theme", path: THEME_FILE, ...fields };
  }
  const found = files
    .filter((f) => isRootFile(f.path) && f.path.endsWith(".php"))
    .map((f) => ({ path: f.path, fields: parseHeader(f.data, PLUGIN_FIELDS) }))
    .filter((c) => c.fields.name)
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  if (!found.length) return null;
  const pick = found.find((c) => preferred.some((name) => name.toLowerCase() === c.path.slice(0, -".php".length).toLowerCase())) || found[0];
  return { type: "plugin", path: pick.path, ...pick.fields };
};

const locatePackage = (files, uploadName) => {
  const upload = String(uploadName || "").replace(/\.zip$/i, "");
  const atRoot = findHeader(files, [upload]);
  if (atRoot) return { files, header: atRoot };

  const top = files.length ? files[0].path.split("/")[0] : "";
  if (top && files.every((f) => f.path.startsWith(`${top}/`))) {
    const stripped = files.map((f) => ({ ...f, path: f.path.slice(top.length + 1) }));
    const header = findHeader(stripped, [top, upload]);
    if (header) return { files: stripped, header };
  }
  throw new ValidationError(NO_HEADER);
};

module.exports = { parseHeader, locatePackage, NO_HEADER };
