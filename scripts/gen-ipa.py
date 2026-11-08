#!/usr/bin/env python3
"""Generate reference phonemes for data/pronuncia.json -> data/pronuncia-ipa.json.

Uses Piper's espeak-ng phonemizer (en-us), the same phoneme set the in-browser
phoneme model (wav2vec2-lv-60-espeak-cv-ft) was trained on. Each word's IPA is split
into the model's vocabulary tokens (longest match), with stress marks removed.

Usage (repo root, venv with piper-tts):
    python scripts/gen-ipa.py --voice /path/to/en_US-lessac-medium.onnx
"""
import argparse
import json
import re
import urllib.request
from pathlib import Path

from piper import PiperVoice

ROOT = Path(__file__).resolve().parent.parent
VOCAB_URL = "https://huggingface.co/onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX/resolve/main/vocab.json"


def tokenize(ipa: str, vocab: set[str]) -> list[str]:
    ipa = ipa.replace("ˈ", "").replace("ˌ", "")
    out, i = [], 0
    longest = max(len(t) for t in vocab)
    while i < len(ipa):
        for size in range(longest, 0, -1):
            piece = ipa[i:i + size]
            if piece in vocab:
                out.append(piece)
                i += size
                break
        else:
            i += 1  # Symbol the model does not know (e.g. punctuation): skip it.
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--voice", required=True)
    args = parser.parse_args()

    with urllib.request.urlopen(VOCAB_URL) as res:
        vocab = {t for t in json.load(res) if not t.startswith("<")}
    voice = PiperVoice.load(args.voice)
    decks = json.loads((ROOT / "data" / "pronuncia.json").read_text())
    result = {}
    problems = 0
    for deck in decks:
        for item in deck["items"]:
            words = [w for w in item["en"].split() if re.search(r"[A-Za-z0-9]", w)]
            ipa_words = " ".join("".join(s) for s in voice.phonemize(item["en"])).split()
            ipa_words = [w for w in (re.sub(r"[.,!?;:]", "", w) for w in ipa_words) if w]
            if len(ipa_words) != len(words):
                # espeak merges some function words ("in the" -> "ɪnðə"); phonemize word by word.
                ipa_words = ["".join("".join(s) for s in voice.phonemize(re.sub(r"[.,!?;:]", "", w))) for w in words]
                problems += 1
            result[item["id"]] = [[w, tokenize(p, vocab)] for w, p in zip(words, ipa_words)]
    out = ROOT / "data" / "pronuncia-ipa.json"
    out.write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n")
    print(f"{len(result)} frases com fonemas, {problems} feitas palavra a palavra -> {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
