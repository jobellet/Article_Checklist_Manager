from acm.progress import compute_progress


def test_leaf_done():
    t = {"item": "x", "done": True}
    assert compute_progress(t) == 100.0


def test_average_subtasks():
    t = {
        "item": "p",
        "subtasks": [
            {"item": "a", "percent": 50},
            {"item": "b", "done": False},
        ],
    }
    assert compute_progress(t) == 25.0


def test_percent_override():
    t = {"item": "p", "percent": 70, "subtasks": [{"item": "a", "done": False}]}
    assert compute_progress(t) == 70.0
