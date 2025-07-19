import os, sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import pytest

from acm.progress import rollup_percentages


def test_leaf_done():
    node = {"item": "figures", "done": True}
    result = rollup_percentages(node)
    assert result["percent"] == 100.0


def test_leaf_percent_override():
    node = {"item": "draft", "percent": 30}
    result = rollup_percentages(node)
    assert result["percent"] == 30


def test_nested_average():
    tree = {
        "item": "root",
        "tasks": [
            {"item": "a", "done": True},
            {"item": "b", "done": False},
            {
                "item": "c",
                "subtasks": [
                    {"item": "c1", "percent": 50},
                    {"item": "c2", "percent": 100},
                ],
            },
        ],
    }
    result = rollup_percentages(tree)
    # Node c average: (50+100)/2 = 75
    # Root average: (100 + 0 + 75) / 3 = 58.333...
    assert pytest.approx(result["percent"], 0.01) == 58.333
