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
import re
import secrets
import sys
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
MAX_AUDIO = 16000 * 2 * 12  # mono PCM16, 16 kHz, at most 12 seconds
MAX_QA_BYTES = 24000
MAX_QA_TEXT = 12000
MAX_QA_WORDS = 99


def chat_content(payload):
    choices = payload.get('choices') if isinstance(payload, dict) else None
    message = choices[0].get('message') if choices and isinstance(choices[0], dict) else None
    content = message.get('content') if isinstance(message, dict) else None
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        chunks = []
        for part in content:
            if isinstance(part, str):
                chunks.append(part)
            elif isinstance(part, dict) and isinstance(part.get('text'), str):
                chunks.append(part['text'])
        return ''.join(chunks)
    return ''


def limit_qa_words(value, maximum=MAX_QA_WORDS):
    """Keep the organizer display below the documented word budget."""
    words = re.findall(r'\S+', value.strip())
    if len(words) <= maximum:
        return value.strip()
    return ' '.join(words[:maximum]).rstrip(' ,;:') + '…'


def organize_qa(text, model=None, api_key=None, base_url=None):
    """Organize a presenter-repeated question and answer through DashScope."""
    key = (api_key or os.environ.get('DASHSCOPE_API_KEY') or
           os.environ.get('PIGEON_QA_API_KEY') or os.environ.get('OPENAI_API_KEY'))
    if not key:
        raise RuntimeError('Q&A organizer is unavailable; set DASHSCOPE_API_KEY or enter a key in the Voice window')
    base = (base_url or os.environ.get('DASHSCOPE_BASE_URL') or
            os.environ.get('PIGEON_QA_BASE_URL') or
            os.environ.get('OPENAI_BASE_URL') or
            'https://dashscope.aliyuncs.com/compatible-mode/v1')
    model = (model or os.environ.get('PIGEON_QA_MODEL') or
             os.environ.get('DASHSCOPE_MODEL') or os.environ.get('OPENAI_MODEL') or
             'qwen3.7-flash')
    if not isinstance(model, str) or not model.strip() or len(model) > 120:
        raise ValueError('Invalid Q&A model')
    prompt = (
        'Identify the audience question and the presenter answer in the supplied transcript. '
        'Rewrite them as a concise response that directly addresses the question. Use one to three '
        'Markdown bullet points when that improves clarity, and keep the total response under 100 '
        'words. Remove verbal filler, preserve uncertainty or incomplete answers, and never invent '
        'facts. Return only the final Markdown response; do not add a preamble or JSON wrapper.'
    )
    body = {
        'model': model.strip(),
        'messages': [
            {'role': 'system', 'content': prompt},
            {'role': 'user', 'content': text},
        ],
        'temperature': 0.2,
        'max_tokens': 180,
    }
    endpoint = base.rstrip('/') + '/chat/completions'
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
    organized = chat_content(payload).strip()
    if not organized:
        raise RuntimeError('Q&A model returned no organized response')
    return limit_qa_words(organized)[:MAX_QA_TEXT]


def save_qa_transcript(root, item_id, text):
    """Save raw Q&A text in a hidden, non-public deck-local directory."""
    safe_id = re.sub(r'[^A-Za-z0-9_-]+', '-', str(item_id or 'item')).strip('-_')[:48] or 'item'
    folder = root / '.qa-transcripts'
    folder.mkdir(mode=0o700, exist_ok=True)
    stamp = time.strftime('%Y%m%d-%H%M%S', time.localtime())
    path = folder / f'qa-{stamp}-{safe_id}-{secrets.token_hex(5)}.txt'
    path.write_text(text, encoding='utf-8')
    try:
        path.chmod(0o600)
    except OSError:
        pass
    return path.relative_to(root).as_posix()


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
            raw_file = None
            try:
                payload = json.loads(self.rfile.read(length))
                text = payload.get('text') if isinstance(payload, dict) else None
                model = payload.get('model') if isinstance(payload, dict) else None
                item_id = payload.get('id') if isinstance(payload, dict) else None
                if not isinstance(text, str) or not text.strip() or len(text) > MAX_QA_TEXT:
                    raise ValueError('Q&A transcript must be a nonempty bounded string')
                raw_file = save_qa_transcript(self.server.root, item_id, text.strip())
                configured_model = self.server.qa_config.get('model')
                manual_key = self.headers.get('X-Pigeon-QA-Key', '').strip() or None
                paragraph = organize_qa(text.strip(), model or configured_model, api_key=manual_key)
                self.json(200, {'paragraph': paragraph, 'rawFile': raw_file})
            except (ValueError, RuntimeError, OSError) as error:
                result = {'error': str(error)}
                if raw_file:
                    result['rawFile'] = raw_file
                self.json(503 if isinstance(error, RuntimeError) else 400, result)
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
