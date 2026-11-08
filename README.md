# Trilha

Build your own study track for **DevOps + English** with **daily goals**, a streak, notes, a lab tracker and a community catalog of free and paid learning resources.

The UI is in Brazilian Portuguese. It is a static site (HTML + ES modules, no build step) that runs in Docker locally and can also be published for free on GitHub Pages.

## Features

- **Hoje (Today)**: daily tasks generated from your weekly goals. `{topic}` in a goal is replaced by the topic you are currently studying. Log minutes with +5/+15/+30, skip or carry over yesterday's pending tasks.
- **Streak**: a day counts when each area (tech / English) reaches 80% of its goal (configurable: 50/80/100%).
- **Trilha (Track)**: start from a template (e.g. DevOps + English, based on [roadmap.sh/devops](https://roadmap.sh/devops)) or from scratch. Phases, topics, status, essential/optional, tags.
- **Recursos (Resources)**: catalog with filters for cost (free / freemium / paid), type, area and language. Topics suggest resources by tag. Add your own private resources too.
- **Pronúncia (Pronunciation)**: hear an A1 sentence (normal or slow), say it into the microphone and see which words were wrong, with a tip for common Brazilian mistakes (TH, final -s/-es, -ed, final consonants, short/long i, R/H). Plays your own recording back and keeps your best score per sentence. Model audio is pre-rendered with [Piper](https://github.com/OHF-Voice/piper1-gpl) into `data/audio/`, because Linux browsers often have no speech voices. Two models run **in the browser**, so audio never leaves the computer (Chrome and Firefox): Whisper (`Xenova/whisper-base.en`, ~80 MB) checks *which words* you said, and a phoneme model (`onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX`, q8, ~320 MB) checks *how they sounded*. Whisper alone "fixes" accents (it hears *tink* as *think*); the phoneme model catches TH, R/H, dropped H, final -s, long/short i and an extra "i" at the end of words, and tolerates normal accent variation. Both download once and stay cached. Recognizers forgive light accents, so compare your voice with the model audio too.
- **Conversa (Conversation)**: voice chat with "Sam", a native speaker played by Claude (Anthropic API). Sam keeps to A1 English, offers a Portuguese translation of each reply, and corrects your sentences with a short tip in Portuguese. Pick a scenario (free talk, introductions, coffee shop, routine, IT work, airport). Your speech becomes text locally (Whisper); only the text goes to the Claude API. Sam's voice is Kokoro, also running in the browser. Needs your own Anthropic API key, stored only in this browser (never in backups or exports).
- **Notas (Notes)**: Markdown knowledge base linked to topics.
- **Labs**: track the labs you publish in your `devops-labs` repository.
- **Painel (Dashboard)**: last 7 days by area, 16-week heatmap, phase progress.

## Run locally with Docker

```bash
git clone https://github.com/<you>/trilha.git
cd trilha
docker compose up -d --build
# open http://127.0.0.1:8790
```

- Change the port with `TRILHA_PORT=9000 docker compose up -d`.
- The container runs unprivileged Nginx with a read-only filesystem, all capabilities dropped and a `/healthz` endpoint.
- Compose uses the default `bridge` network and creates no new Docker network.
- `index.html`, `assets/` and `data/` are bind-mounted, so edits show up on reload.

Without Docker: `python3 -m http.server 8790 --bind 127.0.0.1`.

## Where your data lives

Progress, goals and notes are stored in **your browser** (`localStorage`). Nothing is sent anywhere.

- **Back up** often: *Config → Exportar backup completo*.
- **Move to another browser**: *Config → Importar JSON*.
- **Publish your track**: *Config → Exportar para publicar* creates `minha-trilha.json` (notes excluded by default). Commit it as `data/minha-trilha.json`. Visitors who have no local data will see it read-only.

## Publish on GitHub Pages

1. Fork this repository.
2. *Settings → Pages → Source: GitHub Actions*.
3. Push to `main`. The `ci` workflow validates the data, builds and smoke-tests the image, then deploys the site.

## Vendored libraries

`assets/vendor/ai.js` (transformers.js + kokoro-js), `assets/vendor/anthropic.js` (Anthropic SDK) and the ONNX runtime in `assets/vendor/ort/` are built from pinned npm versions and served from this site, so no third-party script runs on the page. Rebuild with `cd vendor-src && npm ci && npm run build`. Only the speech models are downloaded at runtime (from Hugging Face).

## Security

- Content Security Policy in `nginx/default.conf` and, for GitHub Pages (which sends no headers), in a `<meta>` tag in `index.html`. Scripts are same-origin only; network access is limited to this site, `api.anthropic.com` and Hugging Face.
- The Claude API key is stored only in the browser (localStorage, or sessionStorage when "lembrar" is off) and is sent only to `api.anthropic.com`. It is never part of the app state, backups or exports, and never belongs in this repository.
- Speech is processed locally; only the text of the conversation goes to the Claude API.
- Model output and user text are always HTML-escaped before rendering.

## Contributing resources and templates

- Resources: add an entry to [`data/resources.json`](data/resources.json). Use a kebab-case `id`, an `https` URL, `cost` (`free` | `freemium` | `paid`), `kind`, `area` (`tech` | `english`), `language` (`pt` | `en`) and `tags`. Do not include prices, since they change.
- Pronunciation: add sentences to [`data/pronuncia.json`](data/pronuncia.json). Each deck needs `id`, `title`, `tip` and `items` with a unique `id`, `en` and `pt`. Write numbers as words. Then generate the reference phonemes (`python scripts/gen-ipa.py --voice en_US-lessac-medium.onnx`) and render the audio: `pip install piper-tts`, download a voice (`python -m piper.download_voices en_US-lessac-medium`) and run `python scripts/gen-audio.py --voice en_US-lessac-medium.onnx`.
- Templates: add a file under `data/templates/` and register it in `data/templates/index.json`.

Run the checks before opening a PR:

```bash
node scripts/validate.mjs
node --test
```

## Roadmap for the app itself

The app doubles as a DevOps lab:

1. Docker + compose (done)
2. CI with GitHub Actions + Pages (done)
3. Helm chart and deploy to k3s/kind with Argo CD
4. Terraform for a cloud environment
5. Prometheus metrics (Nginx exporter) and Grafana dashboard
6. Image scanning (Trivy) and signing (cosign)

## License

MIT
