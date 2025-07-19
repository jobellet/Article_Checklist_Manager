from dataclasses import dataclass, field
from typing import List, Optional

@dataclass
class TaskNode:
    """Represents a checklist item with an optional percentage and subtasks."""

    name: str
    percent: Optional[float] = None  # 0-100
    children: List['TaskNode'] = field(default_factory=list)

    def computed_percent(self) -> float:
        """Return this node's progress percent, averaging children if needed."""
        if self.percent is not None:
            return float(self.percent)
        if not self.children:
            return 0.0
        return sum(child.computed_percent() for child in self.children) / len(self.children)


def progress_bar(percent: float, width: int = 20, filled: str = "█", empty: str = "░") -> str:
    """Return a textual progress bar for the given percent."""
    percent = max(0.0, min(100.0, percent))
    filled_len = int(round(width * percent / 100))
    return filled * filled_len + empty * (width - filled_len)


def render_tree(node: TaskNode, indent: int = 0, bar_width: int = 20) -> str:
    """Render the task tree with progress bars using indentation."""
    pct = node.computed_percent()
    bar = progress_bar(pct, bar_width)
    lines = [f"{'  '*indent}{node.name}: [{bar}] {pct:6.2f}%"]
    for child in node.children:
        lines.append(render_tree(child, indent + 1, bar_width))
    return "\n".join(lines)

__all__ = ["TaskNode", "progress_bar", "render_tree"]
