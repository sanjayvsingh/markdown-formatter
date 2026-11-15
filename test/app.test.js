const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { loadApp, tick } = require("./helpers");

const CUSTOM = {
  headingFont: "Palatino Linotype", headingSize: 30,
  bodyFont: "Comic Sans MS", bodySize: 18,
  monoFont: "Courier New", monoSize: 13,
  headingFg: "#aa0000", headingFgAuto: false,
  bodyFg: "#0000aa", bodyFgAuto: false
};

describe("rendering", () => {
  test("renders Markdown and titles the tab after the first heading", async () => {
    const { $, document } = await loadApp({ input: "# My Notes\n\nSome **bold** text." });
    assert.equal($("preview").querySelector("h1").textContent, "My Notes");
    assert.equal($("preview").querySelector("strong").textContent, "bold");
    assert.equal(document.title, "My Notes");
  });

  test("falls back to the app name when there is no heading", async () => {
    const { document } = await loadApp({ input: "just text" });
    assert.equal(document.title, "Markdown Formatter");
  });

  test("sanitizes scripts and event handlers in pasted HTML", async () => {
    const { $ } = await loadApp({ input: '<script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">' });
    assert.equal($("preview").querySelector("script"), null);
    assert.equal($("preview").querySelector("img").hasAttribute("onerror"), false);
  });

  test("forces rel=noopener on links that open a new tab", async () => {
    const { $ } = await loadApp({ input: '<a href="https://example.com" target="_blank">x</a>' });
    assert.equal($("preview").querySelector("a").getAttribute("rel"), "noopener noreferrer");
  });

  test("re-renders after typing", async () => {
    const { $, window } = await loadApp({ input: "" });
    $("mdInput").value = "## Typed";
    $("mdInput").dispatchEvent(new window.Event("input"));
    await tick(200);
    assert.equal($("preview").querySelector("h2").textContent, "Typed");
  });
});

describe("copying", () => {
  test("Copy Rich Text bakes the chosen fonts and colours into inline styles", async () => {
    const { $, clipboard } = await loadApp({ input: "# Title\n\nBody `code`", settings: CUSTOM });
    $("btnCopyRich").click();
    await tick();
    // Multi-word font names may be quoted, which shows as &quot; inside the attribute.
    const q = '(?:"|&quot;)?';
    const h1 = clipboard.html.match(/<h1 style="([^"]*)"/)[1];
    assert.match(h1, new RegExp("font-family: " + q + "Palatino Linotype" + q));
    assert.match(h1, /font-size: 30px/);
    assert.match(h1, /color: rgb\(170, 0, 0\)/);
    const p = clipboard.html.match(/<p style="([^"]*)"/)[1];
    assert.match(p, new RegExp("font-family: " + q + "Comic Sans MS" + q));
    assert.match(p, /color: rgb\(0, 0, 170\)/);
    assert.match(clipboard.html, new RegExp("<code style=\"[^\"]*font-family: " + q + "Courier New"));
    assert.match(clipboard.text, /Title/);
  });

  test("Copy Rich Text leaves colours out when they are set to Auto", async () => {
    const { $, clipboard } = await loadApp({ input: "# Title\n\nBody" });
    $("btnCopyRich").click();
    await tick();
    assert.doesNotMatch(clipboard.html, /[^-]color:/);
    assert.doesNotMatch(clipboard.html, /background-color:/);
  });

  test("Copy Unformatted copies text without Markdown syntax", async () => {
    const { $, clipboard } = await loadApp({ input: "# Title\n\nSome **bold** text" });
    $("btnCopyUnformatted").click();
    await tick();
    assert.doesNotMatch(clipboard.text, /[#*]/);
    assert.match(clipboard.text, /Some bold text/);
  });

  test("Copy HTML Source copies a full document with an escaped title", async () => {
    const { $, clipboard } = await loadApp({ input: "# Fish & Chips \"Deluxe\"" });
    $("btnCopySource").click();
    await tick();
    assert.match(clipboard.text, /^<!doctype html>/);
    assert.match(clipboard.text, /<title>Fish &amp; Chips &quot;Deluxe&quot;<\/title>/);
  });

  test("the Markdown input's copy button copies the raw source", async () => {
    const { $, clipboard } = await loadApp({ input: "# Raw **md**" });
    $("btnCopyMd").click();
    await tick();
    assert.equal(clipboard.text, "# Raw **md**");
  });

  test("the Markdown copy button sits inside the input, not the pane header", async () => {
    const { $ } = await loadApp();
    assert.equal($("btnCopyMd").parentElement, $("mdInput").parentElement);
    assert.equal($("btnCopyMd").closest(".pane-label"), null);
  });
});

