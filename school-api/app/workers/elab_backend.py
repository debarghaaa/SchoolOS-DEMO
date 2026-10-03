from __future__ import annotations

"""E-Lab execution backends: isolated containers (production) + dev-only local.

Security contract
-----------------
Student code is assumed malicious. The Docker backend runs every snippet in
a short-lived container with: no network, CPU/memory/PID limits, a wall
clock timeout, a read-only root filesystem with tmpfs scratch space, a
non-root user, all capabilities dropped, no-new-privileges, no volumes, no
devices, no Docker socket and no privileged flag. Source reaches the
container only via the Docker copy API (put_archive) — never via a host
mount. See ``container_config`` (pure function; unit-tested without a
daemon) and ``docs/elab/ARCHITECTURE.md``.

The local backend exists ONLY for single-process dev and test suites
without a Docker daemon. It requires both ``ELAB_BACKEND=local`` and
``ELAB_ALLOW_INSECURE_LOCAL=true`` and refuses every language but Python.
"""

import dataclasses
import io
import logging
import os
import signal
import subprocess
import sys
import tarfile
import tempfile
import threading
import time
from collections.abc import Callable

from app.core.config import settings

log = logging.getLogger("schoolos.elab")

# Absolute interpreter paths: no PATH lookup inside execution containers.
PYTHON_BIN = "/usr/local/bin/python"
NODE_BIN = "/usr/local/bin/node"
GCC_BIN = "/usr/local/bin/gcc"
WORKDIR = "/work"
EXEC_UID = "10000:10000"  # `elab` user created by the execution images.


@dataclasses.dataclass(frozen=True)
class LanguageSpec:
    """Everything needed to execute one language. New languages are added by
    adding an execution image plus one entry here — never by branching."""

    image_setting: str
    filename: str
    compile_cmd: list[str] | None
    run_cmd: list[str]

    @property
    def image(self) -> str:
        return str(getattr(settings, self.image_setting))


SPECS: dict[str, LanguageSpec] = {
    "python": LanguageSpec("ELAB_IMAGE_PYTHON", "main.py", None,
                           [PYTHON_BIN, "-I", "/work/main.py"]),
    "javascript": LanguageSpec("ELAB_IMAGE_JAVASCRIPT", "main.js", None,
                               [NODE_BIN, "/work/main.js"]),
    "c": LanguageSpec("ELAB_IMAGE_C", "main.c",
                      [GCC_BIN, "-O2", "-std=c17", "-o", "/work/program", "/work/main.c"],
                      ["/work/program"]),
    "cpp": LanguageSpec("ELAB_IMAGE_CPP", "main.cpp",
                        [GCC_BIN, "-O2", "-std=c++17", "-o", "/work/program", "/work/main.cpp"],
                        ["/work/program"]),
}


@dataclasses.dataclass
class RunResult:
    status: str  # completed | failed | timeout | cancelled
    stdout: str = ""
    stderr: str = ""
    exit_code: int | None = None
    runtime_ms: int = 0
    stage: str | None = None  # compile | run (set for compiled languages)
    container_id: str | None = None  # short id of the execution container


def container_config(image: str, *, run_id: str, timeout: int,
                     mem_mb: int, cpu_quota: int, pids: int) -> dict:
    """Keyword args for ``client.containers.create``. Pure — no daemon needed.

    Deliberately absent: volumes/binds, ports, devices, sysctls, privileged,
    and any Docker socket mount. The container idles on ``sleep`` while the
    worker copies sources in and execs the program.
    """
    return {
        "image": image,
        "command": ["sleep", str(timeout + 60)],
        "name": f"elab-{run_id.replace('-', '')[:12]}-{time.time_ns():x}",
        "detach": True,
        "stdin_open": False,
        "tty": False,
        "network_disabled": True,
        "mem_limit": f"{mem_mb}m",
        "memswap_limit": f"{mem_mb}m",
        "cpu_period": 100000,
        "cpu_quota": cpu_quota,
        "pids_limit": pids,
        "read_only": True,
        "tmpfs": {
            "/work": "rw,exec,size=64m,mode=1777",
            "/tmp": "rw,noexec,nosuid,size=16m,mode=1777",
        },
        "user": EXEC_UID,
        "cap_drop": ["ALL"],
        "security_opt": ["no-new-privileges"],
        "privileged": False,
        "labels": {"schoolos.elab": "1", "schoolos.run_id": run_id},
    }


