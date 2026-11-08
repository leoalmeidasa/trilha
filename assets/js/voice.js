// Browser-side voice helpers: microphone recording with silence detection, and a
// client for voice-worker.js (Whisper speech-to-text, Kokoro text-to-speech).

export const VOICES = {
  af_heart: 'Heart (mulher, EUA)',
  am_michael: 'Michael (homem, EUA)',
  bf_emma: 'Emma (mulher, Reino Unido)',
  bm_george: 'George (homem, Reino Unido)',
};

// Two workers so Sam's voice never waits behind the listening models:
//   'listen' runs Whisper + the phoneme model, 'speak' runs Kokoro.
const workers = {};
let nextId = 1;
const pending = new Map();
const progressListeners = new Set();

function getWorker(kind) {
  if (workers[kind]) return workers[kind];
  const worker = new Worker(new URL('./voice-worker.js', import.meta.url), { type: 'module', name: `voice-${kind}` });
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') {
      for (const fn of progressListeners) fn(data);
      return;
    }
    const job = pending.get(data.id);
    if (!job) return;
    pending.delete(data.id);
    if (data.ok) job.resolve(data);
    else job.reject(new Error(data.error));
  };
  worker.onerror = (e) => {
    for (const [id, job] of pending) {
      if (job.kind !== kind) continue;
      job.reject(new Error(e.message || 'Falha ao carregar a IA de voz.'));
      pending.delete(id);
    }
    delete workers[kind];
  };
  workers[kind] = worker;
  return worker;
}

function call(op, payload = {}, transfer = []) {
  const kind = op === 'tts' || (op === 'warm' && payload.tts) ? 'speak' : 'listen';
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject, kind });
    getWorker(kind).postMessage({ id, op, ...payload }, transfer);
  });
}

// Model download progress: fn({ kind: 'stt'|'tts', loaded, total }). Returns an unsubscribe.
export function onProgress(fn) {
  progressListeners.add(fn);
  return () => progressListeners.delete(fn);
}

export function warm({ stt = false, tts = false, phonemes = false } = {}) {
  const jobs = [];
  if (stt || phonemes) jobs.push(call('warm', { stt, phonemes }));
  if (tts) jobs.push(call('warm', { tts: true }));
  return Promise.all(jobs);
}

// ---------------------------------------------------------------- recording

let active = null;

export function isRecording() {
  return Boolean(active);
}

export function stopRecording() {
  active?.stop();
}

// Records until the user stops, or ~1.3 s of silence after speech, or 15 s.
// onLevel(level 0..1, micLabel) feeds the meter. Resolves with
// { blob, url, peak, mic, spoke } where spoke tells whether any speech was detected.
export async function record({ onLevel = () => {}, silenceMs = 1300, maxMs = 15000 } = {}) {
  if (active) throw new Error('Já estou gravando.');
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
  } catch (err) {
    throw new Error(err.name === 'NotAllowedError'
      ? 'Microfone bloqueado. Libere o acesso no cadeado da barra de endereço.'
      : `Não consegui abrir o microfone (${err.message}).`);
  }
  const mic = stream.getAudioTracks()[0]?.label || 'microfone padrão';
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const buf = new Float32Array(analyser.fftSize);

  const recorder = new MediaRecorder(stream);
  const chunks = [];
  recorder.ondataavailable = (e) => chunks.push(e.data);

  return new Promise((resolve) => {
    let peak = 0;
    let spoke = false;
    let lastLoud = performance.now();
    const started = performance.now();
    let raf = 0;
    const finish = () => {
      if (recorder.state === 'recording') recorder.stop();
    };
    active = { stop: finish };
    const tick = () => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      const level = Math.min(1, Math.sqrt(sum / buf.length) * 8);
      peak = Math.max(peak, level);
      const now = performance.now();
      if (level > 0.12) { spoke = true; lastLoud = now; }
      onLevel(level, mic);
      if ((spoke && now - lastLoud > silenceMs) || now - started > maxMs) finish();
      else raf = requestAnimationFrame(tick);
    };
    recorder.onstop = () => {
      cancelAnimationFrame(raf);
      active = null;
      stream.getTracks().forEach((t) => t.stop());
      ctx.close();
      const blob = new Blob(chunks, { type: recorder.mimeType });
      resolve({ blob, url: URL.createObjectURL(blob), peak, mic, spoke });
    };
    recorder.start();
    tick();
  });
}

// ---------------------------------------------------------------- speech-to-text

// Decodes a recording to 16 kHz mono, the input both speech models expect.
async function decode16k(blob) {
  const ctx = new AudioContext({ sampleRate: 16000 });
  try {
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    return audio.getChannelData(0).slice();
  } finally {
    ctx.close();
  }
}

// Whisper transcript (which words were said).
export async function transcribe(blob) {
  const mono = await decode16k(blob);
  const { text } = await call('stt', { audio: mono }, [mono.buffer]);
  return text;
}

// Whisper transcript plus the phonemes actually produced (how the words sounded).
// Phonemes are null when the sound model fails, so callers can fall back to words only.
export async function analyze(blob) {
  const mono = await decode16k(blob);
  const copy = mono.slice();
  const [{ text }, phones] = await Promise.all([
    call('stt', { audio: mono }, [mono.buffer]),
    call('phonemes', { audio: copy }, [copy.buffer]).then((r) => r.phones).catch(() => null),
  ]);
  return { text, phones };
}

// ---------------------------------------------------------------- text-to-speech

const ttsCache = new Map();
let playing = null;

export function stopSpeaking() {
  speakToken += 1;
  try { playing?.stop(); } catch { /* already stopped */ }
  playing = null;
}

export async function synthesize(text, { voice = 'af_heart', speed = 1 } = {}) {
  const key = `${voice}|${speed}|${text}`;
  if (!ttsCache.has(key)) {
    ttsCache.set(key, call('tts', { text, voice, speed }).catch((err) => { ttsCache.delete(key); throw err; }));
  }
  return ttsCache.get(key);
}

let speakToken = 0;

// Synthesizes the whole reply in one go: Kokoro keeps the natural intonation across
// sentences, and playback has no gaps (per-sentence playback stalled on slow CPUs).
export async function speak(text, options = {}) {
  stopSpeaking();
  const token = ++speakToken;
  const { audio, rate } = await synthesize(text, options);
  if (token !== speakToken) return; // A newer speak() or stopSpeaking() took over.
  await playBuffer(audio, rate);
}

function playBuffer(audio, rate) {
  const ctx = new AudioContext();
  const buffer = ctx.createBuffer(1, audio.length, rate);
  buffer.copyToChannel(audio, 0);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(ctx.destination);
  playing = src;
  return new Promise((resolve) => {
    src.onended = () => { ctx.close(); if (playing === src) playing = null; resolve(); };
    src.start();
  });
}