describe("loading input", () => {
  test("Paste replaces the input with the clipboard and renders it", async () => {
    const { $, clipboard } = await loadApp({ input: "old text" });
    clipboard.text = "# From the clipboard";
    $("btnPaste").click();
    await tick();
    assert.equal($("mdInput").value, "# From the clipboard");
    assert.equal($("preview").querySelector("h1").textContent, "From the clipboard");
  });

  test("Paste leaves the input alone when the clipboard is empty", async () => {
    const { $ } = await loadApp({ input: "keep me" });
    $("btnPaste").click();
    await tick();
    assert.equal($("mdInput").value, "keep me");
    assert.match($("copyStatus").textContent, /empty/);
  });

  test("Paste suggests Ctrl+V when clipboard access is refused", async () => {
    const { $, clipboard } = await loadApp({ input: "keep me" });
    clipboard.text = "secret";
    clipboard.denyRead = true;
    $("btnPaste").click();
    await tick();
    assert.equal($("mdInput").value, "keep me");
    assert.match($("copyStatus").textContent, /Ctrl\+V/);
  });

  // jsdom can't drive a real file dialog, so hand the input its files directly.
  function chooseFile(window, input, file) {
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new window.Event("change"));
  }

  test("Open opens the file picker", async () => {
    const { $ } = await loadApp();
    let opened = false;
    $("fileInput").click = () => { opened = true; };
    $("btnOpenFile").click();
    assert.ok(opened);
  });

  test("a chosen .md file is read into the input", async () => {
    const { $, window } = await loadApp({ input: "old" });
    chooseFile(window, $("fileInput"), new window.File(["# From a file"], "notes.md"));
    await tick(50);
    assert.equal($("mdInput").value, "# From a file");
    assert.equal($("preview").querySelector("h1").textContent, "From a file");
    assert.match($("copyStatus").textContent, /Loaded notes\.md/);
  });

  test("a file the OS launches the installed app with is read into the input", async () => {
    let consumer;
    const { $, window } = await loadApp({
      input: "old",
      before(w) { w.launchQueue = { setConsumer(fn) { consumer = fn; } }; }
    });
    const file = new window.File(["# Double-clicked"], "report.md");
    consumer({ files: [{ getFile: async () => file }] });
    await tick(50);
    assert.equal($("mdInput").value, "# Double-clicked");
    assert.match($("copyStatus").textContent, /Loaded report\.md/);

    // A plain launch (no file) leaves the input alone.
    consumer({ files: [] });
    await tick(50);
    assert.equal($("mdInput").value, "# Double-clicked");
  });

  test("the manifest registers Markdown file types and has install icons", () => {
    const fs = require("fs"), path = require("path");
    const dir = path.join(__dirname, "..");
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
    assert.ok(manifest.file_handlers[0].accept["text/markdown"].includes(".md"));
    for (const icon of manifest.icons) assert.ok(fs.existsSync(path.join(dir, icon.src)), icon.src);
    assert.match(fs.readFileSync(path.join(dir, "index.html"), "utf8"), /rel="manifest" href="manifest\.json"/);
  });

  function assertAtTop(input) {
    assert.equal(input.selectionStart, 0);
    assert.equal(input.selectionEnd, 0);
    assert.equal(input.scrollTop, 0);
  }

  test("the cursor starts at the top after Paste, Open and Clean up", async () => {
    const { $, clipboard, window } = await loadApp({ input: "old" });
    clipboard.text = "# Pasted\n\ntext";
    $("btnPaste").click();
    await tick();
    assertAtTop($("mdInput"));

    chooseFile(window, $("fileInput"), new window.File(["# From a file\n\ntext"], "notes.md"));
    await tick(50);
    assertAtTop($("mdInput"));

    $("mdInput").value = "  indented text  ";
    $("btnCleanup").click();
    assertAtTop($("mdInput"));
  });

  // jsdom doesn't perform a paste, so fire the event and then change the value.
  async function nativePaste(window, input, text, cursor) {
    input.dispatchEvent(new window.Event("paste"));
    input.value = text;
    input.setSelectionRange(cursor, cursor);
    await tick();
  }

  test("Ctrl+V over the whole input moves the cursor to the top", async () => {
    const { $, window } = await loadApp({ input: "old" });
    $("mdInput").select();
    await nativePaste(window, $("mdInput"), "# New document", 14);
    assertAtTop($("mdInput"));
  });

  test("Ctrl+V into existing text keeps the cursor where it lands", async () => {
    const { $, window } = await loadApp({ input: "old text" });
    $("mdInput").setSelectionRange(3, 3);
    await nativePaste(window, $("mdInput"), "old pasted text", 10);
    assert.equal($("mdInput").selectionStart, 10);
  });

  test("a chosen file that isn't Markdown is rejected", async () => {
    const { $, window } = await loadApp({ input: "old" });
    chooseFile(window, $("fileInput"), new window.File(["x"], "photo.png", { type: "image/png" }));
    await tick(50);
    assert.equal($("mdInput").value, "old");
    assert.match($("copyStatus").textContent, /Not a Markdown file/);
  });
});

