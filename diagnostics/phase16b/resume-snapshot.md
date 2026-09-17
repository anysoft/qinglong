# Phase 16B resume snapshot
2026-09-17T01:20:38.976516+00:00

## git status --short
```text
 M .dockerignore
 M .github/workflows/linux-qualification.yml
 M .gitignore
 M back/config/index.ts
 D docker/Dockerfile
 D docker/Dockerfile.310
 D docker/Dockerfile.debian
 D docker/Dockerfile.debian310
 D docker/docker-compose.yml
 D docker/docker-entrypoint.sh
 M package.json
 M version.yaml
?? .github/workflows/container-qualification.yml
?? .github/workflows/release.yml
?? Dockerfile
?? compose.yaml
?? diagnostics/phase16b/
?? docs/release/
?? scripts/release/
?? tests/phase16b/

```

## git status
```text
On branch develop
Your branch is ahead of 'origin/develop' by 1 commit.
  (use "git push" to publish your local commits)

Changes not staged for commit:
  (use "git add/rm <file>..." to update what will be committed)
  (use "git restore <file>..." to discard changes in working directory)
	modified:   .dockerignore
	modified:   .github/workflows/linux-qualification.yml
	modified:   .gitignore
	modified:   back/config/index.ts
	deleted:    docker/Dockerfile
	deleted:    docker/Dockerfile.310
	deleted:    docker/Dockerfile.debian
	deleted:    docker/Dockerfile.debian310
	deleted:    docker/docker-compose.yml
	deleted:    docker/docker-entrypoint.sh
	modified:   package.json
	modified:   version.yaml

Untracked files:
  (use "git add <file>..." to include in what will be committed)
	.github/workflows/container-qualification.yml
	.github/workflows/release.yml
	Dockerfile
	compose.yaml
	diagnostics/phase16b/
	docs/release/
	scripts/release/
	tests/phase16b/

no changes added to commit (use "git add" and/or "git commit -a")

```

## git branch --show-current
```text
develop

```

## git rev-parse HEAD
```text
45a163bdf59efef8ac535353e435daa1a594143d

```

## git log --oneline --decorate -15
```text
45a163bd (HEAD -> develop) docs: freeze platform 1.0 after hosted linux qualification
fc6bab97 (origin/develop, origin/HEAD) test: remove retired preload setup from scoped environment fixtures
32bbdbd2 ci: enforce ten socket qualification rounds and finalize candidate
f61de1c1 Remove legacy QingLong compatibility paths
abd5939e ci: fix linux hosted validation
a4e95c57 Merge branch 'codex/phase14-backup-restore' into develop
218bc291 (codex/phase14-backup-restore) Remove GitHub build and validation workflows
e27f2380 Remove obsolete legacy implementation paths
d065ce86 Refactor fresh-install platform architecture and diagnostics
fd4270e1 Document Phase 14 backup bridge status and baseline tests
88a059c8 (codex/phase13-observability) Refactor platform architecture and remove obsolete code
de01f425 (codex/phase11-discovery-triggers) Refactor platform architecture for fresh-install support
e1ee6f80 (codex/phase10-execution-engine) Refactor platform architecture and workflows
bf7f5ec5 (codex/phase9-task-domain) Align platform with fresh-install-only architecture
47294399 (codex/phase8-node-environments) Add Node runtime environment operations and CI gates

```

## git diff --stat
```text
 .dockerignore                             |  37 +++++---
 .github/workflows/linux-qualification.yml |   1 +
 .gitignore                                |   5 ++
 back/config/index.ts                      |   4 +-
 docker/Dockerfile                         | 113 -----------------------
 docker/Dockerfile.310                     | 113 -----------------------
 docker/Dockerfile.debian                  | 128 --------------------------
 docker/Dockerfile.debian310               | 128 --------------------------
 docker/docker-compose.yml                 |  10 ---
 docker/docker-entrypoint.sh               | 143 ------------------------------
 package.json                              |   2 +-
 version.yaml                              |  38 +-------
 12 files changed, 38 insertions(+), 684 deletions(-)

```

