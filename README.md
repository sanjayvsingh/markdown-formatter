# Markdown Formatter

A single-page tool that renders pasted Markdown (or plain text) to styled HTML, with independent font, size, and color controls for headings, body text, and code — built to replace clunky online converters whose font choices get in the way.

Two use cases drove the design:

- **Formatted emails** — "Copy Rich Text" copies the rendered content to your clipboard with fonts/colors baked in as inline styles, which is what survives pasting into Gmail, Outlook, etc.
- **Push to Kindle** — the fullscreen preview (the expand icon on the Preview pane) gives a clean, distraction-free reading view.

No backend required. It's a static page — paste Markdown, get styled HTML, copy it, or download it as HTML or a Word document.

## Features

- Live Markdown preview (via [marked](https://github.com/markedjs/marked))
- Separate font family + size for headings, body text, and monospace/code
- Optional text and background colors per category, each with an **Automatic** toggle — when on, no color is applied at all, so the destination (email client, dark mode, Kindle) uses its own default instead of a forced color
- Draggable divider to resize the input/preview split
- Fullscreen preview modal
- Dark mode: Settings → Theme offers System (follows your system's light/dark setting; the default), Light or Dark, remembered in this browser. Copied, downloaded and printed output always uses your chosen colors, never the dark theme.
- All settings and your last input persist in the browser (`localStorage`) — nothing is sent anywhere
- Copy as rich text, copy as unformatted text, or copy the raw HTML source
- Download buttons (icons in the header): a Word `.docx` file or a standalone `.html` file. The Word file is built in the browser and keeps your fonts, sizes and colors; headings and lists become real Word headings and lists, and links stay clickable. Images are not embedded (their alt text is kept).
- Three ways to load Markdown besides typing: the **Paste** icon replaces the input with the clipboard, the **Open** icon picks a `.md` file from your computer, or drag a file onto the input pane. Files are read in the browser and never uploaded. Ctrl+Z undoes a paste or load.
  - Browsers guard clipboard reads: Chrome and Edge ask for permission once per site, then Paste works in one click; Firefox and Safari show a small "Paste" confirmation every time, which a page can't skip. Ctrl+V into the input always works.
- Hover the Markdown input for a copy button that copies the raw source
- Hover any code block, inline code or quote in the preview to get a copy button for just that part (a quote is copied without its quote formatting)
- **Clean up** (the magic-wand icon, set apart to the right of Paste and Open) tidies Markdown copied out of a terminal or chat:
  - strips trailing padding, which Markdown would turn into `<br>`
  - removes each block's indentation, which would otherwise turn text into code blocks; a list item's second paragraph stays under its item
  - collapses runs of spaces inside a line
  - rejoins lines the terminal hard-wrapped, or that were broken mid-sentence (spotted by the next line being indented)
  - trims blank lines and whitespace from the start and end
  - puts text bar charts (two or more lines of `█` and `░` bars) in a code block, so they keep their line breaks and alignment

  Fenced code and inline code are left alone, and Ctrl+Z undoes it.

## Running it

It's fully static — any web server works. A hardened one is included:

```
python serve.py [port]   # defaults to 8000, binds 127.0.0.1
```

`serve.py` uses only the Python standard library, so it runs with no extra dependencies, and attaches security headers (CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`) to every response. If you're fronting this with your own server (nginx, Apache, Flask, etc.) instead, port the `HEADERS` dict at the top of `serve.py` into that config.

The Clipboard API that "Copy Rich Text" and **Paste** depend on requires a secure context — serve over HTTPS (or `localhost`) for them to work.

Pasting into Word: if fonts and colors disappear, Word is set to merge pasted text with the document's formatting. Choose **Keep Source Formatting** from the paste options, or set it as the default under File → Options → Advanced → *Pasting from other programs*.

## Tests

Automated tests use Node's built-in test runner, with [jsdom](https://github.com/jsdom/jsdom) standing in for the browser. They need Node 22.22.2+ or 24.15+ (what the current jsdom supports):

```
npm install   # once, installs jsdom
npm test
```

`test/app.test.js` loads the real page and covers rendering and sanitizing, the copy buttons, pasting and opening files, Clean up, both downloads, settings and the theme setting. `test/docx.test.js` unzips the Word file and checks every part is well-formed XML with the expected headings, lists, links, tables and styles. Node and jsdom are only needed for testing; the app itself has no build step or dependencies.

## Files

```
index.html       — structure
styles.css        — all styling, including the dark theme
theme.js          — light/dark theme switching (loaded early to avoid a flash of the wrong theme)
app.js            — application logic
marked.min.js     — Markdown parser, marked 18.1.2 (vendored from the package's lib/marked.umd.js, MIT)
purify.min.js     — DOMPurify 3.4.17, sanitizes rendered HTML before display (vendored, Apache-2.0/MPL-2.0)
docx.js           — builds the Word download in the browser (no dependencies)
serve.py          — static file server with security headers
test/             — automated tests (not needed to run the app)
package.json      — test runner setup (not needed to run the app)
```

Third-party libraries are vendored locally rather than loaded from a CDN, so the app has no runtime dependency on any external host. To update one, replace the file with the new release (checking it matches the npm package), compare the rendered output before and after, and run `npm test`.

The Word, HTML, settings, fullscreen, paste, open and clean-up icons are from [Font Awesome Free](https://fontawesome.com) 7.3.1 ([CC BY 4.0](https://fontawesome.com/license/free)), inlined as SVG in `index.html`.

## Security notes

- All rendered Markdown is passed through [DOMPurify](https://github.com/cure53/DOMPurify) before touching the DOM.
- Links with `target="_blank"` (from raw HTML in pasted Markdown) automatically get `rel="noopener noreferrer"` forced onto them.
- No login, no server-side state, no database — the only persistence is `localStorage` in your own browser.