describe("Clean up", () => {
  async function cleanUp(input) {
    const app = await loadApp({ input });
    app.$("btnCleanup").click();
    return app.$("mdInput").value;
  }

  test("removes trailing spaces and shared indentation", async () => {
    assert.equal(await cleanUp("  # Title   \n  Some text  \n  more"), "# Title\nSome text\nmore");
  });

  test("rejoins lines a terminal hard-wrapped", async () => {
    const wrapped =
      "This is a long sentence that the terminal wrapped at its width so it\n" +
      "continues on this line.\n\n" +
      "A short one.";
    assert.equal(await cleanUp(wrapped),
      "This is a long sentence that the terminal wrapped at its width so it continues on this line.\n\n" +
      "A short one.");
  });

  test("rejoins a stray break in a long paragraph, marked by an indented next line", async () => {
    const long = "A paragraph far wider than any terminal. ".repeat(8) + "It breaks after";
    assert.equal(await cleanUp("Intro.\n\n" + long + "\n the next word.\n\nThanks,\nMe"),
      "Intro.\n\n" + long + " the next word.\n\nThanks,\nMe");
  });

  test("collapses runs of spaces inside a line but not in inline code", async () => {
    assert.equal(await cleanUp("cutting noise, but     our teams `a  b`"), "cutting noise, but our teams `a  b`");
  });

  test("never joins a line onto a heading, a table row, or into a new list item", async () => {
    const md = "# Title\n  indented text\n\n| a | b |\n  more\n\nsome text\n  - a list item";
    assert.equal(await cleanUp(md), "# Title\nindented text\n\n| a | b |\n  more\n\nsome text\n  - a list item");
  });

  test("removes each block's own indentation, as in a copied terminal reply", async () => {
    assert.equal(await cleanUp("● Reply\n\n  Why it happens:\n  - one\n  - two\n\n  What to do:\n  - three"),
      "● Reply\n\nWhy it happens:\n- one\n- two\n\nWhat to do:\n- three");
  });

  test("keeps a list item's second paragraph under the item", async () => {
    const md = "- item\n\n  more about the item\n\nAfter the list.";
    assert.equal(await cleanUp(md), md);
    assert.equal(await cleanUp("  - item\n\n    more about it"), "- item\n\n  more about it");
  });

  test("trims blank lines and whitespace from the start and end", async () => {
    assert.equal(await cleanUp("\n\n  \nText here.\n\n  \n"), "Text here.");
  });

  test("fences text bar charts, keeping their titles and alignment", async () => {
    const md =
      "Work Type:\n  Write Docs   ████░░░░  50%\n  Debug Fix    ██░░░░░░  25%\n\n" +
      "Tools:\n  chrome    ████  257 calls\n  rovo      ██░░  141 calls\nAfter.";
    const out = await cleanUp(md);
    assert.equal(out,
      "Work Type:\n\n```\nWrite Docs   ████░░░░  50%\nDebug Fix    ██░░░░░░  25%\n```\n\n" +
      "Tools:\n\n```\nchrome    ████  257 calls\nrovo      ██░░  141 calls\n```\n\nAfter.");
    assert.equal(await cleanUp(out), out);
  });

  test("leaves bars alone in tables and on a line of their own", async () => {
    const table = "| a | ████ |\n| b | ██░░ |";
    assert.equal(await cleanUp(table), table);
    const redacted = "The name ████ was removed.\nThe rest stayed.";
    assert.equal(await cleanUp(redacted), redacted);
  });

  test("leaves a bar chart that is already fenced alone", async () => {
    const md = "```\n  a  ████\n  b  ██░░\n```";
    assert.equal(await cleanUp(md), md);
  });

  test("leaves fenced code alone", async () => {
    const md =
      "Intro text that is long enough to set a width for the wrapping logic here.\n\n" +
      "```\nconst a = 1;\nconst b = 2;\n```";
    assert.equal(await cleanUp(md), md);
  });
});

