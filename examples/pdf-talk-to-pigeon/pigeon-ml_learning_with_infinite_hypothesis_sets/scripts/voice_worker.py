"""One persistent native decoder. Audio and text only cross anonymous pipes."""
import json
from pathlib import Path
import queue
import struct
import subprocess
import threading


class VoiceWorker:
    def __init__(self, helper, model, language='en', threads=4, timeout=45):
        self.helper, self.model = Path(helper), Path(model)
        self.language, self.threads, self.timeout = language, threads, timeout
        self.process = None
        self._lock = threading.Lock()
        self._answers = queue.Queue(maxsize=2)
        self._state, self._detail = 'unavailable', 'Local speech worker not started'

    def status(self):
        ready = self._state == 'ready' and self.process is not None and self.process.poll() is None
        detail = 'Local speech worker exited; restart the presentation server' if self._state == 'ready' and not ready else self._detail
        return {'available': ready, 'state': self._state if ready else 'unavailable',
                'detail': detail, 'model': self.model.name, 'language': self.language}

    def _read(self):
        try:
            while True:
                line = self.process.stdout.readline(32768)
                if not line:
                    raise RuntimeError('Local speech worker exited')
                value = json.loads(line)
                if not isinstance(value, dict) or not line.endswith(b'\n'):
                    raise ValueError('Invalid local speech worker response')
                self._answers.put_nowait(value)
        except (OSError, ValueError, RuntimeError, queue.Full) as error:
            try:
                self._answers.put_nowait({'error': str(error)})
            except queue.Full:
                pass

    def _answer(self):
        try:
            value = self._answers.get(timeout=self.timeout)
        except queue.Empty:
            self.close()
            raise TimeoutError('Local transcription timed out; restart the presentation server') from None
        if value.get('error'):
            self.close()
            raise RuntimeError(value['error'])
        return value

    def start(self):
        if not self.helper.is_file() or not self.model.is_file():
            self._detail = 'Missing local helper/model. Run python3 scripts/setup_voice.py, then restart this server.'
            return
        try:
            self.process = subprocess.Popen([str(self.helper), str(self.model), self.language, str(self.threads)],
                                            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
            threading.Thread(target=self._read, daemon=True).start()
            if self._answer().get('ready') is not True:
                raise RuntimeError('Local speech worker did not initialize')
            self._state, self._detail = 'ready', f'Local Whisper ready · {self.model.name} · {self.language} · CPU'
        except (OSError, RuntimeError, TimeoutError) as error:
            self.close()
            self._detail = str(error)

    def transcribe(self, pcm):
        if not 8000 <= len(pcm) <= 384000 or len(pcm) % 2:
            raise ValueError('Invalid PCM length')
        if not self._lock.acquire(blocking=False):
            raise BlockingIOError('Speech worker busy')
        try:
            if not self.status()['available']:
                raise RuntimeError(self._detail)
            self.process.stdin.write(struct.pack('<I', len(pcm) // 2))
            self.process.stdin.write(pcm)
            self.process.stdin.flush()
            result = self._answer()
            text = result.get('text')
            if not isinstance(text, str) or len(text) > 16000:
                raise RuntimeError('Invalid speech worker response')
            return text.strip()
        finally:
            self._lock.release()

    def close(self):
        self._state, self._detail = 'unavailable', 'Local speech worker stopped'
        if self.process is not None:
            if self.process.poll() is None:
                self.process.terminate()
                try:
                    self.process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    self.process.kill()
                    self.process.wait(timeout=3)
            for pipe in (self.process.stdin, self.process.stdout):
                if pipe:
                    pipe.close()
