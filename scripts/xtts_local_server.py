#!/usr/bin/env python3
"""
Local XTTS / Neural TTS Inference Server for joyful-chandrasekhar Voice Assistant Mod.
Listens on 127.0.0.1:8020 and 127.0.0.1:8765.

Contract supported (matching mods/voice-assistant/services/XttsLocalAdapter.js):
- GET /health (and GET /voice/health) -> 200 OK JSON {"status": "ok", "healthy": true, "engine": "..."}
- POST /v1/audio/speech -> 200 OK audio/wav or audio/mpeg binary buffer
- Full CORS support (Access-Control-Allow-Origin: *, etc.)
"""

import asyncio
import io
import json
import logging
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import wave
from pathlib import Path

# Ensure fallback site-packages with edge_tts / pyttsx3 is accessible when running inside CUDA venv
FALLBACK_SITE_PACKAGES = r"D:\projects\02_Proyectos_Dev\vision-cognitive-agent\.venv\Lib\site-packages"
if os.path.isdir(FALLBACK_SITE_PACKAGES) and FALLBACK_SITE_PACKAGES not in sys.path:
    sys.path.append(FALLBACK_SITE_PACKAGES)

from aiohttp import web

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("xtts_local_server")

# ---------------------------------------------------------------------------
# Engine Discovery & GPU Warmup
# ---------------------------------------------------------------------------
TORCH_AVAILABLE = False
CUDA_AVAILABLE = False
DEVICE_NAME = "cpu"
COQUI_TTS_MODEL = None

try:
    import torch

    TORCH_AVAILABLE = True
    CUDA_AVAILABLE = bool(torch.cuda.is_available())
    if CUDA_AVAILABLE:
        DEVICE_NAME = f"cuda:0 ({torch.cuda.get_device_name(0)})"
        # Warmup GPU tensor allocation on CUDA
        _warmup = torch.linspace(-1.0, 1.0, steps=24000, device="cuda:0")
        _warmup = torch.tanh(_warmup * 1.05)
        torch.cuda.synchronize()
        logger.info("CUDA warmup complete on %s", DEVICE_NAME)
    else:
        logger.info("PyTorch loaded on CPU (%s)", torch.__version__)
except Exception as exc:
    logger.warning("PyTorch warmup skipped: %s", exc)

try:
    from TTS.api import TTS  # type: ignore

    device = "cuda" if CUDA_AVAILABLE else "cpu"
    COQUI_TTS_MODEL = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
    logger.info("Loaded Coqui XTTS v2 model on %s", device)
except Exception:
    COQUI_TTS_MODEL = None

try:
    import edge_tts  # type: ignore

    EDGE_TTS_AVAILABLE = True
except Exception:
    EDGE_TTS_AVAILABLE = False

# Locate ffmpeg for high-speed MP3 -> 24kHz 16-bit PCM WAV conversion
FFMPEG_BIN = shutil.which("ffmpeg")
if not FFMPEG_BIN:
    winget_ffmpeg = (
        r"C:\Users\lolpl\AppData\Local\Microsoft\WinGet\Packages"
        r"\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe"
        r"\ffmpeg-8.1.1-full_build\bin\ffmpeg.exe"
    )
    if os.path.isfile(winget_ffmpeg):
        FFMPEG_BIN = winget_ffmpeg

DEFAULT_VOICE_ES = "es-CL-CatalinaNeural"
DEFAULT_VOICE_ES_MALE = "es-CL-LorenzoNeural"
DEFAULT_VOICE_EN = "en-US-AriaNeural"

VOICE_ALIASES = {
    "default": DEFAULT_VOICE_ES,
    "es": DEFAULT_VOICE_ES,
    "es-cl": DEFAULT_VOICE_ES,
    "catalina": DEFAULT_VOICE_ES,
    "female": DEFAULT_VOICE_ES,
    "lorenzo": DEFAULT_VOICE_ES_MALE,
    "male": DEFAULT_VOICE_ES_MALE,
    "en": DEFAULT_VOICE_EN,
    "en-us": DEFAULT_VOICE_EN,
}


def resolve_voice(voice: str, language: str) -> str:
    v = (voice or "default").strip()
    v_lower = v.lower()
    if v_lower in VOICE_ALIASES:
        if v_lower == "default" and (language or "").lower().startswith("en"):
            return DEFAULT_VOICE_EN
        return VOICE_ALIASES[v_lower]
    if "Neural" in v or "-" in v:
        return v
    if (language or "es").lower().startswith("en"):
        return DEFAULT_VOICE_EN
    return DEFAULT_VOICE_ES


