FROM node:24.11.0-bookworm-slim@sha256:76d0ed0ed93bed4f4376211e9d8fddac4d8b3fbdb54cc45955696001a3c91152 AS base
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git procps libevent-core-2.1-7 libncursesw6 \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack install --global pnpm@11.24.0
WORKDIR /workspace

FROM base AS tmux-build
RUN apt-get update && apt-get install -y --no-install-recommends build-essential pkg-config bison curl libevent-dev libncurses-dev \
    && rm -rf /var/lib/apt/lists/*
COPY .orchestrator/scripts/build-tmux.sh .orchestrator/scripts/tmux-checksums.sha256 .orchestrator/scripts/
ARG TMUX_VERSION=3.4
RUN sh .orchestrator/scripts/build-tmux.sh "$TMUX_VERSION"

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/board/package.json packages/board/
COPY packages/cli/package.json packages/cli/
COPY packages/migrations/package.json packages/migrations/
COPY packages/tmux/package.json packages/tmux/
COPY packages/ui-lib/package.json packages/ui-lib/
COPY packages/webapp/package.json packages/webapp/
RUN pnpm install --frozen-lockfile

FROM dependencies AS verify
COPY --from=tmux-build /usr/local/bin/tmux /usr/local/bin/tmux
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.base.json eslint.config.mjs README.md LICENSE ./
COPY packages/ packages/
COPY docs/ docs/
COPY skills/ skills/
COPY .orchestrator/scripts/ .orchestrator/scripts/
ENV TMPDIR=/workspace/.orchestrator/tmp
RUN mkdir -p "$TMPDIR"
CMD ["sh", ".orchestrator/scripts/check-container.sh"]
