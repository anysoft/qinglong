# Native addons are installed in target-platform stages, never copied across architectures.
FROM node:22.23.2-bookworm-slim AS toolchain
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential python3 git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@8.3.1
WORKDIR /build

FROM toolchain AS dependencies
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --ignore-scripts
# Native SQLite install script needs the target architecture's Node and compiler.
RUN pnpm rebuild

FROM dependencies AS build
COPY . .
ARG SOURCE_COMMIT
ARG BUILD_CREATED
RUN node scripts/build-back.cjs && node node_modules/@umijs/max/bin/max.js build \
    && node scripts/release/build-info.cjs
RUN npm_config_ignore_scripts=true pnpm prune --prod && node scripts/release/prune-fixtures.cjs

FROM node:22.23.2-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    tini bash coreutils util-linux git openssh-client openssl ca-certificates curl \
    tar gzip xz-utils tzdata python3 build-essential libssl-dev zlib1g-dev \
    libbz2-dev libreadline-dev libsqlite3-dev libffi-dev liblzma-dev libncurses-dev uuid-dev \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 platform && useradd --uid 10001 --gid 10001 --home-dir /data/home --no-create-home platform \
    && mkdir /app /data /backup && chown 10001:10001 /data /backup
WORKDIR /app
COPY --from=build /build/node_modules ./node_modules
COPY --from=build /build/static ./static
COPY --from=build /build/package.json /build/version.yaml /build/LICENSE ./
COPY --from=build /build/shell/*.py ./shell/
COPY --from=build /build/scripts/release/entrypoint.cjs /build/scripts/release/healthcheck.cjs ./scripts/release/
ARG SOURCE_COMMIT
ARG BUILD_CREATED
ARG APP_VERSION
LABEL org.opencontainers.image.title="qinglong" \
      org.opencontainers.image.description="Git-native script automation platform" \
      org.opencontainers.image.version=$APP_VERSION \
      org.opencontainers.image.revision=$SOURCE_COMMIT \
      org.opencontainers.image.source="https://github.com/anysoft/qinglong" \
      org.opencontainers.image.created=$BUILD_CREATED \
      org.opencontainers.image.licenses="Apache-2.0"
ENV NODE_ENV=production DATA_DIR=/data/state BACKUP_DIR=/backup HOME=/data/home \
    QL_DIR=/app BIND_HOST=0.0.0.0 BIND_HOST_GRPC=127.0.0.1 BACK_PORT=5700 GRPC_PORT=5500 \
    LANG=C.UTF-8 LOG_LEVEL=info
RUN chmod 0700 /data /backup
USER 10001:10001
EXPOSE 5700
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=6 CMD ["node", "scripts/release/healthcheck.cjs"]
ENTRYPOINT ["/usr/bin/tini", "--", "node", "scripts/release/entrypoint.cjs"]
