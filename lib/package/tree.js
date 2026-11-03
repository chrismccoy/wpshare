const { fileTypeFor, DEFAULT_ICON } = require("./fileTypes");

const iconFor = (filePath) => fileTypeFor(filePath).icon || DEFAULT_ICON;

const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const newNode = () => ({ dirs: new Map(), files: new Map() });

const buildTree = (manifest, pinnedPath) => {
  const root = newNode();
  for (const entry of manifest) {
    const parts = entry.path.split("/");
    let node = root;
    for (const part of parts.slice(0, -1)) {
      if (!node.dirs.has(part)) node.dirs.set(part, newNode());
      node = node.dirs.get(part);
    }
    node.files.set(parts[parts.length - 1], entry);
  }

  const convert = (node, prefix) => {
    const isRoot = prefix === "";
    const dirs = [...node.dirs.keys()].sort(byName).map((name) => ({
      type: "dir",
      name,
      path: prefix + name,
      children: convert(node.dirs.get(name), prefix + name + "/"),
    }));
    const files = [...node.files.keys()].sort(byName).map((name) => ({
      type: "file",
      name,
      path: prefix + name,
      icon: iconFor(name),
      entry: node.files.get(name),
    }));
    const pinIndex = isRoot && pinnedPath ? files.findIndex((file) => file.path === pinnedPath) : -1;
    if (pinIndex === -1) return [...dirs, ...files];
    const [pinned] = files.splice(pinIndex, 1);
    return [pinned, ...dirs, ...files];
  };
  return convert(root, "");
};

const orderPaths = (paths, pinnedPath) => {
  const out = [];
  const walk = (nodes) => {
    for (const node of nodes) {
      if (node.type === "dir") walk(node.children);
      else out.push(node.path);
    }
  };
  walk(buildTree(paths.map((path) => ({ path })), pinnedPath));
  return out;
};

module.exports = { orderPaths, iconFor, buildTree };