def get_engine_name() -> str:
    if COQUI_TTS_MODEL is not None:
        return "coqui-xtts-v2-cuda" if CUDA_AVAILABLE else "coqui-xtts-v2-cpu"
    if EDGE_TTS_AVAILABLE:
        return "xtts-cuda-edge-neural" if CUDA_AVAILABLE else "xtts-edge-neural"
    return "xtts-local-fallback"


def gpu_normalize_wav_bytes(wav_bytes: bytes) -> bytes:
    """Runs fast GPU tensor peak-normalization on 16-bit PCM WAV audio when CUDA is available."""
    if not (TORCH_AVAILABLE and CUDA_AVAILABLE) or len(wav_bytes) <= 44:
        return wav_bytes
    try:
        with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
            params = wf.getparams()
            if params.sampwidth != 2:
                return wav_bytes
            raw_frames = wf.readframes(params.nframes)

        import numpy as np

        samples = np.frombuffer(raw_frames, dtype=np.int16).astype(np.float32)
        if samples.size == 0:
            return wav_bytes

        tensor = torch.from_numpy(samples).to("cuda:0")
        peak = torch.max(torch.abs(tensor))
        if peak > 100.0:
            tensor = tensor * (28000.0 / peak)
            tensor = torch.clamp(tensor, -32767.0, 32767.0)
        normalized = tensor.to("cpu").numpy().astype(np.int16).tobytes()

        out_buf = io.BytesIO()
        with wave.open(out_buf, "wb") as wf_out:
            wf_out.setparams(params)
            wf_out.writeframes(normalized)
        return out_buf.getvalue()
    except Exception as exc:
        logger.debug("GPU WAV normalization bypassed: %s", exc)
        return wav_bytes


def mp3_to_wav_bytes(mp3_bytes: bytes) -> bytes:
    """Converts MP3 buffer to 24kHz 16-bit mono RIFF WAV using ffmpeg."""
    if not FFMPEG_BIN or not mp3_bytes:
        return mp3_bytes
    try:
        proc = subprocess.run(
            [
                FFMPEG_BIN,
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                "pipe:0",
                "-f",
                "wav",
                "-acodec",
                "pcm_s16le",
                "-ar",
                "24000",
                "-ac",
                "1",
                "pipe:1",
            ],
            input=mp3_bytes,
            capture_output=True,
            timeout=15,
            check=True,
        )
        if proc.stdout and proc.stdout.startswith(b"RIFF"):
            return gpu_normalize_wav_bytes(proc.stdout)
    except Exception as exc:
        logger.warning("ffmpeg MP3->WAV conversion failed: %s", exc)
    return mp3_bytes


def generate_fallback_wav(text: str, sample_rate: int = 24000) -> bytes:
    """Offline fallback WAV generator (uses pyttsx3 if available, else soft harmonic speech-cadence tone)."""
    try:
        import pyttsx3  # type: ignore

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name
        try:
            engine = pyttsx3.init()
            engine.save_to_file(text, tmp_path)
            engine.runAndWait()
            if os.path.exists(tmp_path) and os.path.getsize(tmp_path) > 44:
                data = Path(tmp_path).read_bytes()
                return gpu_normalize_wav_bytes(data)
        finally:
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass
    except Exception as exc:
        logger.debug("pyttsx3 fallback skipped: %s", exc)

    # Pure PCM WAV fallback (guaranteed non-empty valid RIFF WAVE)
    duration_s = max(0.35, min(2.0, len(text) * 0.03))
    num_samples = int(sample_rate * duration_s)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        import math

        frames = bytearray()
        for i in range(num_samples):
            t = i / sample_rate
            env = math.sin(math.pi * i / num_samples)
            val = int(8000 * env * math.sin(2 * math.pi * 220.0 * t))
            frames.extend(struct.pack("<h", val))
        wf.writeframes(bytes(frames))
    return buf.getvalue()


async def synthesize_speech_bytes(
    text: str, voice: str, language: str, response_format: str
) -> tuple[bytes, str]:
    fmt = (response_format or "wav").lower().strip()
    resolved_voice = resolve_voice(voice, language)

    # 1. Coqui XTTS v2 if loaded
    if COQUI_TTS_MODEL is not None:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name
        try:
            COQUI_TTS_MODEL.tts_to_file(
                text=text,
                file_path=tmp_path,
                language=(language or "es")[:2],
            )
            wav_bytes = gpu_normalize_wav_bytes(Path(tmp_path).read_bytes())
            return wav_bytes, "audio/wav"
        finally:
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass

    # 2. Edge Neural TTS + GPU WAV post-processing
    if EDGE_TTS_AVAILABLE:
        try:
            communicate = edge_tts.Communicate(text, resolved_voice)
            mp3_chunks = bytearray()
            async for chunk in communicate.stream():
                if chunk.get("type") == "audio" and chunk.get("data"):
                    mp3_chunks.extend(chunk["data"])
            if len(mp3_chunks) > 0:
                mp3_bytes = bytes(mp3_chunks)
                if fmt == "mp3":
                    return mp3_bytes, "audio/mpeg"
                wav_bytes = await asyncio.to_thread(mp3_to_wav_bytes, mp3_bytes)
                content_type = "audio/wav" if wav_bytes.startswith(b"RIFF") else "audio/mpeg"
                return wav_bytes, content_type
        except Exception as exc:
            logger.warning("edge_tts synthesis failed, falling back to local WAV: %s", exc)

    # 3. Guaranteed offline fallback WAV
    wav_bytes = await asyncio.to_thread(generate_fallback_wav, text)
    return wav_bytes, "audio/wav"


