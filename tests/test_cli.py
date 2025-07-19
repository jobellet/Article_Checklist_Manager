import tempfile
from pathlib import Path

import yaml
from typer.testing import CliRunner

from acm.cli import app

runner = CliRunner()


def test_validate_nonexistent_file():
    result = runner.invoke(app, ["validate", "nope.yaml"])
    assert result.exit_code != 0
    assert "File not found" in result.stderr


def test_progress_invalid_yaml(tmp_path):
    path = tmp_path / "bad.yaml"
    path.write_text("foo: [")
    result = runner.invoke(app, ["progress", str(path)])
    assert result.exit_code != 0
    assert "Invalid checklist" in result.stderr


def test_progress_valid(tmp_path):
    data = {"Sec": {"item": "task", "done": True}}
    path = tmp_path / "good.yaml"
    path.write_text(yaml.dump(data))
    result = runner.invoke(app, ["progress", str(path)])
    assert result.exit_code == 0
    assert "Sec: 100%" in result.stdout
