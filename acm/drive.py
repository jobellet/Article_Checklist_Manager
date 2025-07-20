"""Persistence helpers for saving and loading checklists from disk."""

from __future__ import annotations

from pathlib import Path

from .domain import Checklist


def save(project: Checklist, path: Path) -> None:
    """Save ``project`` to ``path`` in YAML format."""
    raise NotImplementedError


def load(path: Path) -> Checklist:
    """Return a :class:`Checklist` loaded from ``path``."""
    raise NotImplementedError

__all__ = ["save", "load"]
