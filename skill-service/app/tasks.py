"""In-memory task registry backed by ``storage/tasks.json``.

The MVP keeps a single process-wide dictionary of conversion tasks and
flushes it to disk after every mutation so the state survives a restart.
"""

from __future__ import annotations

import json
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import config

_LOCK = threading.RLock()
_TASKS: dict[str, dict[str, Any]] = {}

TASK_PENDING = "pending"
TASK_RUNNING = "running"
TASK_SUCCEEDED = "succeeded"
TASK_FAILED = "failed"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _flush() -> None:
    payload = {"version": 1, "tasks": _TASKS}
    tmp = config.TASKS_FILE.with_suffix(".json.tmp")
    tmp.parent.mkdir(parents=True, exist_ok=True)
    tmp.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    tmp.replace(config.TASKS_FILE)


def load_tasks() -> None:
    """Load persisted tasks from disk (tolerating a missing/corrupt file)."""
    with _LOCK:
        _TASKS.clear()
        path: Path = config.TASKS_FILE
        if not path.exists():
            return
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return
        tasks = raw.get("tasks")
        if isinstance(tasks, dict):
            for task_id, task in tasks.items():
                if isinstance(task, dict):
                    _TASKS[task_id] = task


def create_task(kind: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    task_id = uuid.uuid4().hex
    task = {
        "taskId": task_id,
        "kind": kind,
        "status": TASK_PENDING,
        "progress": 0.0,
        "message": "queued",
        "createdAt": _now(),
        "updatedAt": _now(),
        "result": None,
        "error": None,
    }
    if payload:
        task.update(payload)
    with _LOCK:
        _TASKS[task_id] = task
        _flush()
    return dict(task)


def update_task(task_id: str, **fields: Any) -> dict[str, Any] | None:
    with _LOCK:
        task = _TASKS.get(task_id)
        if task is None:
            return None
        task.update(fields)
        task["updatedAt"] = _now()
        _flush()
        return dict(task)


def get_task(task_id: str) -> dict[str, Any] | None:
    with _LOCK:
        task = _TASKS.get(task_id)
        return dict(task) if task else None


def list_tasks() -> list[dict[str, Any]]:
    with _LOCK:
        return [dict(task) for task in _TASKS.values()]
