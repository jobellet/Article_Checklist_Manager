from pathlib import Path
from acm.manuscript import load_sections, save_sections


def test_roundtrip(tmp_path: Path) -> None:
    sections = {"Intro": {"text": "Hello", "limit": 100}}
    save_sections(sections, tmp_path)
    assert load_sections(tmp_path) == sections
