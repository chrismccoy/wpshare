const LEVELS = ["error", "warn", "info"];

const SINK_METHODS = { error: "error", warn: "warn", info: "log" };

const createLogger = ({ level = "info", sink = console } = {}) => {
  const threshold = LEVELS.indexOf(level);
  if (threshold === -1) throw new Error(`Unknown log level: ${level}`);

  const at = (name) => (...args) => {
    if (LEVELS.indexOf(name) <= threshold) sink[SINK_METHODS[name]](...args);
  };

  return { error: at("error"), warn: at("warn"), info: at("info") };
};

module.exports = { createLogger };