def _tar_bytes(files: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as tar:
        for name, content in files.items():
            info = tarfile.TarInfo(name=name)
            info.size = len(content)
            info.mtime = 0
            info.uid = info.gid = 10000
            info.uname = info.gname = "elab"
            info.mode = 0o644
            tar.addfile(info, io.BytesIO(content))
    return buf.getvalue()


def _truncate(text: str, cap: int) -> str:
    if len(text) <= cap:
        return text
    return text[:cap] + "\n[output truncated]"


class DockerBackend:
    """Production backend: one locked-down container per execution."""

    name = "docker"

    def docker_client(self):
        try:
            import docker
        except ImportError:
            log.error("elab: docker SDK not installed")
            return None
        try:
            client = docker.from_env()
            client.ping()
            return client
        except Exception as e:
            log.error("elab: docker daemon unreachable: %s", e)
            return None

    def run(self, language: str, source: str, stdin: str, *,
            timeout: int, output_cap: int, run_id: str = "",
            cancel_check: Callable[[], bool] | None = None) -> RunResult:
        spec = SPECS.get(language)
        if spec is None:
            return RunResult(status="failed", stderr=f"unsupported language: {language}")
        client = self.docker_client()
        if client is None:
            # Fail closed: without a daemon nothing executes anywhere.
            return RunResult(status="failed",
                             stderr="[execution backend unavailable: no docker daemon]")
        run_tag = f"{time.time_ns():x}"
        container = None
        cid: str | None = None
        try:
            container = client.containers.create(**container_config(
                spec.image, run_id=run_id or run_tag, timeout=timeout,
                mem_mb=settings.ELAB_MEMORY_MB, cpu_quota=settings.ELAB_CPU_QUOTA,
                pids=settings.ELAB_PIDS_LIMIT))
            container.start()
            cid = container.id[:12]
            files = {spec.filename: source.encode("utf-8", "replace"),
                     "stdin": stdin.encode("utf-8", "replace")}
            container.put_archive(WORKDIR, _tar_bytes(files))
            if spec.compile_cmd is not None:
                started = time.monotonic()
                out, code = self._exec(client, container, spec.compile_cmd,
                                       timeout, output_cap, cancel_check, stdin_file=False)
                if code == "timeout":
                    return RunResult(status="timeout", stage="compile", runtime_ms=_ms(started),
                                     container_id=cid,
                                     stderr=_truncate(out[1] + "\n[compilation timed out]", output_cap))
                if code == "cancelled" or (cancel_check and cancel_check()):
                    return RunResult(status="cancelled", stage="compile", runtime_ms=_ms(started),
                                     container_id=cid)
                if code != 0:
                    return RunResult(status="failed", stage="compile", exit_code=code,
                                     container_id=cid,
                                     runtime_ms=_ms(started),
                                     stdout=_truncate(out[0], output_cap),
                                     stderr=_truncate(out[1], output_cap))
            started = time.monotonic()
            out, code = self._exec(client, container, spec.run_cmd,
                                   timeout, output_cap, cancel_check, stdin_file=True)
            runtime_ms = _ms(started)
            if code == "timeout":
                return RunResult(status="timeout", stage="run", runtime_ms=runtime_ms,
                                 container_id=cid,
                                 stdout=_truncate(out[0], output_cap),
                                 stderr=_truncate(out[1] + "\n[execution timed out]", output_cap))
            if code == "cancelled" or (cancel_check and cancel_check()):
                return RunResult(status="cancelled", stage="run", runtime_ms=runtime_ms,
                             container_id=cid)
            return RunResult(status="completed" if code == 0 else "failed",
                             stage="run" if spec.compile_cmd else None,
                             container_id=cid,
                             stdout=_truncate(out[0], output_cap),
                             stderr=_truncate(out[1], output_cap),
                             exit_code=code, runtime_ms=runtime_ms)
        except Exception as e:
            log.exception("elab: docker execution failed")
            return RunResult(status="failed", stderr=f"[runner error: {e}]")
        finally:
            if container is not None:
                try:
                    container.remove(force=True)
                except Exception:
                    pass

    def _exec(self, client, container, cmd: list[str], timeout: int, output_cap: int,
              cancel_check: Callable[[], bool] | None, *, stdin_file: bool):
        """Run one command; returns ((stdout, stderr), exit_code|'timeout'|'cancelled').

        stdin arrives as /work/stdin via shell redirection (constant argv —
        no user input is ever interpolated into a shell command). Output is
        streamed and drained with a hard cap so output bombs cannot exhaust
        worker memory; the deadline/cancel watchdog kills the container.
        """
        if stdin_file:
            argv = ["sh", "-c", "exec " + " ".join(cmd) + " < /work/stdin"]
        else:
            argv = cmd
        exec_id = client.api.exec_create(container.id, argv, stdout=True, stderr=True,
                                         stdin=False, tty=False, workdir=WORKDIR)["Id"]
        chunks: list[tuple[bytes | None, bytes | None]] = []
        outcome: dict = {}

        def _drain() -> None:
            try:
                for chunk in client.api.exec_start(exec_id, detach=False, tty=False,
                                                   stream=True, demux=True):
                    chunks.append(chunk)
            except Exception as e:
                outcome["drain_error"] = e
            try:
                outcome["exit"] = client.api.exec_inspect(exec_id).get("ExitCode")
            except Exception:
                outcome["exit"] = None

        worker = threading.Thread(target=_drain, daemon=True)
        worker.start()
        deadline = time.monotonic() + timeout
        verdict: int | str | None = None
        while worker.is_alive():
            if cancel_check is not None and cancel_check():
                verdict = "cancelled"
                break
            if time.monotonic() >= deadline:
                verdict = "timeout"
                break
            worker.join(timeout=0.2)
        if verdict is not None:
            try:
                container.kill()
            except Exception:
                pass
            worker.join(timeout=5)
        else:
            # Normal completion; a missing code degrades to failed, never hangs.
            verdict = outcome.get("exit")
        out_b, err_b = bytearray(), bytearray()
        for stdout_c, stderr_c in chunks:
            # Keep draining semantics: accumulate bounded, count the rest.
            if stdout_c and len(out_b) < output_cap + 1024:
                out_b += stdout_c[: max(0, output_cap + 1024 - len(out_b))]
            if stderr_c and len(err_b) < output_cap + 1024:
                err_b += stderr_c[: max(0, output_cap + 1024 - len(err_b))]
        out = (out_b.decode("utf-8", "replace"), err_b.decode("utf-8", "replace"))
        return out, verdict


def _ms(started: float) -> int:
    return int((time.monotonic() - started) * 1000)


class LocalBackend:
    """DEV/TEST ONLY: executes Python on the worker host with rlimits.

    Refuses to run unless explicitly enabled via ELAB_BACKEND=local plus
    ELAB_ALLOW_INSECURE_LOCAL=true. Never enable outside a disposable dev
    box or the test suite: this backend is NOT a security boundary.
    """

    name = "local"
    _warned = False

    def run(self, language: str, source: str, stdin: str, *,
            timeout: int, output_cap: int, run_id: str = "",
            cancel_check: Callable[[], bool] | None = None) -> RunResult:
        if language != "python":
            return RunResult(status="failed",
                             stderr="[local backend supports python only; "
                                    "other languages require the container backend]")
        if not (settings.ELAB_BACKEND == "local" and settings.ELAB_ALLOW_INSECURE_LOCAL):
            return RunResult(status="failed",
                             stderr="[refusing host execution: set ELAB_BACKEND=local and "
                                    "ELAB_ALLOW_INSECURE_LOCAL=true for dev/test only]")
        if not LocalBackend._warned:
            LocalBackend._warned = True
            log.warning("elab: INSECURE local backend executing on worker host (dev/test only)")
        stdin_bytes = stdin.encode("utf-8", "replace")[: settings.ELAB_MAX_STDIN_KB * 1024]
        env = {"PATH": "/usr/bin:/bin", "PYTHONDONTWRITEBYTECODE": "1",
               "PYTHONIOENCODING": "utf-8", "HOME": "/tmp"}
        with tempfile.TemporaryDirectory(prefix="elab-") as tmp:
            prog = os.path.join(tmp, "main.py")
            with open(prog, "w", encoding="utf-8") as f:
                f.write(source)
            env = dict(env, TMPDIR=tmp)
            proc = subprocess.Popen(
                [sys.executable, "-I", "-E", prog],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                cwd=tmp, env=env, start_new_session=True,
                preexec_fn=_posix_limits if os.name == "posix" else None,
            )
            start = time.monotonic()
            try:
                out, err = self._communicate(proc, stdin_bytes, timeout, cancel_check)
                exit_code: int | str | None = proc.returncode
            except _TimedOut:
                _kill_tree(proc)
                out, err = proc.communicate()
                exit_code = "timeout"
            except _Cancelled:
                _kill_tree(proc)
                out, err = proc.communicate()
                exit_code = "cancelled"
            runtime_ms = _ms(start)
        stdout, stderr = out.decode("utf-8", "replace"), err.decode("utf-8", "replace")
        if exit_code == "timeout":
            return RunResult(status="timeout", runtime_ms=runtime_ms,
                             stdout=_truncate(stdout, output_cap),
                             stderr=_truncate(stderr + "\n[execution timed out]", output_cap))
        if exit_code == "cancelled":
            return RunResult(status="cancelled", runtime_ms=runtime_ms)
        return RunResult(status="completed" if proc.returncode == 0 else "failed",
                         stdout=_truncate(stdout, output_cap),
                         stderr=_truncate(stderr, output_cap),
                         exit_code=proc.returncode, runtime_ms=runtime_ms)

    def _communicate(self, proc, stdin_bytes, timeout, cancel_check):
        if proc.stdin is not None:
            try:
                proc.stdin.write(stdin_bytes)
                proc.stdin.close()
            except BrokenPipeError:
                pass
        deadline = time.monotonic() + timeout
        while True:
            if cancel_check is not None and cancel_check():
                raise _Cancelled()
            try:
                return proc.communicate(timeout=0.2)
            except subprocess.TimeoutExpired:
                if time.monotonic() >= deadline:
                    raise _TimedOut()


class _TimedOut(Exception):
    pass


class _Cancelled(Exception):
    pass


def _kill_tree(proc) -> None:
    try:
        if os.name == "posix":
            os.killpg(proc.pid, signal.SIGKILL)
        else:
            proc.kill()
    except (ProcessLookupError, OSError):
        pass


def _posix_limits() -> None:
    try:
        import resource
    except ImportError:
        return
    mem = settings.ELAB_MEMORY_MB * 1024 * 1024
    try:
        resource.setrlimit(resource.RLIMIT_AS, (mem, mem))
        resource.setrlimit(resource.RLIMIT_CPU, (settings.ELAB_TIMEOUT_SECONDS + 5,) * 2)
        resource.setrlimit(resource.RLIMIT_FSIZE, (1 * 1024 * 1024,) * 2)
        resource.setrlimit(resource.RLIMIT_NOFILE, (32, 32))
    except (ValueError, OSError):
        pass


def get_backend():
    """Select by configuration. Unknown values fail closed to Docker."""
    if settings.ELAB_BACKEND == "local":
        return LocalBackend()
    return DockerBackend()
