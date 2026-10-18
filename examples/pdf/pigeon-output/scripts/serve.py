#!/usr/bin/env python3
"""Serve only the distributable presentation files on loopback."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse

ROOT=Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
    def allowed(self):
        from urllib.parse import unquote, urlsplit
        path=unquote(urlsplit(self.path).path)
        resolved=(ROOT/path.lstrip('/')).resolve()
        return resolved.is_relative_to(ROOT) and (path in ['/', '/index.html','/styles.css','/favicon.ico'] or any(resolved.is_relative_to(ROOT/part) for part in ['src','public']))
    def do_GET(self):
        if not self.allowed(): self.send_error(404); return
        return super().do_GET()
    def do_HEAD(self):
        if not self.allowed(): self.send_error(404); return
        return super().do_HEAD()

if __name__=='__main__':
    p=argparse.ArgumentParser(); p.add_argument('--port',type=int,default=8765); args=p.parse_args()
    server=ThreadingHTTPServer(('127.0.0.1',args.port),partial(Handler,directory=str(ROOT)))
    print(f'Open http://127.0.0.1:{args.port} in Safari or Firefox. Press Ctrl+C to stop.',flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: server.server_close()
