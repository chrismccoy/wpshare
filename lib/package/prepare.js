const { extractPackage, repackPackage } = require("./extract");
const { locatePackage } = require("./wordpress");
const { renderPackage } = require("./render");

const preparePackage = async (buffer, originalName, { zipRules, previewLimits }) => {
  const extracted = await extractPackage(buffer, zipRules);
  const { files, header } = locatePackage(extracted.files, originalName);
  const { manifest, rendered } = renderPackage(files, { ...previewLimits, pinnedPath: header.path });

  return {
    zip: extracted.trimmed ? await repackPackage(files) : buffer,
    manifest,
    rendered,
    details: {
      type: header.type,
      headerPath: header.path,
      name: header.name,
      version: header.version,
      description: header.description,
      removedDeps: extracted.removedDeps,
      fileCount: files.length,
      sizeBytes: files.reduce((sum, file) => sum + file.size, 0),
    },
  };
};

module.exports = { preparePackage };
