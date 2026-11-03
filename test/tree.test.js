const { test } = require("node:test");
const assert = require("node:assert");
const { orderPaths, iconFor, buildTree } = require("../lib/package/tree");

test("orderPaths", () => {
  const out = orderPaths(["inc/b.php", "style.css", "assets/z.js", "assets/a.js", "readme.txt"]);
  assert.deepStrictEqual(out, ["assets/a.js", "assets/z.js", "inc/b.php", "readme.txt", "style.css"]);
});

test("pinned file first at root", () => {
  assert.deepStrictEqual(orderPaths(["a.php", "inc/x.php", "zz.php"], "zz.php"), ["zz.php", "inc/x.php", "a.php"]);
});

test("pin ignored when not a root file in the list", () => {
  const plain = ["inc/x.php", "a.php"];
  assert.deepStrictEqual(orderPaths(plain, "inc/x.php"), ["inc/x.php", "a.php"]);
  assert.deepStrictEqual(orderPaths(plain, "missing.php"), ["inc/x.php", "a.php"]);
  assert.deepStrictEqual(orderPaths(["b.php", "a.php"], "inc/x.php"), ["a.php", "b.php"]);
});

test("buildTree pins header file first", () => {
  const tree = buildTree([{ path: "a.php" }, { path: "inc/x.php" }, { path: "style.css" }], "style.css");
  assert.deepStrictEqual(tree.map((n) => n.path), ["style.css", "inc", "a.php"]);
});

test("buildTree nests any depth", () => {
  const tree = buildTree([{ path: "inc/deep/x.md" }]);
  assert.strictEqual(tree.length, 1);
  assert.strictEqual(tree[0].type, "dir");
  assert.strictEqual(tree[0].path, "inc");
  const deep = tree[0].children[0];
  assert.strictEqual(deep.type, "dir");
  assert.strictEqual(deep.path, "inc/deep");
  const file = deep.children[0];
  assert.strictEqual(file.type, "file");
  assert.strictEqual(file.name, "x.md");
  assert.strictEqual(file.icon, "📄");
  assert.strictEqual(file.entry.path, "inc/deep/x.md");
});

test("buildTree survives __proto__ names", () => {
  const tree = buildTree([{ path: "__proto__/a.md" }, { path: "__proto__" + "/__proto__" }]);
  assert.strictEqual(tree[0].name, "__proto__");
  assert.strictEqual(tree[0].children.length, 2);
  for (const key of ["name", "path", "children", "dirs", "files", "entry", "icon"]) {
    assert.ok(!Object.hasOwn(Object.prototype, key), key);
  }
});

test("iconFor", () => {
  assert.strictEqual(iconFor("scripts/validate.py"), "🐍");
  assert.strictEqual(iconFor("main.php"), "🐘");
  assert.strictEqual(iconFor("init.sh"), "⚙️");
  assert.strictEqual(iconFor("a.js"), "📜");
  assert.strictEqual(iconFor("a.yml"), "🧾");
  assert.strictEqual(iconFor("a.PNG"), "🖼️");
  assert.strictEqual(iconFor("a.md"), "📄");
});
