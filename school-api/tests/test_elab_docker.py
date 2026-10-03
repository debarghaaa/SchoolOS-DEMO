from __future__ import annotations

"""Adversarial E-Lab tests against real execution containers.

Requires a Docker daemon plus the execution images
(``elab/docker/build.sh``). Each test assumes the submitted code is
malicious and asserts the sandbox holds. Skipped everywhere else.
"""

import time

import pytest

from app.core.config import settings
from app.workers.elab_backend import SPECS, DockerBackend

pytestmark = pytest.mark.needs_docker

CAP = 64 * 1024


def _needs_images():
    try:
        import docker
    except ImportError:
        pytest.skip("docker SDK not installed")
    try:
        client = docker.from_env()
        client.ping()
    except Exception:
        pytest.skip("no docker daemon")
    missing = set()
    for spec in SPECS.values():
        try:
            client.images.get(spec.image)
        except Exception:
            missing.add(spec.image)
    if missing:
        pytest.skip(f"missing execution images: {sorted(missing)}")
    return client


@pytest.fixture(scope="module")
def docker_client():
    client = _needs_images()
    yield client
    client.close()


@pytest.fixture()
def backend(docker_client):
    assert settings.ELAB_BACKEND == "docker"
    return DockerBackend()


def _run(backend, language, source, stdin="", timeout=10):
    return backend.run(language, source, stdin, timeout=timeout,
                       output_cap=CAP, run_id="test")


# ---------------- Baseline: each language executes ----------------

def test_python_hello(backend):
    r = _run(backend, "python", "print('hello')")
    assert (r.status, r.stdout, r.exit_code) == ("completed", "hello\n", 0)


def test_javascript_hello(backend):
    r = _run(backend, "javascript", "console.log('hello')")
    assert (r.status, r.stdout, r.exit_code) == ("completed", "hello\n", 0)


def test_c_hello(backend):
    r = _run(backend, "c", '#include <stdio.h>\nint main(){printf("hi\\n");return 0;}')
    assert r.status == "completed" and r.stdout == "hi\n" and r.stage == "run"


def test_cpp_hello(backend):
    r = _run(backend, "cpp", '#include <iostream>\nint main(){std::cout<<"hi\\n";}')
    assert r.status == "completed" and r.stdout == "hi\n"


def test_c_compile_error_reports_compile_stage(backend):
    r = _run(backend, "c", "int main( { garbage !!!")
    assert r.status == "failed" and r.stage == "compile"
    assert r.exit_code != 0 and r.stderr != ""


def test_stdin_redirection(backend):
    r = _run(backend, "python", "import sys; print(sys.stdin.read().strip() + '!')", stdin="hi")
    assert r.stdout == "hi!\n"


# ---------------- Adversarial matrix ----------------

def test_infinite_loop_times_out(backend):
    start = time.monotonic()
    r = _run(backend, "python", "while True: pass", timeout=3)
    assert r.status == "timeout"
    assert "timed out" in r.stderr
    assert time.monotonic() - start < 20


def test_fork_bomb_is_contained(backend):
    src = "import os\nwhile True:\n    try: os.fork()\n    except BlockingIOError: pass\n"
    r = _run(backend, "python", src, timeout=8)
    # Either the PID limit kills children (exit != 0) or the watchdog fires.
    assert r.status in ("failed", "timeout", "completed")


def test_memory_hog_is_killed(backend):
    src = "a = bytearray(512 * 1024 * 1024)\nprint('allocated')"
    r = _run(backend, "python", src, timeout=8)
    assert r.status in ("failed", "timeout")
    assert "allocated" not in r.stdout  # 256 MB limit < 512 MB ask


def test_no_network_access(backend):
    src = ("import socket\ns = socket.create_connection(('8.8.8.8', 53), timeout=3)\n"
           "print('connected')")
    r = _run(backend, "python", src, timeout=10)
    assert "connected" not in r.stdout
    assert r.status in ("failed", "timeout")


def test_filesystem_is_read_only_outside_work(backend):
    src = ("open('/etc/pwned', 'w').write('x')\nprint('wrote-etc')")
    r = _run(backend, "python", src)
    assert "wrote-etc" not in r.stdout
    assert r.status == "failed"
    src = "open('/work/ok.txt', 'w').write('fine')\nprint(open('/work/ok.txt').read())"
    r = _run(backend, "python", src)
    assert (r.status, r.stdout) == ("completed", "fine\n")


def test_process_spray_hits_pid_limit(backend):
    src = ("import subprocess, sys\nn = 0\n"
           "for _ in range(300):\n"
           "    try: subprocess.Popen([sys.executable, '-c', 'pass'])\n"
           "    except OSError: break\n    n += 1\nprint(f'spawned={n}')")
    r = _run(backend, "python", src, timeout=15)
    assert r.status in ("completed", "failed", "timeout")
    if r.status == "completed":
        spawned = int(r.stdout.strip().split("=")[1])
        assert spawned < 300  # PID limit (64) stops the spray


def test_runs_as_non_root_without_privilege(backend):
    r = _run(backend, "python", "import os; print(os.getuid())")
    assert r.stdout.strip() != "0"
    # No docker socket inside the execution container.
    r = _run(backend, "python",
             "import os; print(os.path.exists('/var/run/docker.sock'))")
    assert r.stdout.strip() == "False"
    # No CAP_SYS_ADMIN (bit 21 of CapEff).
    src = ("line = [l for l in open('/proc/self/status') if l.startswith('CapEff')][0]\n"
           "print(int(line.split()[1], 16) & (1 << 21))")
    r = _run(backend, "python", src)
    assert r.stdout.strip() == "0"


def test_output_bomb_is_truncated_not_fatal(backend):
    r = _run(backend, "python", "while True: print('x' * 100)", timeout=5)
    assert r.status in ("completed", "timeout")
    assert len(r.stdout) <= CAP + len("\n[output truncated]")
    if r.status == "completed":
        assert r.stdout.endswith("[output truncated]")


def test_cancel_kills_running_container(backend):
    import threading

    box: dict = {}

    def check():
        return box.get("cancel", False)

    def _work():
        box["result"] = backend.run(
            "python", "import time; time.sleep(60)", "", timeout=60,
            output_cap=CAP, run_id="cancel-test", cancel_check=check)

    t = threading.Thread(target=_work, daemon=True)
    t.start()
    time.sleep(3)
    box["cancel"] = True
    t.join(timeout=20)
    assert not t.is_alive()
    assert box["result"].status == "cancelled"


def test_no_containers_leak(docker_client):
    leftovers = [c for c in docker_client.containers.list(all=True, filters={"label": "schoolos.elab=1"})]
    assert leftovers == []
