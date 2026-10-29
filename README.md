# Trilha

Build your own study track for **DevOps + English** with **daily goals**, a streak, notes, a lab tracker and a community catalog of free and paid learning resources.

The UI is in Brazilian Portuguese. It is a static site (HTML + ES modules, no build step) that runs in Docker locally and can also be published for free on GitHub Pages.

## Features

- **Hoje (Today)**: daily tasks generated from your weekly goals. `{topic}` in a goal is replaced by the topic you are currently studying. Log minutes with +5/+15/+30, skip or carry over yesterday's pending tasks.
- **Streak**: a day counts when each area (tech / English) reaches 80% of its goal (configurable: 50/80/100%).
- **Trilha (Track)**: start from a template (e.g. DevOps + English, based on [roadmap.sh/devops](https://roadmap.sh/devops)) or from scratch. Phases, topics, status, essential/optional, tags.
- **Recursos (Resources)**: catalog with filters for cost (free / freemium / paid), type, area and language. Topics suggest resources by tag. Add your own private resources too.
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

## Contributing resources and templates

- Resources: add an entry to [`data/resources.json`](data/resources.json). Use a kebab-case `id`, an `https` URL, `cost` (`free` | `freemium` | `paid`), `kind`, `area` (`tech` | `english`), `language` (`pt` | `en`) and `tags`. Do not include prices, since they change.
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
