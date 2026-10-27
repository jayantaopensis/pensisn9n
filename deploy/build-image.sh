#!/usr/bin/env sh
# Builds the openSIS n8n Docker image from this checkout.
# Step 1 runs the production build in a temporary Node container, so the host
# needs only Docker. Step 2 uses the upstream n8n Dockerfile unchanged.
set -eu

cd "$(dirname "$0")/.."
IMAGE="${N8N_IMAGE:-opensis-n8n:latest}"

echo "==> Building ./compiled (15-40 minutes, needs about 8 GB of RAM or swap)"
docker run --rm \
	-v "$PWD":/app -w /app \
	-e CI=true \
	-e NODE_OPTIONS=--max-old-space-size=6144 \
	-e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
	node:24-bookworm \
	sh -c 'corepack enable \
		&& corepack prepare pnpm@12.4.2 --activate \
		&& pnpm install --frozen-lockfile \
		&& pnpm build:deploy \
		; status=$?; chown -R "$HOST_UID:$HOST_GID" /app; exit $status'

echo "==> Building image $IMAGE"
docker build \
	-f docker/images/n8n/Dockerfile \
	--build-arg N8N_VERSION="$(git rev-parse --short HEAD)" \
	-t "$IMAGE" \
	.

echo "==> Done. Start it with: cd deploy && docker compose up -d"
