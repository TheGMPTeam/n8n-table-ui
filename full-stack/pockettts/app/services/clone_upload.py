"""Browser uploads. Only generated filenames enter the persistent cache."""
import json
import os
import subprocess
import threading
import uuid
import wave
from pathlib import Path
from werkzeug.exceptions import BadRequest, RequestEntityTooLarge, UnsupportedMediaType

_lock = threading.Lock()
LIMIT = 10 * 1024 * 1024


def records(tts):
    if not tts.cache_dir:
        return []
    folder = tts.cache_dir / 'browser_refs'
    result = []
    for p in folder.glob('clone_*.json'):
        try:
            r = json.loads(p.read_text())
            if r['id'] == p.stem and (folder / (p.stem + '.wav')).is_file():
                result.append({'id': r['id'], 'name': r['name'], 'type': 'custom'})
        except (OSError, ValueError, KeyError):
            continue
    return sorted(result, key=lambda r: r['name'].lower())


def resolve(tts, voice_id):
    import re
    if re.fullmatch(r'clone_[0-9a-f]{32}', voice_id) and tts.cache_dir:
        folder = tts.cache_dir / 'browser_refs'
        if (folder / (voice_id + '.json')).is_file():
            from app.services.voice_cache import active_model_tag
            tag = active_model_tag((tts._active or {}).get('value') or 'english')
            cached = tts.cache_dir / f'{voice_id}.{tag}.safetensors'
            return str(cached if cached.is_file() else folder / (voice_id + '.wav'))
    return None


def create(tts, request):
    request.max_content_length = LIMIT + 65536
    if request.form.get('consent_confirmed') != 'true':
        raise BadRequest('Confirm that you own the recording or have permission from the speaker to clone their voice.')
    upload = request.files.get('reference_file')
    if not upload or not upload.filename:
        raise BadRequest('Choose a reference audio file.')
    name = request.form.get('voiceName', '').strip() or 'My cloned voice'
    if len(name) > 80 or any(ord(c) < 32 for c in name):
        raise BadRequest('Voice name must be at most 80 printable characters.')
    filename = upload.filename
    if '/' in filename or '\\' in filename or ':' in filename:
        raise BadRequest('Upload a file, not a path or URL.')
    ext = Path(filename).suffix.lower()
    if ext not in ('.wav', '.mp3', '.flac') or upload.mimetype not in ('audio/wav','audio/x-wav','audio/wave','audio/vnd.wave','audio/mpeg','audio/mp3','audio/flac','audio/x-flac','application/octet-stream'):
        raise UnsupportedMediaType('Supported audio: WAV, MP3, FLAC.')
    if tts._loading:
        raise BadRequest('Model is loading; retry shortly.')
    tts._ensure_cache_dir()
    if not tts.cache_dir:
        raise BadRequest('Persistent voice cache is unavailable.')
    folder = tts.cache_dir / 'browser_refs'
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    voice_id = 'clone_' + uuid.uuid4().hex
    source = folder / (voice_id + '.upload' + ext)
    wav = folder / (voice_id + '.wav')
    metadata = folder / (voice_id + '.json')
    temp = folder / (voice_id + '.json.tmp')
    try:
        with source.open('xb') as out:
            os.chmod(source, 0o600)
            count = 0
            while chunk := upload.stream.read(65536):
                count += len(chunk)
                if count > LIMIT:
                    raise RequestEntityTooLarge('Reference exceeds 10 MB.')
                out.write(chunk)
        if not count:
            raise BadRequest('Reference file is empty.')
        # Force a local demuxer and forbid nested URL/file protocols in playlists.
        demuxer = {'.wav':'wav', '.mp3':'mp3', '.flac':'flac'}[ext]
        try:
            subprocess.run(['ffmpeg','-nostdin','-v','error','-protocol_whitelist','file','-f',demuxer,'-i',str(source),'-t','61','-vn','-ar','24000','-ac','1','-c:a','pcm_s16le',str(wav)], check=True, capture_output=True, timeout=30)
            with wave.open(str(wav)) as audio:
                duration = audio.getnframes() / audio.getframerate()
            if not 1 <= duration <= 60:
                raise BadRequest('Reference must be between 1 and 60 seconds; 10–30 seconds recommended.')
        except (subprocess.SubprocessError, wave.Error, EOFError):
            raise BadRequest('Audio could not be decoded as WAV, MP3 or FLAC.')
        os.chmod(wav, 0o600)
        # Use the existing singleton and model lock; persist official safetensors.
        tts.get_voice_state(str(wav))
        record = {'id': voice_id, 'name': name, 'type': 'custom'}
        with _lock:
            with temp.open('x') as out:
                os.chmod(temp, 0o600)
                json.dump(record, out)
                out.flush()
                os.fsync(out.fileno())
            os.replace(temp, metadata)
            fd = os.open(folder, os.O_RDONLY)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)
        return record
    except Exception:
        wav.unlink(missing_ok=True)
        temp.unlink(missing_ok=True)
        # Only this upload's generated cache entries may be removed.
        for p in tts.cache_dir.glob(voice_id + '.*.safetensors'):
            p.unlink(missing_ok=True)
        raise
    finally:
        source.unlink(missing_ok=True)
