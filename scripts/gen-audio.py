#!/usr/bin/env python3
"""Generate the pronunciation audio files from data/pronuncia.json with Piper TTS.

Browsers on Linux often ship without speech-synthesis voices, so the app plays
these pre-rendered files and only falls back to speechSynthesis when one is missing.

Usage (from the repo root, in a venv with `pip install piper-tts`, ffmpeg on PATH):
    python scripts/gen-audio.py --voice /path/to/en_US-lessac-medium.onnx

Writes data/audio/<item-id>.mp3 for each sentence and data/audio/w/<word>.mp3 for
each word. Existing files are kept unless --force is given.
"""
import argparse
import json
import re
import subprocess
import tempfile
import wave
from pathlib import Path

from piper import PiperVoice

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "audio"


def word_key(word: str) -> str:
    # Must match wordKey() in assets/js/speech.js.
    return re.sub(r"[^a-z0-9]", "", word.lower().replace("’", "'"))


def render(voice: PiperVoice, text: str, target: Path, force: bool) -> bool:
    if target.exists() and not force:
        return False
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
        with wave.open(tmp.name, "wb") as wav:
            voice.synthesize_wav(text, wav)
        subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-y", "-i", tmp.name,
             "-ac", "1", "-codec:a", "libmp3lame", "-b:a", "48k", str(target)],
            check=True,
        )
    return True


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--voice", required=True, help="Piper .onnx voice file")
    parser.add_argument("--force", action="store_true", help="re-render existing files")
    args = parser.parse_args()

    voice = PiperVoice.load(args.voice)
    decks = json.loads((ROOT / "data" / "pronuncia.json").read_text())
    made = 0
    words: dict[str, str] = {}
    for deck in decks:
        for item in deck["items"]:
            made += render(voice, item["en"], OUT / f"{item['id']}.mp3", args.force)
            for token in item["en"].split():
                spoken = re.sub(r"[^A-Za-z0-9'’]", "", token)
                if word_key(spoken):
                    words.setdefault(word_key(spoken), spoken.lower())
    for key, spoken in sorted(words.items()):
        made += render(voice, spoken, OUT / "w" / f"{key}.mp3", args.force)
    print(f"{made} arquivos gerados, {len(words)} palavras")


if __name__ == "__main__":
    main()
