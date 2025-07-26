"""Journal guideline utilities."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

from .domain import Checklist, TaskNode

ROOT = Path(__file__).resolve().parents[1]
GUIDELINES_FILE = ROOT / "journal_guidelines.json"


@dataclass
class Guideline:
    journal: str
    article_type: str
    title_limit: Optional[str] = None
    abstract_limit: Optional[str] = None
    word_limit: Optional[str] = None
    figure_limit: Optional[str] = None
    reference_limit: Optional[str] = None
    structure: Optional[str] = None
    other_requirements: Optional[str] = None
    last_accessed: Optional[str] = None


def load_guidelines(path: Path | None = None) -> List[Guideline]:
    """Return all guidelines from ``journal_guidelines.json``."""
    file = path or GUIDELINES_FILE
    data = json.loads(file.read_text())
    allowed = set(Guideline.__annotations__)
    cleaned = [{k: v for k, v in d.items() if k in allowed} for d in data]
    return [Guideline(**item) for item in cleaned]


def find_guideline(journal: str, article_type: str | None = None) -> Guideline:
    """Return the guideline entry matching ``journal`` and ``article_type``."""
    journal = journal.lower()
    art = article_type.lower() if article_type else None
    for g in load_guidelines():
        if g.journal.lower() == journal and (art is None or g.article_type.lower() == art):
            return g
    raise ValueError(f"Guideline not found for {journal} {article_type or ''}")


def generate_template(journal: str, article_type: str | None = None) -> Checklist:
    """Generate a :class:`Checklist` based on guideline limits."""
    g = find_guideline(journal, article_type)

    tasks: List[TaskNode] = []
    if g.title_limit:
        tasks.append(TaskNode(item=f"Title limit: {g.title_limit}"))
    if g.abstract_limit:
        tasks.append(TaskNode(item=f"Abstract limit: {g.abstract_limit}"))
    if g.word_limit:
        tasks.append(TaskNode(item=f"Word limit: {g.word_limit}"))
    if g.figure_limit:
        tasks.append(TaskNode(item=f"Figure limit: {g.figure_limit}"))
    if g.reference_limit:
        tasks.append(TaskNode(item=f"Reference limit: {g.reference_limit}"))
    if g.structure:
        tasks.append(TaskNode(item=f"Structure: {g.structure}"))
    if g.other_requirements:
        tasks.append(TaskNode(item=f"Other requirements: {g.other_requirements}"))

    return Checklist(tasks=tasks)


__all__ = ["Guideline", "load_guidelines", "find_guideline", "generate_template"]