describe("downloads", () => {
  test("Download HTML saves a standalone page named after the heading", async () => {
    const { $, downloads } = await loadApp({ input: "# Trip Notes!\n\ntext" });
    $("btnDownload").click();
    assert.equal(downloads.length, 1);
    assert.equal(downloads[0].name, "trip-notes.html");
    assert.match(await downloads[0].blob.text(), /^<!doctype html>/);
  });

  test("Download Word saves a .docx named after the heading", async () => {
    const { $, downloads } = await loadApp({ input: "# Trip Notes!\n\ntext" });
    $("btnDownloadWord").click();
    assert.equal(downloads[0].name, "trip-notes.docx");
    assert.equal(downloads[0].blob.type,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const bytes = Buffer.from(await downloads[0].blob.arrayBuffer());
    assert.equal(bytes.subarray(0, 2).toString(), "PK");
  });

  test("files without a heading are called document", async () => {
    const { $, downloads } = await loadApp({ input: "no heading" });
    $("btnDownload").click();
    $("btnDownloadWord").click();
    assert.deepEqual(downloads.map((d) => d.name), ["document.html", "document.docx"]);
  });
});

describe("settings", () => {
  test("changes are saved and survive a reload", async () => {
    const first = await loadApp({ input: "x" });
    first.$("bodySize").value = "21";
    first.$("bodySize").dispatchEvent(new first.window.Event("input"));
    const saved = first.window.localStorage.getItem("mdformatter.settings.v1");
    assert.equal(JSON.parse(saved).bodySize, 21);

    const second = await loadApp({ input: "x", settings: JSON.parse(saved) });
    assert.equal(second.$("bodySize").value, "21");
  });

  test("Reset restores the defaults", async () => {
    const { $ } = await loadApp({ input: "x", settings: CUSTOM });
    $("btnReset").click();
    assert.equal($("bodyFont").value, "Arial");
    assert.equal($("bodyFgAuto").checked, true);
  });
});

describe("theme", () => {
  function choose(app, value) {
    const radio = app.document.querySelector(`input[name="theme"][value="${value}"]`);
    radio.checked = true;
    radio.dispatchEvent(new app.window.Event("change"));
  }
  const checked = (app) => app.document.querySelector('input[name="theme"]:checked').value;

  test("defaults to following the system", async () => {
    const app = await loadApp();
    assert.equal(checked(app), "system");
    assert.equal(app.document.documentElement.hasAttribute("data-theme"), false);
  });

  test("choosing Dark or Light applies and remembers it", async () => {
    const app = await loadApp();
    choose(app, "dark");
    assert.equal(app.document.documentElement.getAttribute("data-theme"), "dark");
    assert.equal(app.window.localStorage.getItem("mdformatter.theme.v1"), "dark");
    choose(app, "light");
    assert.equal(app.document.documentElement.getAttribute("data-theme"), "light");
    assert.equal(app.window.localStorage.getItem("mdformatter.theme.v1"), "light");
  });

  test("choosing System clears the saved choice", async () => {
    const app = await loadApp({ theme: "dark" });
    choose(app, "system");
    assert.equal(app.document.documentElement.hasAttribute("data-theme"), false);
    assert.equal(app.window.localStorage.getItem("mdformatter.theme.v1"), null);
  });

  test("a saved choice is applied and shown on load", async () => {
    const app = await loadApp({ theme: "light" });
    assert.equal(app.document.documentElement.getAttribute("data-theme"), "light");
    assert.equal(checked(app), "light");
  });

  test("the theme lives in the Settings dialog, not the header", async () => {
    const { document } = await loadApp();
    assert.ok(document.querySelector("#settingsModal input[name=theme]"));
    assert.equal(document.getElementById("btnTheme"), null);
  });
});