## git diff
```text
diff --git a/.dockerignore b/.dockerignore
index 1f28245d..9f10ee10 100644
--- a/.dockerignore
+++ b/.dockerignore
@@ -1,13 +1,26 @@
-.git
-.gitnexus
-.claude
-.codex
-.env*
-node_modules
-data
-audit
-docs
-test
+*
+!package.json
+!pnpm-lock.yaml
+!.npmrc
+!LICENSE
+!version.yaml
+!tsconfig.json
+!config/
+!config/**
+!src/
+!src/**
 src/.umi*
-**/__pycache__
-**/*.log
+src/.umi*/**
+!public/
+!public/**
+!back/
+!back/**
+!shell/
+!shell/*.py
+!scripts/
+!scripts/build-back.cjs
+!scripts/release/
+!scripts/release/build-info.cjs
+!scripts/release/entrypoint.cjs
+!scripts/release/healthcheck.cjs
+!.umirc.ts
diff --git a/.github/workflows/linux-qualification.yml b/.github/workflows/linux-qualification.yml
index 7682d3a6..58c5f97b 100644
--- a/.github/workflows/linux-qualification.yml
+++ b/.github/workflows/linux-qualification.yml
@@ -2,6 +2,7 @@ name: Linux Qualification
 
 on:
   workflow_dispatch:
+  workflow_call:
 
 permissions:
   contents: read
diff --git a/.gitignore b/.gitignore
index e929a3c7..799fe569 100644
--- a/.gitignore
+++ b/.gitignore
@@ -52,3 +52,8 @@ ci-downloaded/
 /diagnostics/phase15/managed-local/
 /diagnostics/qualification/
 /qualification-downloaded/
+
+# Owned release build artifacts; never commit images or scanner binaries.
+/release-output/
+/release-input/
+/release-tools/
diff --git a/back/config/index.ts b/back/config/index.ts
index 1e5b4e2f..55a92496 100644
--- a/back/config/index.ts
+++ b/back/config/index.ts
@@ -89,7 +89,7 @@ if (process.env.QL_DATA_DIR) {
 }
 
 const shellPath = path.join(rootPath, 'shell/');
-const tmpPath = path.join(rootPath, '.tmp/');
+const tmpPath = path.join(dataPath, '.tmp/');
 const samplePath = path.join(rootPath, 'sample/');
 const configPath = path.join(dataPath, 'config/');
 const logPath = path.join(dataPath, 'log/');
@@ -100,7 +100,7 @@ const systemLogPath = path.join(dataPath, 'syslog/');
 
 const versionFile = path.join(rootPath, 'version.yaml');
 
-if (envFound.error) {
+if (envFound.error && !process.env.JWT_SECRET) {
   throw new Error("⚠️  Couldn't find .env file  ⚠️");
 }
 
diff --git a/docker/Dockerfile b/docker/Dockerfile
deleted file mode 100644
index b18f6bc8..00000000
--- a/docker/Dockerfile
+++ /dev/null
@@ -1,113 +0,0 @@
-# Run Node package installation natively on the builder. Node/npm can spin at
-# 100% CPU when Alpine s390x is emulated through QEMU.
-FROM --platform=$BUILDPLATFORM node:18-alpine3.18 AS builder
-
-ARG TARGETARCH
-ENV NPM_CONFIG_PREFIX=/opt/node-global
-ENV PATH=/opt/node-global/bin:${PATH}
-
-COPY package.json .npmrc pnpm-lock.yaml /tmp/build/
-RUN set -x \
-  && apk add --no-cache git \
-  && npm i -g pnpm@8.3.1 pm2 ts-node typescript@5 \
-  && cd /tmp/build \
-  && case "${TARGETARCH}" in \
-    amd64) NODE_ARCH=x64 ;; \
-    386) NODE_ARCH=ia32 ;; \
-    ppc64le) NODE_ARCH=ppc64 ;; \
-    *) NODE_ARCH="${TARGETARCH}" ;; \
-  esac \
-  && npm_config_target_platform=linux \
-    npm_config_target_arch="${NODE_ARCH}" \
-    npm_config_target_libc=musl \
-    pnpm install --prod --frozen-lockfile
-
-FROM python:3.11-alpine
-
-ARG QL_MAINTAINER="whyour"
-LABEL maintainer="${QL_MAINTAINER}"
-ARG QL_URL=https://github.com/${QL_MAINTAINER}/qinglong.git
-ARG QL_BRANCH=develop
-ARG PYTHON_SHORT_VERSION=3.11
-
-ENV QL_DIR=/ql \
-  QL_BRANCH=${QL_BRANCH} \
-  QL_CONTAINER=true \
-  LANG=C.UTF-8 \
-  SHELL=/bin/bash \
-  PS1="\u@\h:\w \$ "
-
-VOLUME /ql/data
-
-EXPOSE 5700
-
-COPY --from=builder /opt/node-global/lib/node_modules/. /usr/local/lib/node_modules/
-COPY --from=builder /opt/node-global/bin/. /usr/local/bin/
-
-RUN set -x \
-  && apk update -f \
-  && apk upgrade \
-  && apk --no-cache add -f bash \
-  coreutils \
-  git \
-  curl \
-  wget \
-  tzdata \
-  perl \
-  openssl \
-  nodejs \
-  jq \
-  openssh \
-  procps \
-  netcat-openbsd \
-  unzip \
-  npm \
-  && rm -rf /var/cache/apk/* \
-  && apk update \
-  && ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
-  && echo "Asia/Shanghai" > /etc/timezone \
-  && git config --global user.email "qinglong@users.noreply.github.com" \
-  && git config --global user.name "qinglong" \
-  && git config --global http.postBuffer 524288000 \
-  && rm -rf /root/.cache \
-  && ulimit -c 0
-
-ARG SOURCE_COMMIT
-LABEL org.opencontainers.image.revision=${SOURCE_COMMIT}
-RUN git clone --depth=1 -b ${QL_BRANCH} ${QL_URL} ${QL_DIR} \
-  && cd ${QL_DIR} \
-  && if [ -n "${SOURCE_COMMIT}" ]; then git fetch --depth=1 origin "${SOURCE_COMMIT}" && git reset --hard FETCH_HEAD; fi \
-  && cp -f .env.example .env \
-  && chmod 777 ${QL_DIR}/shell/*.sh \
-  && chmod 777 ${QL_DIR}/docker/*.sh
-
-# Downloaded by CI from the build-static job in this workflow run.
-COPY static/ /ql/static/
-COPY docker/verify-build.cjs docker/build-manifest.cjs /tmp/
-COPY --from=builder /tmp/build/pnpm-lock.yaml /tmp/dependency-lock.yaml
-RUN cd ${QL_DIR} && node /tmp/verify-build.cjs /tmp/dependency-lock.yaml
-
-ENV PNPM_HOME=${QL_DIR}/data/dep_cache/node \
-  PYTHON_HOME=${QL_DIR}/data/dep_cache/python3 \
-  PYTHONUSERBASE=${QL_DIR}/data/dep_cache/python3 \
-  HOME=/root
-
-ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PNPM_HOME}:${PYTHON_HOME}/bin:${HOME}/bin \
-  NODE_PATH=/usr/local/bin:/usr/local/lib/node_modules \
-  PIP_CACHE_DIR=${PYTHON_HOME}/pip \
-  PYTHONPATH=${PYTHON_HOME}:${PYTHON_HOME}/lib/python${PYTHON_SHORT_VERSION}:${PYTHON_HOME}/lib/python${PYTHON_SHORT_VERSION}/site-packages
-
-RUN pip3 install --prefix ${PYTHON_HOME} requests
-
-COPY --from=builder /tmp/build/node_modules/. /ql/node_modules/
-
-RUN ln -sf ${QL_DIR}/shell/task.sh /usr/local/bin/task \
-  && ln -sf ${QL_DIR}/shell/update.sh /usr/local/bin/ql \
-  && chmod +x /usr/local/bin/task /usr/local/bin/ql
-
-WORKDIR ${QL_DIR}
-
-HEALTHCHECK --interval=5s --timeout=2s --retries=20 \
-  CMD curl -sf --noproxy '*' http://localhost:${BACK_PORT:-5700}/api/health || exit 1
-
-ENTRYPOINT ["./docker/docker-entrypoint.sh"]
diff --git a/docker/Dockerfile.310 b/docker/Dockerfile.310
deleted file mode 100644
index a4e41c7c..00000000
--- a/docker/Dockerfile.310
+++ /dev/null
@@ -1,113 +0,0 @@
-# Run Node package installation natively on the builder. Node/npm can spin at
-# 100% CPU when Alpine s390x is emulated through QEMU.
-FROM --platform=$BUILDPLATFORM node:18-alpine3.18 AS builder
-
-ARG TARGETARCH
-ENV NPM_CONFIG_PREFIX=/opt/node-global
-ENV PATH=/opt/node-global/bin:${PATH}
-
-COPY package.json .npmrc pnpm-lock.yaml /tmp/build/
-RUN set -x \
-  && apk add --no-cache git \
-  && npm i -g pnpm@8.3.1 pm2 ts-node typescript@5 \
-  && cd /tmp/build \
-  && case "${TARGETARCH}" in \
-    amd64) NODE_ARCH=x64 ;; \
-    386) NODE_ARCH=ia32 ;; \
-    ppc64le) NODE_ARCH=ppc64 ;; \
-    *) NODE_ARCH="${TARGETARCH}" ;; \
-  esac \
-  && npm_config_target_platform=linux \
-    npm_config_target_arch="${NODE_ARCH}" \
-    npm_config_target_libc=musl \
-    pnpm install --prod --frozen-lockfile
-
-FROM python:3.10-alpine
-
-ARG QL_MAINTAINER="whyour"
-LABEL maintainer="${QL_MAINTAINER}"
-ARG QL_URL=https://github.com/${QL_MAINTAINER}/qinglong.git
-ARG QL_BRANCH=develop
-ARG PYTHON_SHORT_VERSION=3.10
-
-ENV QL_DIR=/ql \
-  QL_BRANCH=${QL_BRANCH} \
-  QL_CONTAINER=true \
-  LANG=C.UTF-8 \
-  SHELL=/bin/bash \
-  PS1="\u@\h:\w \$ "
-
-VOLUME /ql/data
-
-EXPOSE 5700
-
-COPY --from=builder /opt/node-global/lib/node_modules/. /usr/local/lib/node_modules/
-COPY --from=builder /opt/node-global/bin/. /usr/local/bin/
-
-RUN set -x \
-  && apk update -f \
-  && apk upgrade \
-  && apk --no-cache add -f bash \
-  coreutils \
-  git \
-  curl \
-  wget \
-  tzdata \
-  perl \
-  openssl \
-  nodejs \
-  jq \
-  openssh \
-  procps \
-  netcat-openbsd \
-  unzip \
-  npm \
-  && rm -rf /var/cache/apk/* \
-  && apk update \
-  && ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
-  && echo "Asia/Shanghai" > /etc/timezone \
-  && git config --global user.email "qinglong@users.noreply.github.com" \
-  && git config --global user.name "qinglong" \
-  && git config --global http.postBuffer 524288000 \
-  && rm -rf /root/.cache \
-  && ulimit -c 0
-
-ARG SOURCE_COMMIT
-LABEL org.opencontainers.image.revision=${SOURCE_COMMIT}
-RUN git clone --depth=1 -b ${QL_BRANCH} ${QL_URL} ${QL_DIR} \
-  && cd ${QL_DIR} \
-  && if [ -n "${SOURCE_COMMIT}" ]; then git fetch --depth=1 origin "${SOURCE_COMMIT}" && git reset --hard FETCH_HEAD; fi \
-  && cp -f .env.example .env \
-  && chmod 777 ${QL_DIR}/shell/*.sh \
-  && chmod 777 ${QL_DIR}/docker/*.sh
-
-# Downloaded by CI from the build-static job in this workflow run.
-COPY static/ /ql/static/
-COPY docker/verify-build.cjs docker/build-manifest.cjs /tmp/
-COPY --from=builder /tmp/build/pnpm-lock.yaml /tmp/dependency-lock.yaml
-RUN cd ${QL_DIR} && node /tmp/verify-build.cjs /tmp/dependency-lock.yaml
-
-ENV PNPM_HOME=${QL_DIR}/data/dep_cache/node \
-  PYTHON_HOME=${QL_DIR}/data/dep_cache/python3 \
-  PYTHONUSERBASE=${QL_DIR}/data/dep_cache/python3 \
-  HOME=/root
-
-ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PNPM_HOME}:${PYTHON_HOME}/bin:${HOME}/bin \
-  NODE_PATH=/usr/local/bin:/usr/local/lib/node_modules \
-  PIP_CACHE_DIR=${PYTHON_HOME}/pip \
-  PYTHONPATH=${PYTHON_HOME}:${PYTHON_HOME}/lib/python${PYTHON_SHORT_VERSION}:${PYTHON_HOME}/lib/python${PYTHON_SHORT_VERSION}/site-packages
-
-RUN pip3 install --prefix ${PYTHON_HOME} requests
-
-COPY --from=builder /tmp/build/node_modules/. /ql/node_modules/
-
-RUN ln -sf ${QL_DIR}/shell/task.sh /usr/local/bin/task \
-  && ln -sf ${QL_DIR}/shell/update.sh /usr/local/bin/ql \
-  && chmod +x /usr/local/bin/task /usr/local/bin/ql
-
-WORKDIR ${QL_DIR}
-
-HEALTHCHECK --interval=5s --timeout=2s --retries=20 \
-  CMD curl -sf --noproxy '*' http://localhost:${BACK_PORT:-5700}/api/health || exit 1
-
-ENTRYPOINT ["./docker/docker-entrypoint.sh"]
diff --git a/docker/Dockerfile.debian b/docker/Dockerfile.debian
deleted file mode 100644
index 79b491ff..00000000
--- a/docker/Dockerfile.debian
+++ /dev/null
@@ -1,128 +0,0 @@
-# Node 20 Bookworm is the latest official Node image variant that covers the
-# full Debian build matrix, including arm/v7, ppc64le, and s390x.
-FROM node:20-bookworm-slim AS nodebuilder
-
-FROM python:3.11.14-slim-bookworm AS builder
-COPY package.json .npmrc pnpm-lock.yaml /tmp/build/
-COPY --from=nodebuilder /usr/local/bin/node /usr/local/bin/
-COPY --from=nodebuilder /usr/local/lib/node_modules/. /usr/local/lib/node_modules/
-RUN set -x && \
-  ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && \
-  apt-get update && \
-  apt-get install --no-install-recommends -y libatomic1 && \
-  npm i -g pnpm@8.3.1 && \
-  cd /tmp/build && \
-  pnpm install --prod --frozen-lockfile
-
-FROM python:3.11.14-slim-bookworm
-
-ARG QL_MAINTAINER="whyour"
-LABEL maintainer="${QL_MAINTAINER}"
-ARG QL_URL=https://github.com/${QL_MAINTAINER}/qinglong.git
-ARG QL_BRANCH=develop
-ARG PYTHON_SHORT_VERSION=3.11
-
-ENV QL_DIR=/ql \
-  QL_BRANCH=${QL_BRANCH} \
-  QL_CONTAINER=true \
-  LANG=C.UTF-8 \
-  SHELL=/bin/bash \
-  PS1="\u@\h:\w \$ "
-
-ARG QL_UID=5432
-ARG QL_GID=5432
-RUN groupadd -g ${QL_GID} qinglong && \
-    useradd -m -u ${QL_UID} -g ${QL_GID} -s /bin/bash qinglong && \
-    mkdir -p /home/qinglong/bin /home/qinglong/.ssh && \
-    chmod 700 /home/qinglong/.ssh && \
-    chown -R ${QL_UID}:${QL_GID} /home/qinglong && \
-    mkdir -p /etc/sudoers.d && \
-    echo 'qinglong ALL=(ALL) NOPASSWD: ALL' > /etc/sudoers.d/qinglong
-
-ENV QL_USER=qinglong
-ENV QL_HOME=/home/$QL_USER
-
-COPY --from=nodebuilder /usr/local/bin/node /usr/local/bin/
-COPY --from=nodebuilder /usr/local/lib/node_modules/. /usr/local/lib/node_modules/
-
-RUN set -x && \
-  ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && \
-  ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx && \
-  apt-get update && \
-  apt-get upgrade -y && \
-  apt-get install --no-install-recommends -y git \
-  curl \
-  wget \
-  tzdata \
-  perl \
-  openssl \
-  openssh-client \
-  jq \
-  procps \
-  netcat-openbsd \
-  sudo \
-  unzip \
-  libatomic1 && \
-  apt-get clean && \
-  ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
-  echo "Asia/Shanghai" >/etc/timezone && \
-  git config --global user.email "qinglong@users.noreply.github.com" && \
-  git config --global user.name "qinglong" && \
-  git config --global http.postBuffer 524288000 && \
-  npm install -g pnpm@8.3.1 pm2 ts-node typescript@5 && \
-  npm cache clean --force && \
-  rm -rf /root/.cache && \
-  rm -rf /root/.npm && \
-  rm -rf /var/lib/apt/lists/* && \
-  rm -rf /etc/apt/apt.conf.d/docker-clean && \
-  ulimit -c 0
-
-RUN mkdir -p ${QL_DIR} && \
-  chown -R ${QL_UID}:${QL_GID} ${QL_DIR}
-
-USER qinglong
-ARG SOURCE_COMMIT
-LABEL org.opencontainers.image.revision=${SOURCE_COMMIT}
-RUN git clone --depth=1 -b ${QL_BRANCH} ${QL_URL} ${QL_DIR} \
-  && cd ${QL_DIR} \
-  && if [ -n "${SOURCE_COMMIT}" ]; then git fetch --depth=1 origin "${SOURCE_COMMIT}" && git reset --hard FETCH_HEAD; fi \
-  && cp -f .env.example .env \
-  && chmod 777 ${QL_DIR}/shell/*.sh \
-  && chmod 777 ${QL_DIR}/docker/*.sh
-
-# Downloaded by CI from the build-static job in this workflow run.
-COPY --chown=qinglong:qinglong static/ /ql/static/
-COPY docker/verify-build.cjs docker/build-manifest.cjs /tmp/
-COPY --from=builder /tmp/build/pnpm-lock.yaml /tmp/dependency-lock.yaml
-RUN cd ${QL_DIR} && node /tmp/verify-build.cjs /tmp/dependency-lock.yaml
-
-ENV PNPM_HOME=${QL_DIR}/data/dep_cache/node \
-  PYTHON_HOME=${QL_DIR}/data/dep_cache/python3 \
-  PYTHONUSERBASE=${QL_DIR}/data/dep_cache/python3 \
-  HOME=/home/qinglong
-
-ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PNPM_HOME}:${PYTHON_HOME}/bin:${HOME}/bin \
-  NODE_PATH=/usr/local/bin:/usr/local/lib/node_modules \
-  PIP_CACHE_DIR=${PYTHON_HOME}/pip \
-  PYTHONPATH=${PYTHON_HOME}:${PYTHON_HOME}/lib/python${PYTHON_SHORT_VERSION}:${PYTHON_HOME}/lib/python${PYTHON_SHORT_VERSION}/site-packages
-
-RUN pip3 install --prefix ${PYTHON_HOME} requests
-
-COPY --chown=qinglong:qinglong --from=builder /tmp/build/node_modules/. /ql/node_modules/
-
-USER root
-
-RUN ln -sf ${QL_DIR}/shell/task.sh /usr/local/bin/task \
-  && ln -sf ${QL_DIR}/shell/update.sh /usr/local/bin/ql \
-  && chmod +x /usr/local/bin/task /usr/local/bin/ql
-
-WORKDIR ${QL_DIR}
-
-HEALTHCHECK --interval=5s --timeout=2s --retries=20 \
-  CMD curl -sf --noproxy '*' http://localhost:${BACK_PORT:-5700}/api/health || exit 1
-
-ENTRYPOINT ["./docker/docker-entrypoint.sh"]
-
-VOLUME /ql/data
-
-EXPOSE 5700
diff --git a/docker/Dockerfile.debian310 b/docker/Dockerfile.debian310
deleted file mode 100644
index b7f6055f..00000000
--- a/docker/Dockerfile.debian310
+++ /dev/null
@@ -1,128 +0,0 @@
-# Node 20 Bookworm is the latest official Node image variant that covers the
-# full Debian build matrix, including arm/v7, ppc64le, and s390x.
-FROM node:20-bookworm-slim AS nodebuilder
-
-FROM python:3.10-slim-bookworm AS builder
-COPY package.json .npmrc pnpm-lock.yaml /tmp/build/
-COPY --from=nodebuilder /usr/local/bin/node /usr/local/bin/
-COPY --from=nodebuilder /usr/local/lib/node_modules/. /usr/local/lib/node_modules/
-RUN set -x && \
-  ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && \
-  apt-get update && \
-  apt-get install --no-install-recommends -y libatomic1 && \
-  npm i -g pnpm@8.3.1 && \
-  cd /tmp/build && \
-  pnpm install --prod --frozen-lockfile
-
-FROM python:3.10-slim-bookworm
-
-ARG QL_MAINTAINER="whyour"
-LABEL maintainer="${QL_MAINTAINER}"
-ARG QL_URL=https://github.com/${QL_MAINTAINER}/qinglong.git
-ARG QL_BRANCH=develop
-ARG PYTHON_SHORT_VERSION=3.10
-
-ENV QL_DIR=/ql \
-  QL_BRANCH=${QL_BRANCH} \
-  QL_CONTAINER=true \
-  LANG=C.UTF-8 \
-  SHELL=/bin/bash \
-  PS1="\u@\h:\w \$ "
-
-ARG QL_UID=5432
-ARG QL_GID=5432
-RUN groupadd -g ${QL_GID} qinglong && \
-    useradd -m -u ${QL_UID} -g ${QL_GID} -s /bin/bash qinglong && \
-    mkdir -p /home/qinglong/bin /home/qinglong/.ssh && \
-    chmod 700 /home/qinglong/.ssh && \
-    chown -R ${QL_UID}:${QL_GID} /home/qinglong && \
-    mkdir -p /etc/sudoers.d && \
-    echo 'qinglong ALL=(ALL) NOPASSWD: ALL' > /etc/sudoers.d/qinglong
-
-ENV QL_USER=qinglong
-ENV QL_HOME=/home/$QL_USER
-
-COPY --from=nodebuilder /usr/local/bin/node /usr/local/bin/
-COPY --from=nodebuilder /usr/local/lib/node_modules/. /usr/local/lib/node_modules/
-
-RUN set -x && \
-  ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && \
-  apt-get update && \
-  apt-get upgrade -y && \
-  apt-get install --no-install-recommends -y git \
-  curl \
-  wget \
-  tzdata \
-  perl \
-  openssl \
-  openssh-client \
-  jq \
-  procps \
-  netcat-openbsd \
-  sudo \
-  unzip \
-  libatomic1 && \
-  apt-get clean && \
-  ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
-  echo "Asia/Shanghai" >/etc/timezone && \
-  git config --global user.email "qinglong@users.noreply.github.com" && \
-  git config --global user.name "qinglong" && \
-  git config --global http.postBuffer 524288000 && \
-  npm install -g pnpm@8.3.1 pm2 ts-node typescript@5 && \
-  npm cache clean --force && \
-  rm -rf /root/.cache && \
-  rm -rf /root/.npm && \
-  rm -rf /var/lib/apt/lists/* && \
-  rm -rf /etc/apt/apt.conf.d/docker-clean && \
-  ulimit -c 0
-
-RUN mkdir -p ${QL_DIR} && \
-  chown -R ${QL_UID}:${QL_GID} ${QL_DIR}
-
-USER qinglong
-
-ARG SOURCE_COMMIT
-LABEL org.opencontainers.image.revision=${SOURCE_COMMIT}
-RUN git clone --depth=1 -b ${QL_BRANCH} ${QL_URL} ${QL_DIR} \
-  && cd ${QL_DIR} \
-  && if [ -n "${SOURCE_COMMIT}" ]; then git fetch --depth=1 origin "${SOURCE_COMMIT}" && git reset --hard FETCH_HEAD; fi \
-  && cp -f .env.example .env \
-  && chmod 777 ${QL_DIR}/shell/*.sh \
-  && chmod 777 ${QL_DIR}/docker/*.sh
-
-# Downloaded by CI from the build-static job in this workflow run.
-COPY --chown=qinglong:qinglong static/ /ql/static/
-COPY docker/verify-build.cjs docker/build-manifest.cjs /tmp/
-COPY --from=builder /tmp/build/pnpm-lock.yaml /tmp/dependency-lock.yaml
-RUN cd ${QL_DIR} && node /tmp/verify-build.cjs /tmp/dependency-lock.yaml
-
-ENV PNPM_HOME=${QL_DIR}/data/dep_cache/node \
-  PYTHON_HOME=${QL_DIR}/data/dep_cache/python3 \
-  PYTHONUSERBASE=${QL_DIR}/data/dep_cache/python3 \
-  HOME=/home/qinglong
-
-ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PNPM_HOME}:${PYTHON_HOME}/bin:${HOME}/bin \
-  NODE_PATH=/usr/local/bin:/usr/local/lib/node_modules \
-  PIP_CACHE_DIR=${PYTHON_HOME}/pip \
-  PYTHONPATH=${PYTHON_HOME}:${PYTHON_HOME}/lib/python${PYTHON_SHORT_VERSION}:${PYTHON_HOME}/lib/python${PYTHON_SHORT_VERSION}/site-packages
-
-RUN pip3 install --prefix ${PYTHON_HOME} requests
-
-COPY --chown=qinglong:qinglong --from=builder /tmp/build/node_modules/. /ql/node_modules/
-
-USER root
-
-RUN ln -sf ${QL_DIR}/shell/task.sh /usr/local/bin/task \
-  && ln -sf ${QL_DIR}/shell/update.sh /usr/local/bin/ql \
-  && chmod +x /usr/local/bin/task /usr/local/bin/ql
-
-WORKDIR ${QL_DIR}
-
-HEALTHCHECK --interval=5s --timeout=2s --retries=20 \
-  CMD curl -sf --noproxy '*' http://localhost:${BACK_PORT:-5700}/api/health || exit 1
-
-ENTRYPOINT ["./docker/docker-entrypoint.sh"]
-
-VOLUME /ql/data
-
-EXPOSE 5700
diff --git a/docker/docker-compose.yml b/docker/docker-compose.yml
deleted file mode 100644
index 2461a966..00000000
--- a/docker/docker-compose.yml
+++ /dev/null
@@ -1,10 +0,0 @@
-services:
-  web:
-    image: whyour/qinglong:latest # 基于 Debian 的版本：whyour/qinglong:debian  
-    volumes:
-      - ./data:/ql/data
-    ports:
-      - "5700:5700"
-    environment:
-      QlBaseUrl: '/' # 部署路径非必须，以斜杠开头和结尾，比如 /test/
-    restart: unless-stopped
diff --git a/docker/docker-entrypoint.sh b/docker/docker-entrypoint.sh
deleted file mode 100755
index 9a602d06..00000000
--- a/docker/docker-entrypoint.sh
+++ /dev/null
@@ -1,143 +0,0 @@
-#!/bin/bash
-
-dir_shell=/ql/shell
-. $dir_shell/share.sh
-
-export_ql_envs() {
-  export BACK_PORT="${ql_port}"
-  export GRPC_PORT="${ql_grpc_port}"
-}
-
-log_with_style() {
-  local level="$1"
-  local message="$2"
-  local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
-  printf "\n[%s] [%7s]  %s\n" "${timestamp}" "${level}" "${message}"
-}
-
-# ============================================
-# 确保当前用户对 /ql 和 /ql/data 目录有写入权限
-# /ql/data 是 Docker Volume 挂载点，权限可能与 /ql 不同，需单独检测
-# ============================================
-ensure_ql_permissions() {
-  local current_uid
-  local current_gid
-  current_uid=$(id -u)
-  current_gid=$(id -g)
-
-  if [ "$current_uid" -eq 0 ]; then
-    return 0
-  fi
-
-  # ---- 检查 /ql 目录 ----
-  if ! mkdir -p "$QL_DIR/.tmp" 2>/dev/null; then
-    if chown -R "$current_uid:$current_gid" "$QL_DIR" 2>/dev/null; then
-      log_with_style "INFO" "已修正 /ql 目录权限: UID=$current_uid GID=$current_gid"
-    else
-      local ql_owner
-      ql_owner=$(stat -c '%u' "$QL_DIR" 2>/dev/null || stat -f '%u' "$QL_DIR" 2>/dev/null)
-      log_with_style "ERROR" "============================================="
-      log_with_style "ERROR" "  权限错误：无法写入 /ql 目录"
-      log_with_style "ERROR" "  当前用户 UID: $current_uid"
-      log_with_style "ERROR" "  /ql 目录所有者 UID: ${ql_owner:-未知}"
-      log_with_style "ERROR" ""
-      log_with_style "ERROR" "  解决方案："
-      log_with_style "ERROR" "  1. 使用镜像内置用户: docker run --user ${ql_owner:-5432}:${ql_owner:-5432} ..."
-      log_with_style "ERROR" "  2. 使用 root 运行: 移除 --user 参数"
-      log_with_style "ERROR" "  3. 修正宿主机数据目录: chown -R $current_uid:$current_gid /path/to/ql/data"
-      log_with_style "ERROR" "============================================="
-      exit 1
-    fi
-  fi
-  rmdir "$QL_DIR/.tmp" 2>/dev/null || true
-
-  # ---- 检查 /ql/data 目录（Volume 挂载点，不在用户数据卷内创建临时文件） ----
-  if [ ! -w "$QL_DIR/data" ] || [ ! -x "$QL_DIR/data" ]; then
-    if chown "$current_uid:$current_gid" "$QL_DIR/data" 2>/dev/null; then
-      log_with_style "INFO" "已修正 /ql/data 目录权限: UID=$current_uid GID=$current_gid"
-      if [ ! -w "$QL_DIR/data" ] || [ ! -x "$QL_DIR/data" ]; then
-        log_with_style "ERROR" "修正后仍无法写入 /ql/data，请检查挂载的数据卷权限"
-        log_with_style "ERROR" "确保宿主机目录: chown -R $current_uid:$current_gid /your/data"
-        exit 1
-      fi
-    else
-      local data_owner
-      data_owner=$(stat -c '%u' "$QL_DIR/data" 2>/dev/null || stat -f '%u' "$QL_DIR/data" 2>/dev/null)
-      log_with_style "ERROR" "============================================="
-      log_with_style "ERROR" "  权限错误：无法写入 /ql/data (Volume 挂载点)"
-      log_with_style "ERROR" "  当前用户 UID: $current_uid"
-      log_with_style "ERROR" "  /ql/data 所有者 UID: ${data_owner:-未知}"
-      log_with_style "ERROR" ""
-      log_with_style "ERROR" "  请修正宿主机数据目录权限："
-      log_with_style "ERROR" "  chown -R $current_uid:$current_gid /your/ql/data"
-      log_with_style "ERROR" "============================================="
-      exit 1
-    fi
-  fi
-}
-
-# Fix DNS resolution issues in Alpine Linux
-if [ -f /etc/alpine-release ]; then
-  if ! grep -q "^options ndots:0" /etc/resolv.conf 2>/dev/null; then
-    echo "options ndots:0" >> /etc/resolv.conf
-    log_with_style "INFO" "🔧  0. 已配置 DNS 解析优化 (ndots:0)"
-  fi
-fi
-
-# 确保 /etc/hosts 包含 localhost 解析（应对精简镜像或仅 IPv4/IPv6 环境）
-if ! grep -qE '^127\.0\.0\.1[[:space:]]+.*localhost' /etc/hosts 2>/dev/null; then
-  echo "127.0.0.1 localhost" >> /etc/hosts
-  log_with_style "INFO" "🔧  0. 已添加 IPv4 localhost 解析"
-fi
-if ! grep -qE '^::1[[:space:]]+.*localhost' /etc/hosts 2>/dev/null; then
-  echo "::1 localhost ip6-localhost ip6-loopback" >> /etc/hosts
-  log_with_style "INFO" "🔧  0. 已添加 IPv6 localhost 解析"
-fi
-
-# 自定义用户（非 qinglong/root）可能 HOME 为空或不可写
-# 修正 HOME 确保 npm/pip/pm2 等工具有可用的缓存目录
-if [ ! -w "$HOME" ]; then
-  mkdir -p "$QL_DIR/.tmp"
-  export HOME="$QL_DIR/.tmp"
-fi
-
-# 在一切操作之前检查目录权限
-ensure_ql_permissions
-
-log_with_style "INFO" "🚀  1. 检测配置文件..."
-load_ql_envs
-export_ql_envs
-. $dir_shell/env.sh
-import_config "$@"
-fix_config
-
-# Try to initialize PM2, but don't fail if it doesn't work
-pm2 l &>/dev/null || log_with_style "WARN" "PM2 初始化可能失败，将在启动时尝试使用备用方案"
-
-log_with_style "INFO" "⚙️  2. 启动 pm2 服务..."
-reload_pm2
-
-
-if [[ $EnableExtraShell == true ]]; then
-  log_with_style "INFO" "🛠️  4. 执行自定义脚本..."
-  nohup ql extra >$dir_log/extra.log 2>&1 &
-fi
-
-log_with_style "SUCCESS" "🎉  容器启动成功!"
-
-# 自动检测调度模式：有 crond 二进制 → system 模式，否则 node 模式
-if [ -z "$QL_SCHEDULER" ]; then
-  if command -v crond &>/dev/null; then
-    export QL_SCHEDULER="system"
-  else
-    export QL_SCHEDULER="node"
-  fi
-fi
-
-if [ "$QL_SCHEDULER" = "system" ]; then
-  crond -f > /dev/null
-else
-  tail -f /dev/null
-fi
-
-exec "$@"
diff --git a/package.json b/package.json
index 1e7eb2c9..c6c08ba4 100644
--- a/package.json
+++ b/package.json
@@ -1,7 +1,7 @@
 {
   "name": "@whyour/qinglong",
   "packageManager": "pnpm@8.3.1",
-  "version": "2.21.0-16",
+  "version": "1.0.0",
   "description": "Timed task management platform supporting Python3, JavaScript, Shell, Typescript",
   "repository": {
     "type": "git",
diff --git a/version.yaml b/version.yaml
index ce86d2b4..ddfe14a6 100644
--- a/version.yaml
+++ b/version.yaml
@@ -1,35 +1,5 @@
-version: 2.21.0
-changeLogLink: https://t.me/jiao_long/436
-publishTime: 2026-06-18 2300
+version: 1.0.0
+changeLogLink: https://github.com/anysoft/qinglong/releases
+publishTime: ""
 changeLog: |
-  1. shell 增加国际化支持
-  2. 接口提示信息国际化，更新国际化文案
-  3. 统一 Alpine/Debian 分支，QL_SCHEDULER 参数化调度
-  4. grpc 服务增加证书校验
-  5. 定时任务增加 work_dir 设置
-  6. 增加任务统计功能
-  7. 新增 OpeniLink 通知渠道
-  8. 支持自定义接收邮箱地址
-  9. 增加运行实例功能
-  10. 增加 sudo 命令判断
-  11. 延迟增加运行时间提示
-  12. 开机运行任务支持同时开始运行
-  13. 增加 localhost 检测
-  14. 增加环境变量标签功能
-  15. 修复路径穿越安全漏洞
-  16. 修复配置文件路径可能越权
-  17. 修复 work_dir 验证和目录判断
-  18. 修复多个 API 问题（getCronById、定时任务参数、任务退出码等）
-  19. 修复 ESM 依赖查询路径
-  20. 修复 CodeMirror 页面切换多实例崩溃
-  21. 修复 IPv6 网络连接问题
-  22. 修复内部服务 IP 地址
-  23. 修复 gRPC extra_schedules 为空时序列化报错
-  24. 修复 HITOKOTO 参数布尔/字符串类型处理
-  25. 修复 Server酱 返回错误时 undefined 异常
-  26. 修复环境变量 position 数据类型异常
-  27. 修复 Docker 健康检查 QlPort 环境变量读取
-  28. 修复任务统计日志
-  29. 升级 multer 解决 CVE 漏洞
-  30. 升级 nodemailer
-  
\ No newline at end of file
+  Platform 1.0: Git-native tasks, managed runtimes, isolated environments and portable recovery.

```

