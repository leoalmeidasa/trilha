# syntax=docker/dockerfile:1

# Static site served by unprivileged Nginx (runs as uid 101, listens on 8080).
FROM nginxinc/nginx-unprivileged:1.29-alpine

LABEL org.opencontainers.image.title="trilha" \
      org.opencontainers.image.description="Study track for DevOps + English with daily goals" \
      org.opencontainers.image.licenses="MIT"

ENV NGINX_ENTRYPOINT_QUIET_LOGS=1

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/
COPY assets/ /usr/share/nginx/html/assets/
COPY data/ /usr/share/nginx/html/data/

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD ["wget", "-q", "--spider", "http://127.0.0.1:8080/healthz"]
