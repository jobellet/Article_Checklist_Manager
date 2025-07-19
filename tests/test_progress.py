from acm.progress import TaskNode, progress_bar, render_tree

def test_progress_bar_basic():
    assert progress_bar(0, width=10) == "░" * 10
    assert progress_bar(50, width=10) == "█" * 5 + "░" * 5
    assert progress_bar(100, width=10) == "█" * 10


def test_render_tree():
    root = TaskNode("Root", children=[
        TaskNode("Child1", percent=50),
        TaskNode("Child2", percent=100)
    ])
    output = render_tree(root, bar_width=10)
    expected_lines = [
        "Root: [████████░░]  75.00%",
        "  Child1: [█████░░░░░]  50.00%",
        "  Child2: [██████████] 100.00%",
    ]
    assert output.splitlines() == expected_lines

