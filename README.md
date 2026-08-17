# Markdown Formatter

A single-page tool that renders pasted Markdown (or plain text) to styled HTML, with independent font, size, and color controls for headings, body text, and code — built to replace clunky online converters whose font choices get in the way.

Two use cases drove the design:

- **Formatted emails** — "Copy Rich Text" copies the rendered content to your clipboard with fonts/colors baked in as inline styles, which is what survives pasting into Gmail, Outlook, etc.
- **Push to Kindle** — the fullscreen preview (⤢) gives a clean, distraction-free reading view.

No backend required. It's a static page — paste Markdown, get styled HTML, copy or download it.

## Features

- Live Markdown preview (via [marked](https://github.com/markedjs/marked))
- Separate font family + size for headings, body text, and monospace/code
- Optional text and background colors per category, each with an **Automatic** toggle — when on, no color is applied at all, so the destination (email client, dark mode, Kindle) uses its own default instead of a forced color
- Draggable divider to resize the input/preview split
- Fullscreen preview modal
- All settings and your last input persist in the browser (`localStorage`) — nothing is sent anywhere
- Copy as rich text, copy raw HTML source, or download as a standalone `.html` file

## Running it

It's fully static — any web server works. A hardened one is included:

```
python serve.py [port]   # defaults to 8000, binds 127.0.0.1
```

`serve.py` uses only the Python standard library, so it runs with no extra dependencies, and attaches security headers (CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`) to every response. If you're fronting this with your own server (nginx, Apache, Flask, etc.) instead, port the `HEADERS` dict at the top of `serve.py` into that config.

The Clipboard API that "Copy Rich Text" depends on requires a secure context — serve over HTTPS (or `localhost`) for it to work.

## Files

```
index.html       — structure
styles.css        — all styling
app.js            — application logic
marked.min.js     — Markdown parser (vendored, MIT)
purify.min.js     — DOMPurify, sanitizes rendered HTML before display (vendored, Apache-2.0/MPL-2.0)
serve.py          — static file server with security headers
```

Third-party libraries are vendored locally rather than loaded from a CDN, so the app has no runtime dependency on any external host.

## Security notes

- All rendered Markdown is passed through [DOMPurify](https://github.com/cure53/DOMPurify) before touching the DOM.
- Links with `target="_blank"` (from raw HTML in pasted Markdown) automatically get `rel="noopener noreferrer"` forced onto them.
- No login, no server-side state, no database — the only persistence is `localStorage` in your own browser.
