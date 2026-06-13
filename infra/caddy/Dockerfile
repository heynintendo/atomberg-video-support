# Caddy with the layer4 plugin so it can TLS-terminate TURN on 5349 in addition
# to serving HTTPS on 443. This is LiveKit's recommended single-cert TURN setup.
FROM caddy:2.11.4-builder AS build
RUN xcaddy build --with github.com/mholt/caddy-l4

FROM caddy:2.11.4
COPY --from=build /usr/bin/caddy /usr/bin/caddy
