# Execution image for untrusted Python snippets. Runs with no network,
# a read-only root filesystem, dropped capabilities and uid 10000 —
# see app/workers/elab_backend.py container_config().
FROM python:3.12-slim-bookworm

RUN useradd -u 10000 -m runner \
    && mkdir -p /work /stage \
    && chown 10000:10000 /work /stage

USER 10000:10000
WORKDIR /work

# The worker starts the container then execs the snippet into it.
CMD ["sleep", "infinity"]
