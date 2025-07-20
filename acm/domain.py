from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional, Any
import json
import yaml


@dataclass
class TaskNode:
    """Represents a checklist item which can contain nested subtasks."""

    item: str
    done: bool = False
    percent: Optional[int] = None
    subtasks: List['TaskNode'] = field(default_factory=list)

    def add_subtask(self, subtask: 'TaskNode') -> None:
        self.subtasks.append(subtask)

    def remove_subtask(self, index: int) -> None:
        del self.subtasks[index]

    def get_subtask(self, index: int) -> 'TaskNode':
        return self.subtasks[index]

    def to_dict(self) -> dict:
        data: dict[str, Any] = {'item': self.item}
        if self.done:
            data['done'] = self.done
        if self.percent is not None:
            data['percent'] = self.percent
        if self.subtasks:
            data['subtasks'] = [s.to_dict() for s in self.subtasks]
        return data

    @classmethod
    def from_dict(cls, data: dict) -> 'TaskNode':
        node = cls(
            item=data.get('item', ''),
            done=data.get('done', False),
            percent=data.get('percent'),
        )
        for sub in data.get('subtasks', []):
            node.add_subtask(cls.from_dict(sub))
        return node


@dataclass
class Checklist:
    """Container for the top-level tasks of a project."""

    tasks: List[TaskNode] = field(default_factory=list)

    def add_task(self, task: TaskNode) -> None:
        self.tasks.append(task)

    def remove_task(self, index: int) -> None:
        del self.tasks[index]

    def get_task(self, index: int) -> TaskNode:
        return self.tasks[index]

    def to_dict(self) -> dict:
        return {'tasks': [t.to_dict() for t in self.tasks]}

    @classmethod
    def from_dict(cls, data: dict) -> 'Checklist':
        cl = cls()
        for t in data.get('tasks', []):
            cl.add_task(TaskNode.from_dict(t))
        return cl

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2)

    @classmethod
    def from_json(cls, text: str) -> 'Checklist':
        return cls.from_dict(json.loads(text))

    def to_yaml(self) -> str:
        return yaml.dump(self.to_dict(), sort_keys=False)

    @classmethod
    def from_yaml(cls, text: str) -> 'Checklist':
        return cls.from_dict(yaml.safe_load(text))


@dataclass
class ArticleProject:
    """Represents an article project with an associated checklist."""

    name: str
    checklist: Checklist = field(default_factory=Checklist)

    def add_task(self, task: TaskNode) -> None:
        self.checklist.add_task(task)

    def remove_task(self, index: int) -> None:
        self.checklist.remove_task(index)

    def to_dict(self) -> dict:
        return {'name': self.name, 'checklist': self.checklist.to_dict()}

    @classmethod
    def from_dict(cls, data: dict) -> 'ArticleProject':
        return cls(
            name=data.get('name', ''),
            checklist=Checklist.from_dict(data.get('checklist', {})),
        )

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2)

    @classmethod
    def from_json(cls, text: str) -> 'ArticleProject':
        return cls.from_dict(json.loads(text))

    def to_yaml(self) -> str:
        return yaml.dump(self.to_dict(), sort_keys=False)

    @classmethod
    def from_yaml(cls, text: str) -> 'ArticleProject':
        return cls.from_dict(yaml.safe_load(text))