## git diff --cached
```text

```

## git ls-files --others --exclude-standard
```text
.github/workflows/container-qualification.yml
.github/workflows/release.yml
Dockerfile
compose.yaml
diagnostics/phase16b/backend-build.log
diagnostics/phase16b/release-tests.log
docs/release/00-packaging-audit.md
scripts/release/build-info.cjs
scripts/release/build.cjs
scripts/release/compose-test.cjs
scripts/release/container-acceptance.cjs
scripts/release/entrypoint.cjs
scripts/release/gates.cjs
scripts/release/healthcheck.cjs
scripts/release/install-scanner.py
scripts/release/metadata.cjs
scripts/release/oci-audit.py
scripts/release/publish.cjs
scripts/release/release-assets.cjs
scripts/release/runtime-manifest.json
scripts/release/verify-github-release.cjs
scripts/release/verify-release.cjs
tests/phase16b/release.test.cjs

```

## docker ps -a
```text
CONTAINER ID   IMAGE     COMMAND   CREATED   STATUS    PORTS     NAMES

```

## docker images
```text
IMAGE                ID             DISK USAGE   CONTENT SIZE   EXTRA
hello-world:latest   5e2309035332       22.6kB         10.3kB        

```

## docker volume ls
```text
DRIVER    VOLUME NAME

```

