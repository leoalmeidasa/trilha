// Runs the speech models off the main thread so the page stays responsive.
//   stt: Whisper (base.en) turns 16 kHz mono audio into text.
//   tts: Kokoro turns text into a natural US/UK English voice.
//   phonemes: wav2vec2 (espeak phoneme CTC) says which sounds were actually produced,
//             without a language model "fixing" them (catches tink/think).
// Models download once from Hugging Face and stay in the browser cache.
import { pipeline, env, KokoroTTS, AutoModelForCTC, AutoFeatureExtractor } from '../vendor/ai.js';

env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1; // No cross-origin isolation, so no wasm threads.
// Serve the ONNX runtime from this site (assets/vendor/ort) instead of a CDN.
env.backends.onnx.wasm.wasmPaths = new URL('../vendor/ort/', import.meta.url).href;

const STT_MODEL = 'Xenova/whisper-base.en';
const TTS_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const PHONEME_MODEL = 'onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX';

let asr = null;
let tts = null;
let phon = null;

function progress(kind) {
  const files = new Map();
  return (p) => {
    if (p.status !== 'progress' || !p.total) return;
    files.set(p.file, { loaded: p.loaded, total: p.total });
    let loaded = 0;
    let total = 0;
    for (const f of files.values()) { loaded += f.loaded; total += f.total; }
    postMessage({ type: 'progress', kind, loaded, total });
  };
}

function loadAsr() {
  asr ??= pipeline('automatic-speech-recognition', STT_MODEL, {
    dtype: 'q8', device: 'wasm', progress_callback: progress('stt'),
  }).catch((err) => { asr = null; throw err; });
  return asr;
}

function loadTts() {
  tts ??= KokoroTTS.from_pretrained(TTS_MODEL, {
    dtype: 'q8', device: 'wasm', progress_callback: progress('tts'),
  }).catch((err) => { tts = null; throw err; });
  return tts;
}

// q8 (318 MB) keeps TH/long-i detection; the 4-bit variant missed some in tests.
function loadPhonemes() {
  phon ??= Promise.all([
    AutoFeatureExtractor.from_pretrained(PHONEME_MODEL),
    AutoModelForCTC.from_pretrained(PHONEME_MODEL, { dtype: 'q8', device: 'wasm', progress_callback: progress('phonemes') }),
    fetch(`https://huggingface.co/${PHONEME_MODEL}/resolve/main/vocab.json`).then((r) => r.json()),
  ]).then(([fe, model, vocab]) => ({ fe, model, ids: Object.fromEntries(Object.entries(vocab).map(([k, v]) => [v, k])) }))
    .catch((err) => { phon = null; throw err; });
  return phon;
}

// Greedy CTC decoding: best token per frame, collapse repeats, drop special tokens.
async function phonemes(audio) {
  const { fe, model, ids } = await loadPhonemes();
  const { logits } = await model(await fe(audio));
  const [, frames, size] = logits.dims;
  const data = logits.data;
  const out = [];
  let prev = -1;
  for (let i = 0; i < frames; i += 1) {
    let best = 0;
    let bestScore = -Infinity;
    for (let j = 0; j < size; j += 1) {
      const v = data[i * size + j];
      if (v > bestScore) { bestScore = v; best = j; }
    }
    if (best !== prev && best > 3) out.push(ids[best]);
    prev = best;
  }
  return out;
}

self.onmessage = async ({ data }) => {
  const { id, op } = data;
  try {
    if (op === 'stt') {
      const model = await loadAsr();
      const out = await model(data.audio);
      postMessage({ id, ok: true, text: String(out.text ?? '').trim() });
    } else if (op === 'phonemes') {
      postMessage({ id, ok: true, phones: await phonemes(data.audio) });
    } else if (op === 'tts') {
      const model = await loadTts();
      const out = await model.generate(data.text, { voice: data.voice, speed: data.speed ?? 1 });
      postMessage({ id, ok: true, audio: out.audio, rate: out.sampling_rate }, [out.audio.buffer]);
    } else if (op === 'warm') {
      await Promise.all([data.stt && loadAsr(), data.tts && loadTts(), data.phonemes && loadPhonemes()]);
      postMessage({ id, ok: true });
    } else {
      throw new Error(`operação desconhecida: ${op}`);
    }
  } catch (err) {
    postMessage({ id, ok: false, error: String(err?.message ?? err) });
  }
};
