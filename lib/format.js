const { formatSize, formatMb } = require("./shared/files");
const { DAY_IN_SECONDS, YEAR_IN_SECONDS, DISPLAY_TIME_ZONE } = require("../config");

const MINUTE_IN_SECONDS = 60;
const HOUR_IN_SECONDS = 3600;

const UNITS = [
  [DAY_IN_SECONDS, "day"],
  [HOUR_IN_SECONDS, "hour"],
  [MINUTE_IN_SECONDS, "minute"],
];

const largestUnit = (seconds) => UNITS.find(([size]) => seconds >= size);

const pluralize = (count, unit) => `${count} ${unit}${count === 1 ? "" : "s"}`;

const timeLeft = (expiresAt) => {
  if (expiresAt === null) return "never";
  const seconds = (expiresAt - Date.now()) / 1000;
  if (seconds < 0) return "expired";
  if (seconds < MINUTE_IN_SECONDS) return pluralize(Math.round(seconds), "second");
  if (seconds >= YEAR_IN_SECONDS) return `${(seconds / YEAR_IN_SECONDS).toFixed(1)} years`;
  const [size, unit] = largestUnit(seconds);
  return pluralize(Math.round(seconds / size), unit);
};

const timeAgo = (date) => {
  const seconds = date ? (Date.now() - date.getTime()) / 1000 : 0;
  if (!(seconds >= MINUTE_IN_SECONDS)) return "just now";
  const [size, unit] = largestUnit(seconds);
  return `${pluralize(Math.floor(seconds / size), unit)} ago`;
};

const dateTime = (date) =>
  date ? date.toLocaleString("en-US", { timeZone: DISPLAY_TIME_ZONE }) : "—";

const describeExpiry = (days) =>
  days === null
    ? { label: "Never", hint: "never expires" }
    : { label: pluralize(days, "day"), hint: `expires in ${pluralize(days, "day")}` };

const splitCodeSpans = (text) =>
  String(text)
    .split("`")
    .map((part, i) => ({ text: part, code: i % 2 === 1 }));

module.exports = {
  formatSize,
  formatMb,
  timeLeft,
  timeAgo,
  dateTime,
  describeExpiry,
  splitCodeSpans,
};
