"""mysqldump-based backup/restore, used exclusively around database import (spec
section 26). The dump always runs BEFORE any data is touched; if it fails, the import
must never begin."""

import os
import subprocess
from datetime import datetime
from pathlib import Path

from app.config import get_settings
from app.utils.errors import AppError


class BackupError(AppError):
    status_code = 500
    code = "BACKUP_FAILED"


def _backup_dir() -> Path:
    settings = get_settings()
    path = Path(settings.db_backup_dir)
    path.mkdir(parents=True, exist_ok=True)
    return path


def create_backup() -> Path:
    settings = get_settings()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = _backup_dir() / f"backup_{timestamp}.sql"

    env = dict(os.environ, MYSQL_PWD=settings.mysql_password)
    command = [
        settings.mysqldump_path,
        "-h",
        settings.mysql_host,
        "-P",
        str(settings.mysql_port),
        "-u",
        settings.mysql_user,
        "--single-transaction",
        "--routines",
        settings.mysql_database,
    ]

    try:
        with open(backup_path, "wb") as backup_file:
            result = subprocess.run(
                command, stdout=backup_file, stderr=subprocess.PIPE, env=env, timeout=120
            )
    except (OSError, subprocess.SubprocessError) as exc:
        backup_path.unlink(missing_ok=True)
        raise BackupError(f"Não foi possível executar o backup do banco: {exc}") from exc

    if result.returncode != 0 or backup_path.stat().st_size == 0:
        backup_path.unlink(missing_ok=True)
        stderr = result.stderr.decode("utf-8", "replace")
        raise BackupError(f"Falha ao gerar backup do banco antes da importação: {stderr}")

    return backup_path


def get_latest_backup() -> Path | None:
    backups = sorted(_backup_dir().glob("backup_*.sql"), key=lambda p: p.stat().st_mtime)
    return backups[-1] if backups else None


def restore_backup(backup_path: Path) -> None:
    settings = get_settings()
    env = dict(os.environ, MYSQL_PWD=settings.mysql_password)
    command = [
        settings.mysql_restore_path,
        "-h",
        settings.mysql_host,
        "-P",
        str(settings.mysql_port),
        "-u",
        settings.mysql_user,
        settings.mysql_database,
    ]

    try:
        with open(backup_path, "rb") as backup_file:
            result = subprocess.run(
                command, stdin=backup_file, stderr=subprocess.PIPE, env=env, timeout=120
            )
    except (OSError, subprocess.SubprocessError) as exc:
        raise BackupError(f"Não foi possível restaurar o backup: {exc}") from exc

    if result.returncode != 0:
        stderr = result.stderr.decode("utf-8", "replace")
        raise BackupError(f"Falha ao restaurar o backup: {stderr}")
