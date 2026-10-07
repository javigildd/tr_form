#!/usr/bin/env python3
"""Local dev server for the Request Form Power-Up preview.
Serves this folder and wraps preview.html (artifact format, no <html> skeleton) in a full document at /."""
import http.server, os, sys
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
ROOT = os.path.dirname(os.path.abspath(__file__))
SKELETON = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1"></head><body>{}</body></html>')

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def do_GET(self):
        if self.path.split('?')[0] in ('/', '/preview.html'):
            with open(os.path.join(ROOT, 'preview.html'), encoding='utf-8') as f: body = SKELETON.format(f.read()).encode()
            self.send_response(200); self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body))); self.send_header('Cache-Control', 'no-store'); self.end_headers()
            self.wfile.write(body); return
        return super().do_GET()
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()
    def log_message(self, *a): pass

print(f'Request Form preview: http://localhost:{PORT}/  (Ctrl+C to stop)')
http.server.ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
