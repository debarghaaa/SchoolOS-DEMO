# Execution image for untrusted JavaScript snippets. Same sandbox
# contract as python.Dockerfile: no net, readonly fs, uid 10000.
FROM node:22-alpine3.20

RUN adduser -u 10000 -D runner \
    && mkdir -p /work /stage \
    && chown 10000:10000 /work /stage

USER 10000:10000
WORKDIR /work

CMD ["sleep", "infinity"]
