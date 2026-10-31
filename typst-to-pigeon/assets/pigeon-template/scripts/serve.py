#!/usr/bin/env python3
"""Presentation server and memory-only speech API, bound to loopback."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
import argparse
import hmac
import json
import os
import secrets
import sys
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
MAX_AUDIO = 16000 * 2 * 12  # mono PCM16, 16 kHz, at most 12 seconds
MAX_QA_BYTES = 24000
MAX_QA_TEXT = 12000


def response_text(payload):
    chunks = []
    for item in payload.get('output', []):
        for part in item.get('content', []):
            if part.get('type') == 'output_text' and isinstance(part.get('text'), str):
                chunks.append(part['text'])
    return ''.join(chunks) or payload.get('output_text', '')


def organize_qa(text, model=None):
    """Organize a presenter-repeated question and answer through an API key."""
    key = os.environ.get('PIGEON_QA_API_KEY') or os.environ.get('OPENAI_API_KEY')
    if not key:
        raise RuntimeError('Q&A organizer is unavailable; set PIGEON_QA_API_KEY or OPENAI_API_KEY')
    base = os.environ.get('PIGEON_QA_BASE_URL') or os.environ.get('OPENAI_BASE_URL', 'https://api.openai.com/v1')
    model = model or os.environ.get('PIGEON_QA_MODEL') or os.environ.get('OPENAI_MODEL', 'gpt-4.1-mini')
    if not isinstance(model, str) or not model.strip() or len(model) > 120:
        raise ValueError('Invalid Q&A model')
    prompt = (
        'Rewrite the supplied presenter transcript as one concise, self-contained paragraph. '
        'Preserve the audience question and the presenter answer, remove verbal filler, and do not '
        'invent facts. Return JSON only with one string field named paragraph. '
        'If the answer is incomplete, say so briefly rather than guessing.'
    )
    body = {
        'model': model.strip(),
        'instructions': prompt,
        'input': [{'role': 'user', 'content': [{'type': 'input_text', 'text': text}]}],
        'max_output_tokens': 500,
        'store': False,
    }
    if model.startswith(('gpt-5', 'gpt-6', 'o3', 'o4')):
        body['reasoning'] = {'effort': 'low'}
    endpoint = base.rstrip('/') + '/responses'
    request = urllib.request.Request(endpoint, data=json.dumps(body).encode('utf-8'), headers={
        'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as error:
        detail = ''
        try:
            payload = json.loads(error.read(65536))
            issue = payload.get('error', payload)
            if isinstance(issue, str):
                detail = issue
            elif isinstance(issue, dict):
                detail = '; '.join(str(issue.get(k)) for k in ('code', 'message') if issue.get(k))
        except (ValueError, AttributeError, TypeError):
            pass
        detail = ' '.join(detail.replace(key, '[redacted]').split())[:600]
        message = f'Q&A model provider returned HTTP {error.code}'
        if detail:
            message += f': {detail}'
        raise RuntimeError(message) from None
    except (urllib.error.URLError, TimeoutError) as error:
        raise RuntimeError(f'Q&A model provider is unreachable: {error}') from None
    text_value = response_text(payload).strip()
    if text_value.startswith('```'):
        text_value = text_value.strip('`').removeprefix('json').strip()
    try:
        result = json.loads(text_value)
    except json.JSONDecodeError:
        result = {'paragraph': text_value}
    paragraph = result.get('paragraph') if isinstance(result, dict) else None
    if not isinstance(paragraph, str) or not paragraph.strip():
        raise RuntimeError('Q&A model returned no paragraph')
    return paragraph.strip()[:MAX_QA_TEXT]


class Handler(SimpleHTTPRequestHandler):
    def trusted(self, require_origin=False):
        port = self.server.server_address[1]
        host = self.headers.get('Host', '')
        if host not in (f'127.0.0.1:{port}', f'localhost:{port}'):
            return False
        origin = self.headers.get('Origin')
        return origin == f'http://{host}' if require_origin or origin else True

    def allowed(self):
        path = unquote(urlsplit(self.path).path)
        root = self.server.root
        resolved = (root / path.lstrip('/')).resolve()
        return resolved.is_relative_to(root) and (path in ['/', '/index.html', '/styles.css', '/favicon.ico'] or
            any(resolved.is_relative_to(root / part) for part in ['src', 'public']))

    def json(self, status, value):
        body = json.dumps(value).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass  # A presenter may mute/navigate while inference finishes.

    def do_GET(self):
        if not self.trusted():
            self.send_error(403)
            return
        if urlsplit(self.path).path == '/api/voice/status':
            status = self.server.voice.status() if self.server.voice else {
                'available': False, 'state': 'unavailable',
                'detail': 'Local voice is not installed or is disabled. Run python3 scripts/setup_voice.py, then restart this server.'}
            self.json(200, dict(status, backend='whisper', token=self.server.voice_token))
            return
        if not self.allowed():
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        if not self.trusted():
            self.send_error(403)
        elif not self.allowed():
            self.send_error(404)
        else:
            super().do_HEAD()

    def do_POST(self):
        if not self.trusted(require_origin=True) or not hmac.compare_digest(
                self.headers.get('X-Pigeon-Voice-Token', ''), self.server.voice_token):
            self.json(403, {'error': 'Same-origin voice session required'})
            return
        path = urlsplit(self.path).path
        if path not in ('/api/voice/transcribe', '/api/qa/organize'):
            self.json(404, {'error': 'Unknown endpoint'})
            return
        if path == '/api/qa/organize':
            if self.server.qa_config.get('enabled', True) is not True:
                self.json(503, {'error': 'Q&A capture is disabled in this presentation'})
                return
            if self.headers.get('Content-Type') != 'application/json':
                self.json(415, {'error': 'Expected JSON Q&A transcript'})
                return
            try:
                length = int(self.headers.get('Content-Length', '0'))
            except ValueError:
                length = 0
            if not 2 <= length <= MAX_QA_BYTES or self.headers.get('Transfer-Encoding'):
                self.close_connection = True
                self.json(400, {'error': 'Q&A transcript is empty or too large'})
                return
            try:
                payload = json.loads(self.rfile.read(length))
                text = payload.get('text') if isinstance(payload, dict) else None
                model = payload.get('model') if isinstance(payload, dict) else None
                if not isinstance(text, str) or not text.strip() or len(text) > MAX_QA_TEXT:
                    raise ValueError('Q&A transcript must be a nonempty bounded string')
                configured_model = self.server.qa_config.get('model')
                paragraph = organize_qa(text.strip(), model or configured_model)
                self.json(200, {'paragraph': paragraph})
            except (ValueError, RuntimeError, OSError) as error:
                self.json(503 if isinstance(error, RuntimeError) else 400, {'error': str(error)})
            return
        if self.headers.get('Content-Type') != 'application/octet-stream':
            self.json(415, {'error': 'Expected mono PCM16 at 16000 Hz'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            length = 0
        if not 8000 <= length <= MAX_AUDIO or length % 2 or self.headers.get('Transfer-Encoding'):
            self.close_connection = True
            self.json(400, {'error': 'Audio must be 0.25–12 seconds of mono PCM16 at 16000 Hz'})
            return
        if not self.server.voice or not self.server.voice.status()['available']:
            self.json(503, {'error': 'Local speech worker unavailable; check /api/voice/status'})
            return
        self.connection.settimeout(10)
        try:
            pcm = self.rfile.read(length)
            if len(pcm) != length:
                raise ValueError('Incomplete audio')
            started = time.monotonic()
            text = self.server.voice.transcribe(pcm)
            self.json(200, {'text': text, 'durationMs': round((time.monotonic() - started) * 1000)})
        except BlockingIOError:
            self.json(429, {'error': 'Local speech worker busy'})
        except (ValueError, TimeoutError, OSError, RuntimeError) as error:
            self.json(503, {'error': str(error)})

    def log_message(self, format, *args):
        # Never log request bodies, transcripts or voice session tokens.
        if not self.path.startswith('/api/voice/'):
            super().log_message(format, *args)


def create_server(root=ROOT, port=8765, voice=None, qa=None):
    root = Path(root).resolve()
    server = ThreadingHTTPServer(('127.0.0.1', port), partial(Handler, directory=str(root)))
    server.root, server.voice, server.qa_config, server.voice_token = root, voice, qa or {}, secrets.token_urlsafe(32)
    server.daemon_threads = True
    return server


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--no-voice', action='store_true', help='Do not load the local speech worker')
    cache = Path(os.environ.get('PIGEON_VOICE_DIR', Path.home() / '.cache/pigeon-voice'))
    parser.add_argument('--voice-helper', type=Path, default=cache / 'build/bin/pigeon-whisper')
    parser.add_argument('--voice-model', type=Path, default=cache / 'ggml-base.en.bin')
    parser.add_argument('--voice-threads', type=int, default=4)
    args = parser.parse_args()
    manifest_file = ROOT / 'public/deck/manifest.json'
    manifest = json.loads(manifest_file.read_text()) if manifest_file.exists() else {}
    config = manifest.get('voice', {})
    qa_config = manifest.get('qa', {})
    worker = None
    if not args.no_voice and config.get('enabled', True) and config.get('backend', 'whisper') != 'browser':
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from voice_worker import VoiceWorker
        worker = VoiceWorker(args.voice_helper, args.voice_model, language=config.get('lang', 'en-US').split('-')[0].lower(),
                             threads=max(1, min(16, args.voice_threads)))
        worker.start()
        print('Local voice:', worker.status().get('detail', worker.status()['state']), flush=True)
    server = create_server(port=args.port, voice=worker, qa=qa_config)
    print(f'Open http://127.0.0.1:{args.port} in Chrome. Press Ctrl+C to stop.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        if worker:
            worker.close()


if __name__ == '__main__':
    main()
