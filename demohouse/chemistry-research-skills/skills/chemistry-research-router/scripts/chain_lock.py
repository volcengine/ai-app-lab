"""Non-blocking file lock for bounded-chain resume operations."""

from __future__ import annotations

import fcntl
import os
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator


class ChainLockError(ValueError):
    """Raised when a chain lock is unsafe or unavailable."""


class ChainBusyError(ChainLockError):
    """Raised when another process owns the chain lock."""


@contextmanager
def acquire_run_lock(run_dir: Path) -> Iterator[None]:
    if not run_dir.is_dir() or run_dir.is_symlink():
        raise ChainLockError("chain run directory is missing or unsafe")
    lock_path = run_dir / "run.lock"
    flags = os.O_APPEND | os.O_CREAT | os.O_RDWR | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(lock_path, flags, 0o600)
    except OSError as error:
        raise ChainLockError(f"chain lock is unsafe: {error}") from error
    handle = os.fdopen(descriptor, "a+", encoding="utf-8")
    try:
        if os.fstat(handle.fileno()).st_nlink != 1:
            raise ChainLockError("chain lock hardlink is forbidden")
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise ChainBusyError("chain run directory is busy") from error
        yield
    finally:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        finally:
            handle.close()
