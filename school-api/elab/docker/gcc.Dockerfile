# Execution image for untrusted C and C++ snippets (compile + run
# phases). Same sandbox contract: no net, readonly fs, uid 10000.
FROM alpine:3.20

RUN apk add --no-cache gcc g++ musl-dev \
    && adduser -u 10000 -D runner \
    && mkdir -p /work /stage \
    && chown 10000:10000 /work /stage

USER 10000:10000
WORKDIR /work

CMD ["sleep", "infinity"]
