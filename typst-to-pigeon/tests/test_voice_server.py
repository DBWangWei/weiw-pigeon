"""Loopback API boundaries and persistent, memory-only speech worker."""
import importlib.util
import http.client
import json
import os
from pathlib import Path
import struct
import tempfile
import threading
import unittest
import wave

SCRIPTS = Path(__file__).resolve().parents[1] / 'assets/pigeon-template/scripts'


def load(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.module = load('serve')
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / 'index.html').write_text('presentation')
        (self.root / 'secret.bin').write_bytes(b'not public')
        self.server = self.module.create_server(self.root, port=0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.port = self.server.server_address[1]
        self.origin = f'http://127.0.0.1:{self.port}'

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.tmp.cleanup()

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=5)
        connection.request(method, path, body=body, headers=headers or {})
        response = connection.getresponse()
        status, data = response.status, response.read()
        connection.close()
        return status, data

    def test_static_presentation_works_without_a_helper_and_excludes_private_files(self):
        self.assertEqual(self.request('GET', '/')[1], b'presentation')
        self.assertEqual(self.request('GET', '/secret.bin')[0], 404)
        status, data = self.request('GET', '/api/voice/status')
        self.assertEqual(status, 200)
        self.assertFalse(json.loads(data)['available'])

    def test_rejects_rebinding_and_cross_origin_audio_before_processing(self):
        self.assertEqual(self.request('GET', '/api/voice/status', headers={'Host': 'evil.example'})[0], 403)
        headers = {'Origin': 'https://evil.example', 'Content-Type': 'application/octet-stream'}
        self.assertEqual(self.request('POST', '/api/voice/transcribe', b'\0' * 16000, headers)[0], 403)
        headers['Origin'] = self.origin
        self.assertEqual(self.request('POST', '/api/voice/transcribe', b'\0' * 16000, headers)[0], 403)

    def test_same_origin_audio_is_bounded_and_returned_without_files(self):
        class Engine:
            def status(self):
                return {'available': True, 'state': 'ready', 'model': 'test', 'language': 'en'}
            def transcribe(self, pcm):
                return 'this table'
        self.server.voice = Engine()
        _, data = self.request('GET', '/api/voice/status')
        headers = {'Origin': self.origin, 'Content-Type': 'application/octet-stream',
                   'X-Pigeon-Voice-Token': json.loads(data)['token']}
        before = sorted(self.root.rglob('*'))
        status, data = self.request('POST', '/api/voice/transcribe', b'\0' * 16000, headers)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(data)['text'], 'this table')
        self.assertEqual(before, sorted(self.root.rglob('*')))
        invalid_audio = [(b'', {}), (b'123', {}),
                         # Declare an oversized body without sending it. The
                         # server must reject the length before reading audio;
                         # this avoids a Python 3.14 client BrokenPipe race
                         # when the server closes an actively-uploading body.
                         (b'', {'Content-Length': str(self.module.MAX_AUDIO + 2)})]
        for pcm, extra in invalid_audio:
            request_headers = {**headers, **extra}
            self.assertEqual(self.request('POST', '/api/voice/transcribe', pcm, request_headers)[0], 400)
        headers['Content-Type'] = 'text/plain'
        self.assertEqual(self.request('POST', '/api/voice/transcribe', b'\0' * 16000, headers)[0], 415)


class WorkerTests(unittest.TestCase):
    def test_missing_installation_is_reported_without_launching_or_creating_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            worker = load('voice_worker').VoiceWorker(root / 'absent-helper', root / 'absent-model')
            worker.start()
            self.assertFalse(worker.status()['available'])
            self.assertIn('setup_voice.py', worker.status()['detail'])
            self.assertEqual(list(root.iterdir()), [])

    def test_unexpected_decoder_exit_is_not_reported_as_ready(self):
        class Exited:
            def poll(self):
                return 1
        worker = load('voice_worker').VoiceWorker('helper', 'model')
        worker.process = Exited()
        worker._state, worker._detail = 'ready', 'Local Whisper ready'
        self.assertFalse(worker.status()['available'])
        self.assertIn('exited', worker.status()['detail'])


class RealWhisperTests(unittest.TestCase):
    @unittest.skipUnless(os.environ.get('PIGEON_WHISPER_HELPER'), 'set local helper/model/sample to run native integration')
    def test_real_worker_loads_once_transcribes_pcm_and_shuts_down(self):
        worker_module = load('voice_worker')
        worker = worker_module.VoiceWorker(Path(os.environ['PIGEON_WHISPER_HELPER']),
                                          Path(os.environ['PIGEON_WHISPER_MODEL']), timeout=60)
        self.addCleanup(worker.close)
        worker.start()
        self.assertTrue(worker.status()['available'], worker.status())
        process = worker.process
        with wave.open(os.environ['PIGEON_SPEECH_SAMPLE'], 'rb') as audio:
            self.assertEqual((audio.getframerate(), audio.getnchannels(), audio.getsampwidth()), (16000, 1, 2))
            pcm = audio.readframes(audio.getnframes())
        self.assertIn('ask not what your country can do for you', worker.transcribe(pcm).lower())
        self.assertEqual(worker.process.pid, process.pid)
        self.assertEqual(worker.transcribe(struct.pack('<h', 0) * 16000), '')
        worker.close()
        self.assertIsNotNone(process.poll())


if __name__ == '__main__':
    unittest.main()
