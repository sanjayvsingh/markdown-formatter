#!/usr/bin/env python3
"""Static file server for the Markdown Formatter app, with security headers attached.

Uses only the Python standard library (http.server), so it runs on any host
regardless of what extensions/packages are installed. If you're fronting this
with nginx/Apache/Flask instead, port the HEADERS dict below into that config
rather than running this script.

Usage:
    python serve.py [port]      # defaults to 8000, binds 127.0.0.1
"""

import sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data:; "
    "font-src 'self'; "
    "connect-src 'self'; "
    "base-uri 'none'; "
    "form-action 'none'; "
    "object-src 'none'; "
    "frame-ancestors 'none'"
)

HEADERS = {
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "clipboard-write=(self), clipboard-read=(self), geolocation=(), camera=(), microphone=()",
    # Only takes effect when served over HTTPS; browsers ignore it on plain HTTP.
    # Remove or adjust max-age if you're not ready to commit to HTTPS-only long-term.
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
}


class HardenedHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        for name, value in HEADERS.items():
            self.send_header(name, value)
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = ThreadingHTTPServer(("127.0.0.1", port), HardenedHandler)
    print(f"Serving on http://127.0.0.1:{port} (Ctrl+C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
