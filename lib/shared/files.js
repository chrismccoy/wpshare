((root, factory) => {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.wpshareFiles = factory();
})(globalThis, () => {
  const BYTES_PER_KB = 1_000;
  const BYTES_PER_MB = 1_000_000;

  const formatSize = (bytes) => {
    if (bytes >= BYTES_PER_MB) return `${(bytes / BYTES_PER_MB).toFixed(2)} MB`;
    if (bytes >= BYTES_PER_KB) return `${(bytes / BYTES_PER_KB).toFixed(1)} KB`;
    return `${Math.round(bytes)} B`;
  };

  const formatMb = (bytes) => `${bytes / BYTES_PER_MB} MB`;

  const isZipName = (name) => /\.zip$/i.test(String(name));

  return { BYTES_PER_MB, formatSize, formatMb, isZipName };
});