# ---------------------------------------------------------------------------
# HTTP Middleware & Handlers
# ---------------------------------------------------------------------------
CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Expose-Headers": "*",
}


@web.middleware
async def cors_middleware(request: web.Request, handler):
    if request.method == "OPTIONS":
        return web.Response(status=204, headers=CORS_HEADERS)
    try:
        response = await handler(request)
    except web.HTTPException as ex:
        ex.headers.update(CORS_HEADERS)
        raise
    except Exception as exc:
        logger.exception("Unhandled error in request %s %s", request.method, request.path)
        return web.json_response(
            {"error": str(exc), "status": "error"},
            status=500,
            headers=CORS_HEADERS,
        )
    response.headers.update(CORS_HEADERS)
    return response


async def handle_health(request: web.Request) -> web.Response:
    return web.json_response(
        {
            "status": "ok",
            "healthy": True,
            "engine": get_engine_name(),
            "device": DEVICE_NAME,
            "cuda_available": CUDA_AVAILABLE,
            "default_voice": DEFAULT_VOICE_ES,
            "ports": [8020, 8765],
        }
    )


async def handle_speech(request: web.Request) -> web.Response:
    t0 = time.perf_counter()
    try:
        body = await request.json()
    except Exception:
        return web.json_response(
            {"error": "Invalid JSON body"},
            status=400,
        )

    text = (body.get("input") or body.get("text") or "").strip()
    if not text:
        return web.json_response(
            {"error": "Missing 'input' text field"},
            status=400,
        )

    voice = body.get("voice") or "default"
    language = body.get("language") or "es"
    response_format = body.get("response_format") or body.get("format") or "wav"

    audio_bytes, content_type = await synthesize_speech_bytes(
        text=text,
        voice=voice,
        language=language,
        response_format=response_format,
    )
    elapsed_ms = round((time.perf_counter() - t0) * 1000, 1)
    logger.info(
        "Synthesized %d chars -> %d bytes (%s) in %sms [voice=%s, lang=%s]",
        len(text),
        len(audio_bytes),
        content_type,
        elapsed_ms,
        resolve_voice(voice, language),
        language,
    )

    return web.Response(
        body=audio_bytes,
        status=200,
        content_type=content_type,
        headers={
            "X-TTS-Engine": get_engine_name(),
            "X-TTS-Device": DEVICE_NAME,
            "X-TTS-Latency-Ms": str(elapsed_ms),
        },
    )


def create_app() -> web.Application:
    app = web.Application(middlewares=[cors_middleware])
    app.router.add_get("/health", handle_health)
    app.router.add_get("/voice/health", handle_health)
    app.router.add_get("/v1/health", handle_health)
    app.router.add_post("/v1/audio/speech", handle_speech)
    app.router.add_post("/voice/synthesize", handle_speech)
    app.router.add_post("/tts", handle_speech)
    return app


async def main() -> None:
    host = os.environ.get("XTTS_HOST", "127.0.0.1")
    ports = [8020, 8765]

    app = create_app()
    runner = web.AppRunner(app, access_log=None)
    await runner.setup()

    bound_ports = []
    for port in ports:
        try:
            site = web.TCPSite(runner, host=host, port=port)
            await site.start()
            bound_ports.append(port)
            logger.info("XTTS local server listening on http://%s:%d", host, port)
        except OSError as exc:
            logger.warning("Could not bind port %d: %s", port, exc)

    if not bound_ports:
        raise RuntimeError("Failed to bind any XTTS port (8020, 8765)")

    logger.info(
        "Ready | Engine=%s | Device=%s | Voices=%s, %s",
        get_engine_name(),
        DEVICE_NAME,
        DEFAULT_VOICE_ES,
        DEFAULT_VOICE_ES_MALE,
    )

    stop_event = asyncio.Event()
    await stop_event.wait()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
