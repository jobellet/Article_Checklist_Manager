from __future__ import annotations

from typing import Any, Dict, List


class SchemaError(ValueError):
    """Raised when a task does not conform to the expected schema."""


def validate_task(task: Any) -> None:
    """Recursively validate a task dict.

    Expected keys:
    - item: required string
    - done: optional bool
    - percent: optional int between 0 and 100
    - subtasks: optional list of tasks
    """
    if not isinstance(task, dict):
        raise SchemaError("task must be a dict")

    if "item" not in task or not isinstance(task["item"], str):
        raise SchemaError("task must have an 'item' string")

    if "done" in task and not isinstance(task["done"], bool):
        raise SchemaError("'done' must be a boolean if present")

    if "percent" in task:
        percent = task["percent"]
        if not isinstance(percent, (int, float)):
            raise SchemaError("'percent' must be a number")
        if not 0 <= percent <= 100:
            raise SchemaError("'percent' must be between 0 and 100")

    if "subtasks" in task:
        if not isinstance(task["subtasks"], list):
            raise SchemaError("'subtasks' must be a list")
        for sub in task["subtasks"]:
            validate_task(sub)


def validate_schema(data: Dict[str, Any]) -> None:
    """Validate the root schema which is a mapping of section name to task."""
    if not isinstance(data, dict):
        raise SchemaError("root must be a mapping")
    for key, val in data.items():
        if not isinstance(key, str):
            raise SchemaError("section names must be strings")
        validate_task(val)
