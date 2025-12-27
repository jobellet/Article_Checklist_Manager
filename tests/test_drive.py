from pathlib import Path

from acm.domain import Checklist, TaskNode
from acm import drive
import pytest


def test_save_and_load_roundtrip(tmp_path: Path) -> None:
    project = Checklist()
    project.add_task(TaskNode(item="Task"))
    file = tmp_path / "checklist.yaml"
    drive.save(project, file)
    restored = drive.load(file)
    assert restored.to_dict() == project.to_dict()
