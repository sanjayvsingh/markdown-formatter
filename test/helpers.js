// Shared test helpers: load the real app into jsdom with the browser APIs it
// needs stubbed, and read back the .docx zips it produces.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { JSDOM } = require("jsdom");

const APP_DIR = path.join(__dirname, "..");
const SCRIPTS = ["theme.js", "marked.min.js", "purify.min.js", "docx.js", "app.js"];

// Options: input (Markdown), settings (partial settings object), theme
// ("light"/"dark" saved choice).
async function loadApp(opts = {}) {
  // Scripts are run by hand below, so strip the tags that would fetch them.
  const html = fs.readFileSync(path.join(APP_DIR, "index.html"), "utf8")
    .replace(/<script[^>]*><\/script>/g, "");
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "http://localhost/" });
  const w = dom.window;

  if (opts.settings) w.localStorage.setItem("mdformatter.settings.v1", JSON.stringify(opts.settings));
  if (opts.input !== undefined) w.localStorage.setItem("mdformatter.input.v1", opts.input);
  if (opts.theme) w.localStorage.setItem("mdformatter.theme.v1", opts.theme);

  // jsdom has no layout, so no innerText; textContent is close enough here.
  Object.defineProperty(w.HTMLElement.prototype, "innerText", { get() { return this.textContent; } });
  w.Blob = Blob;
  w.TextEncoder = TextEncoder;

  const clipboard = { html: null, text: null };
  w.ClipboardItem = class { constructor(data) { this.data = data; } };
  Object.defineProperty(w.navigator, "clipboard", {
    value: {
      async write(items) {
        clipboard.html = await items[0].data["text/html"].text();
        clipboard.text = await items[0].data["text/plain"].text();
      },
      async writeText(t) { clipboard.text = t; }
    }
  });

  // Downloads: remember the blob behind each object URL, and record anchor
  // clicks instead of letting jsdom try to navigate.
  const downloads = [];
  const blobs = new Map();
  let nextUrl = 0;
  w.URL.createObjectURL = (blob) => { const u = "blob:test/" + nextUrl++; blobs.set(u, blob); return u; };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () {
    downloads.push({ name: this.download, blob: blobs.get(this.href) });
  };

  for (const f of SCRIPTS) w.eval(fs.readFileSync(path.join(APP_DIR, f), "utf8"));
  // jsdom fires DOMContentLoaded after construction, unlike a browser running
  // these scripts mid-parse, so wait for it before handing the page over.
  if (w.document.readyState === "loading") {
    await new Promise((r) => w.document.addEventListener("DOMContentLoaded", r));
  }

  const $ = (id) => w.document.getElementById(id);
  return { window: w, document: w.document, $, clipboard, downloads };
}

// Lets pending promises (clipboard writes) settle.
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

// Reads a stored (uncompressed) zip, checking each entry's CRC.
function unzip(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const end = buf.length - 22;
  if (view.getUint32(end, true) !== 0x06054b50) throw new Error("no end-of-central-directory record");
  const count = view.getUint16(end + 10, true);
  let p = view.getUint32(end + 16, true);
  const files = {};
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error("bad central directory entry");
    const method = view.getUint16(p + 10, true);
    const crc = view.getUint32(p + 16, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    if (method !== 0) throw new Error(name + ": expected stored entry");
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = buf.subarray(start, start + size);
    if (zlib.crc32(data) !== crc) throw new Error(name + ": CRC mismatch");
    files[name] = data.toString("utf8");
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

// Parses XML, throwing if it isn't well-formed (Word rejects such files).
function parseXml(window, xml, name) {
  const doc = new window.DOMParser().parseFromString(xml, "application/xml");
  const err = doc.getElementsByTagName("parsererror")[0];
  if (err) throw new Error((name || "xml") + " is not well-formed: " + err.textContent);
  return doc;
}

async function docxFiles(blob) {
  return unzip(Buffer.from(await blob.arrayBuffer()));
}

module.exports = { loadApp, tick, unzip, parseXml, docxFiles };
