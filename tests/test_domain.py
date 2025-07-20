import json
from acm.domain import TaskNode, Checklist, ArticleProject


def test_tasknode_roundtrip():
    node = TaskNode(item="Root", done=True, percent=50)
    node.add_subtask(TaskNode(item="Child"))
    data = node.to_dict()
    restored = TaskNode.from_dict(data)
    assert restored.item == "Root"
    assert restored.subtasks[0].item == "Child"


def test_checklist_json_yaml():
    checklist = Checklist()
    checklist.add_task(TaskNode(item="Task"))
    json_data = checklist.to_json()
    yaml_data = checklist.to_yaml()
    assert Checklist.from_json(json_data).to_dict() == checklist.to_dict()
    assert Checklist.from_yaml(yaml_data).to_dict() == checklist.to_dict()


def test_articleproject_serialisation():
    project = ArticleProject(name="My Paper")
    project.add_task(TaskNode(item="Intro"))
    json_data = project.to_json()
    yaml_data = project.to_yaml()
    assert ArticleProject.from_json(json_data).to_dict() == project.to_dict()
    assert ArticleProject.from_yaml(yaml_data).to_dict() == project.to_dict()
