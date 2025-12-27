"""Persistence helpers for saving and loading checklists from disk."""

from __future__ import annotations

from pathlib import Path

from .domain import Checklist


def save(project: Checklist, path: Path) -> None:
    """Save ``project`` to ``path`` in YAML format."""
    with path.open("w", encoding="utf-8") as f:
        f.write(project.to_yaml())


def load(path: Path) -> Checklist:
    """Return a :class:`Checklist` loaded from ``path``."""
    with path.open("r", encoding="utf-8") as f:
        return Checklist.from_yaml(f.read())

__all__ = ["save", "load"]
