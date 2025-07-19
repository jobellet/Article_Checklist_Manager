"""Progress calculation utilities for Article Checklist Manager.

This module exposes functions for computing completion percentages
across a tree of tasks.

Each task node is a dictionary with optional keys:
    - ``item``: descriptive label
    - ``done``: boolean flag for completion
    - ``percent``: explicit completion percentage (0-100)
    - ``tasks`` or ``subtasks``: list of child task nodes

The :func:`rollup_percentages` function returns a new tree with the
``percent`` field filled in for every node, leaving the original
structure untouched.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Dict, List, Any


TaskNode = Dict[str, Any]


def _get_children(node: TaskNode) -> List[TaskNode]:
    """Return a list of child nodes for *node*.

    The function looks for ``tasks`` or ``subtasks`` keys. If both are
    present, their lists are concatenated in that order.
    """
    children = []
    if "tasks" in node and isinstance(node["tasks"], list):
        children.extend(node["tasks"])
    if "subtasks" in node and isinstance(node["subtasks"], list):
        children.extend(node["subtasks"])
    return children


def _compute_leaf_percent(node: TaskNode) -> float:
    """Compute the completion percentage for a leaf node."""
    if "percent" in node:
        try:
            return float(node["percent"])
        except (TypeError, ValueError):
            pass
    if node.get("done") is True:
        return 100.0
    if node.get("done") is False:
        return 0.0
    # Unknown leaf progress defaults to 0
    return 0.0


def rollup_percentages(node: TaskNode) -> TaskNode:
    """Return a new node with ``percent`` rolled up from its children."""
    node_copy = deepcopy(node)

    children = _get_children(node_copy)
    if children:
        rolled_tasks = [rollup_percentages(c) for c in node_copy.get("tasks", [])]
        rolled_subtasks = [rollup_percentages(c) for c in node_copy.get("subtasks", [])]
        if "tasks" in node_copy:
            node_copy["tasks"] = rolled_tasks
        if "subtasks" in node_copy:
            node_copy["subtasks"] = rolled_subtasks
        child_percents = [child["percent"] for child in rolled_tasks + rolled_subtasks]
        if child_percents:
            node_copy["percent"] = sum(child_percents) / len(child_percents)
        else:
            node_copy["percent"] = 0.0
    else:
        node_copy["percent"] = _compute_leaf_percent(node_copy)

    return node_copy
