from __future__ import annotations

from typing import Any, Dict


def compute_progress(task: Dict[str, Any]) -> float:
    """Return progress percentage for a task tree."""
    if "percent" in task and isinstance(task["percent"], (int, float)):
        return float(task["percent"])

    if "done" in task:
        return 100.0 if task.get("done") else 0.0

    subtasks = task.get("subtasks") or []
    if not subtasks:
        return 0.0

    total = sum(compute_progress(t) for t in subtasks)
    return total / len(subtasks)
