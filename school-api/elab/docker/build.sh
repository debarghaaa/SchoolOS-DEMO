#!/usr/bin/env bash
# Build the E-Lab execution images. Run once per host before enabling
# ELAB_BACKEND=docker, and again after editing a Dockerfile.
set -euo pipefail
cd "$(dirname "$0")"

docker build -t schoolos/elab-python:1.0 -f python.Dockerfile .
docker build -t schoolos/elab-node:1.0 -f node.Dockerfile .
docker build -t schoolos/elab-gcc:1.0 -f gcc.Dockerfile .

echo "execution images ready:"
docker images --format '{{.Repository}}:{{.Tag}}' | grep schoolos/elab-
