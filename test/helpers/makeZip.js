const zlib = require("zlib");

const MODE_FILE = 0o100644;
const MODE_SYMLINK = 0o120777;
const MODE_DIR = 0o040755;

const makeZip = (entries) => {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const data = e.dir
      ? Buffer.alloc(0)
      : Buffer.isBuffer(e.data)
        ? e.data
        : Buffer.from(e.data || "", "utf8");
    const crc = zlib.crc32(data);
    const declared = e.declaredSize === undefined ? data.length : e.declaredSize;
    const extra = e.extra || Buffer.alloc(0);
    const mode = e.dir ? MODE_DIR : e.symlink ? MODE_SYMLINK : MODE_FILE;

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0x21, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(declared, 18);
    lh.writeUInt32LE(declared, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(extra.length, 28);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(0x031e, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0x21, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(declared, 20);
    ch.writeUInt32LE(declared, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt16LE(extra.length, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(((mode << 16) >>> 0), 38);
    ch.writeUInt32LE(offset, 42);

    locals.push(lh, name, extra, data);
    centrals.push(ch, name, extra);
    offset += lh.length + name.length + extra.length + data.length;
  }

  const central = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, central, eocd]);
};

module.exports = { makeZip };
