import json
import sys
from pathlib import Path


def validate_json(file_path: str) -> bool:
    """Return ``True`` if ``file_path`` contains valid JSON."""
    with open(file_path, "r", encoding="utf-8") as f:
        try:
            json.load(f)
        except json.JSONDecodeError as e:
            print(f"JSON validation error: {e}")
            return False
    print("JSON is valid.")
    return True


def main() -> None:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("journal_guidelines.json")
    validate_json(str(path))


if __name__ == "__main__":
    main()
