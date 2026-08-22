"""
Auth + extract helpers around garmin-health-data, with per-Sparky-user isolation.

Tokens live under ``{GHD_DATA_DIR}/{user_id}/.garminconnect/<garmin_uid>/``
(HOME redirected so GHD's ``~/.garminconnect`` resolves there). SQLite warehouse:
``{GHD_DATA_DIR}/{user_id}/garmin_data.db``.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import sys
import threading
import time
import uuid
from contextlib import contextmanager
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Iterator, Optional

from garmin_health_data.auth import check_authentication
from garmin_health_data.garmin_client import GarminClient
from garmin_health_data.garmin_client.exceptions import (
    GarminAuthenticationError,
    GarminConnectionError,
    GarminTooManyRequestsError,
)

logger = logging.getLogger(__name__)

DATA_ROOT = Path(os.getenv("GHD_DATA_DIR", "/data")).expanduser().resolve()
MFA_TTL_SECONDS = 5 * 60

_user_locks: dict[str, threading.Lock] = {}
_user_locks_guard = threading.Lock()
_home_lock = threading.Lock()

_MFA_STORE: dict[str, dict[str, Any]] = {}


def _safe_user_segment(user_id: str) -> str:
    cleaned = "".join(c for c in user_id if c.isalnum() or c in "-_")
    if not cleaned or cleaned != user_id:
        raise ValueError("Invalid user_id")
    return cleaned


def user_data_dir(user_id: str) -> Path:
    path = DATA_ROOT / _safe_user_segment(user_id)
    path.mkdir(parents=True, exist_ok=True)
    return path


def user_db_path(user_id: str) -> Path:
    return user_data_dir(user_id) / "garmin_data.db"


def user_token_base(user_id: str) -> Path:
    return user_data_dir(user_id) / ".garminconnect"


def get_user_lock(user_id: str) -> threading.Lock:
    key = _safe_user_segment(user_id)
    with _user_locks_guard:
        if key not in _user_locks:
            _user_locks[key] = threading.Lock()
        return _user_locks[key]


def _restore_env(key: str, value: Optional[str]) -> None:
    if value is None:
        os.environ.pop(key, None)
    else:
        os.environ[key] = value


@contextmanager
def redirect_home(user_dir: Path) -> Iterator[None]:
    """Point HOME at the per-user dir so ``~/.garminconnect`` resolves under it."""
    with _home_lock:
        old_home = os.environ.get("HOME")
        old_userprofile = os.environ.get("USERPROFILE")
        old_home_drive = os.environ.get("HOMEDRIVE")
        old_home_path = os.environ.get("HOMEPATH")
        target = str(user_dir.resolve())
        os.environ["HOME"] = target
        os.environ["USERPROFILE"] = target
        if os.name == "nt":
            resolved = Path(target)
            os.environ["HOMEDRIVE"] = resolved.drive or "C:"
            os.environ["HOMEPATH"] = str(resolved)[len(resolved.drive) :]
        try:
            yield
        finally:
            _restore_env("HOME", old_home)
            _restore_env("USERPROFILE", old_userprofile)
            _restore_env("HOMEDRIVE", old_home_drive)
            _restore_env("HOMEPATH", old_home_path)


def _cleanup_mfa_store() -> None:
    now = time.time()
    expired = [k for k, v in _MFA_STORE.items() if now - v["ts"] > MFA_TTL_SECONDS]
    for k in expired:
        _MFA_STORE.pop(k, None)


def _persist_tokens(client: GarminClient, user_id: str) -> str:
    profile = client.get_user_profile()
    garmin_uid = profile.get("id")
    if garmin_uid is None:
        raise RuntimeError("Garmin profile missing id after login")
    garmin_uid_str = str(garmin_uid)
    token_dir = user_token_base(user_id) / garmin_uid_str
    token_dir.mkdir(parents=True, exist_ok=True)
    if sys.platform != "win32":
        try:
            token_dir.chmod(0o700)
        except OSError:
            pass
    client.dump(str(token_dir))
    logger.info("Saved GHD tokens for user_id=%s", user_id)
    return garmin_uid_str


def login(user_id: str, email: str, password: str) -> dict[str, Any]:
    _safe_user_segment(user_id)
    user_dir = user_data_dir(user_id)
    _cleanup_mfa_store()

    with get_user_lock(user_id):
        client = GarminClient()
        try:
            result = client.login(email, password, return_on_mfa=True)
        except GarminAuthenticationError as e:
            logger.warning("GHD auth failed for user %s: %s", user_id, e)
            return {"ok": False, "error": "authentication_failed", "detail": str(e)}
        except GarminTooManyRequestsError as e:
            return {"ok": False, "error": "rate_limited", "detail": str(e)}
        except GarminConnectionError as e:
            return {"ok": False, "error": "connection_error", "detail": str(e)}

        if isinstance(result, tuple) and len(result) == 2 and result[0] == "needs_mfa":
            mfa_id = uuid.uuid4().hex
            _MFA_STORE[mfa_id] = {
                "client": client,
                "client_state": result[1],
                "user_id": user_id,
                "ts": time.time(),
            }
            logger.info("GHD MFA required for user %s mfa_id=%s", user_id, mfa_id)
            return {
                "ok": False,
                "needs_mfa": True,
                "mfa_id": mfa_id,
                "status": "needs_mfa",
            }

        with redirect_home(user_dir):
            garmin_uid = _persist_tokens(client, user_id)
        return {"ok": True, "garmin_user_id": garmin_uid}


def resume_login(user_id: str, mfa_id: str, mfa_code: str) -> dict[str, Any]:
    _safe_user_segment(user_id)
    _cleanup_mfa_store()
    item = _MFA_STORE.pop(mfa_id, None)
    if not item or item["user_id"] != user_id:
        return {"ok": False, "error": "invalid_or_expired_mfa"}

    client: GarminClient = item["client"]
    user_dir = user_data_dir(user_id)
    with get_user_lock(user_id):
        try:
            client.resume_login(item.get("client_state"), mfa_code)
        except GarminAuthenticationError as e:
            return {"ok": False, "error": "mfa_failed", "detail": str(e)}
        except Exception as e:
            logger.exception("GHD MFA resume failed")
            return {"ok": False, "error": "mfa_failed", "detail": str(e)}

        with redirect_home(user_dir):
            garmin_uid = _persist_tokens(client, user_id)
        return {"ok": True, "garmin_user_id": garmin_uid}


def auth_status(user_id: str) -> dict[str, Any]:
    _safe_user_segment(user_id)
    user_dir = user_data_dir(user_id)
    with redirect_home(user_dir):
        linked = check_authentication(str(user_token_base(user_id)))
    return {"linked": bool(linked)}


def unlink(user_id: str) -> dict[str, Any]:
    """Clear OAuth tokens for this Sparky user. Keeps SQLite warehouse on disk."""
    _safe_user_segment(user_id)
    token_base = user_token_base(user_id)
    if token_base.exists():
        shutil.rmtree(token_base, ignore_errors=True)
    logger.info("GHD unlink cleared tokens for user=%s", user_id)
    return {"ok": True}


def _inclusive_end_to_ghd_exclusive(start: date, end: date) -> date:
    """GHD end-date is exclusive unless start==end (single-day inclusive)."""
    if start == end:
        return end
    return end + timedelta(days=1)


def _build_extract_cmd(
    db_path: Path,
    start: date,
    end_for_cli: date,
    data_types: Optional[list[str]],
) -> list[str]:
    garmin_bin = shutil.which("garmin")
    base_args = [
        "extract",
        "--db-path",
        str(db_path),
        "--start-date",
        start.isoformat(),
        "--end-date",
        end_for_cli.isoformat(),
    ]
    if data_types:
        for dt in data_types:
            base_args.extend(["--data-types", dt])

    if garmin_bin:
        return [garmin_bin, *base_args]

    return [
        sys.executable,
        "-c",
        "from garmin_health_data.cli import cli; "
        f"cli({base_args!r}, standalone_mode=True)",
    ]


def extract(
    user_id: str,
    start_date: str,
    end_date: str,
    data_types: Optional[list[str]] = None,
) -> dict[str, Any]:
    """Run ``garmin extract`` into the per-user DB with HOME redirected."""
    _safe_user_segment(user_id)
    try:
        start = date.fromisoformat(start_date)
        end = date.fromisoformat(end_date)
    except ValueError as e:
        return {"ok": False, "error": f"Invalid date: {e}"}

    if end < start:
        return {"ok": False, "error": "end_date must be >= start_date"}

    user_dir = user_data_dir(user_id)
    db_path = user_db_path(user_id)
    end_for_cli = _inclusive_end_to_ghd_exclusive(start, end)

    status = auth_status(user_id)
    if not status["linked"]:
        return {"ok": False, "error": "not_linked"}

    cmd = _build_extract_cmd(db_path, start, end_for_cli, data_types)
    env = os.environ.copy()
    env["HOME"] = str(user_dir.resolve())
    env["USERPROFILE"] = str(user_dir.resolve())
    # GHD CLI prints emoji; force UTF-8 so Windows cp1252 consoles do not crash.
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"
    if os.name == "nt":
        resolved = user_dir.resolve()
        env["HOMEDRIVE"] = resolved.drive or "C:"
        env["HOMEPATH"] = str(resolved)[len(resolved.drive) :]

    lock = get_user_lock(user_id)
    if not lock.acquire(blocking=False):
        return {"ok": False, "error": "extract_in_progress"}

    try:
        logger.info(
            "GHD extract user=%s start=%s end_inclusive=%s end_cli=%s",
            user_id,
            start.isoformat(),
            end.isoformat(),
            end_for_cli.isoformat(),
        )
        completed = subprocess.run(
            cmd,
            env=env,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
            cwd=str(user_dir),
        )
        if completed.returncode != 0:
            err_tail = (completed.stderr or completed.stdout or "")[-2000:]
            logger.error(
                "GHD extract failed user=%s code=%s: %s",
                user_id,
                completed.returncode,
                err_tail,
            )
            return {
                "ok": False,
                "error": "extract_failed",
                "detail": err_tail,
            }

        files_extracted = None
        for line in (completed.stdout or "").splitlines():
            if "Extracted" in line and "file" in line.lower():
                files_extracted = line.strip()
                break

        return {
            "ok": True,
            "files_extracted": files_extracted,
            "db_path": str(db_path),
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
        }
    except Exception as e:
        logger.exception("GHD extract exception")
        return {"ok": False, "error": str(e)}
    finally:
        lock.release()


def ensure_data_root() -> None:
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    logger.info("GHD data root: %s", DATA_ROOT)
