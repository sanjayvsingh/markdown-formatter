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

  test("the Markdown pane's copy button copies the raw source", async () => {
    const { $, clipboard } = await loadApp({ input: "# Raw **md**" });
    $("btnCopyMd").click();
    await tick();
    assert.equal(clipboard.text, "# Raw **md**");
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
