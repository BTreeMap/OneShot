FROM caddy:2.11.2-alpine

ARG BUILD_DATE
ARG VCS_REF
ARG SOURCE_URL
LABEL org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.source="${SOURCE_URL}" \
      org.opencontainers.image.title="oneshot-web" \
      org.opencontainers.image.description="OneShot frontend and reverse proxy"

RUN set -eux; \
    grep -q '^caddy:' /etc/group || addgroup -S caddy; \
    grep -q '^caddy:' /etc/passwd || adduser -S -D -H -G caddy caddy; \
    printf '%s\n' \
      '#!/bin/sh' \
      'set -eu' \
      'export WEB_PORT="${WEB_PORT:-${PORT:-8080}}"' \
      'exec "$@"' \
      > /usr/local/bin/oneshot-web-entrypoint.sh; \
    chmod 0755 /usr/local/bin/oneshot-web-entrypoint.sh

COPY --chown=root:root Caddyfile /etc/caddy/Caddyfile
RUN chmod 0644 /etc/caddy/Caddyfile
# frontend.tar.xz is produced by scripts/ci/package_frontend.sh
ADD --chown=caddy:caddy frontend.tar.xz /srv/
RUN chown -R caddy:caddy /data /config

USER caddy
ENTRYPOINT ["/usr/local/bin/oneshot-web-entrypoint.sh"]
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
EXPOSE 8080