## docker network ls
```text
NETWORK ID     NAME      DRIVER    SCOPE
9ad1e4ffccd5   bridge    bridge    local
3ff6d021248f   host      host      local
f85a2ab57bd7   none      null      local

```

## docker context show
```text
colima

```

## docker info
```text
Client: Docker Engine - Community
 Version:    29.8.1
 Context:    colima
 Debug Mode: false

Server:
 Containers: 0
  Running: 0
  Paused: 0
  Stopped: 0
 Images: 1
 Server Version: 29.5.2
 Storage Driver: overlayfs
  driver-type: io.containerd.snapshotter.v1
 Logging Driver: json-file
 Cgroup Driver: cgroupfs
 Cgroup Version: 2
 Plugins:
  Volume: local
  Network: bridge host ipvlan macvlan null overlay
  Log: awslogs fluentd gcplogs gelf journald json-file local splunk syslog
 CDI spec directories:
  /etc/cdi
  /var/run/cdi
 Swarm: inactive
 Runtimes: io.containerd.runc.v2 runc
 Default Runtime: runc
 Init Binary: docker-init
 containerd version: 193637f7ee8ae5f5aa5248f49e7baa3e6164966e
 runc version: v1.3.5-0-g488fc13e
 init version: de40ad0
 Security Options:
  apparmor
  seccomp
   Profile: builtin
  cgroupns
 Kernel Version: 6.8.0-117-generic
 Operating System: Ubuntu 24.04.4 LTS
 OSType: linux
 Architecture: aarch64
 CPUs: 2
 Total Memory: 1.913GiB
 Name: colima
 ID: 70ca5363-5c30-498e-9357-771e4c329638
 Docker Root Dir: /var/lib/docker
 Debug Mode: false
 HTTP Proxy: http://host.lima.internal:8118
 HTTPS Proxy: http://host.lima.internal:8118
 No Proxy: localhost,127.0.0.1,::1,host.lima.internal,host.docker.internal
 Experimental: false
 Insecure Registries:
  ::1/128
  127.0.0.0/8
 Live Restore Enabled: false
 Firewall Backend: iptables
  EnableUserlandProxy: true
  UserlandProxyPath: /usr/bin/docker-proxy


```

## docker compose version
```text
docker: unknown command: docker compose

Run 'docker --help' for more information

```

## docker buildx ls
```text
docker: unknown command: docker buildx

Run 'docker --help' for more information

```

## ls /opt/homebrew/lib/docker/cli-plugins
```text
docker-compose

```

## ls diagnostics/phase16b docs/release scripts/release docs/deploy
```text
diagnostics/phase16b:
backend-build.log
release-tests.log

docs/deploy:

docs/release:
00-packaging-audit.md

scripts/release:
build-info.cjs
build.cjs
compose-test.cjs
container-acceptance.cjs
entrypoint.cjs
gates.cjs
healthcheck.cjs
install-scanner.py
metadata.cjs
oci-audit.py
publish.cjs
release-assets.cjs
runtime-manifest.json
verify-github-release.cjs
verify-release.cjs

```