import json


def append_guideline(file_path: str, new_entry: dict) -> None:
    """Append a guideline entry to ``file_path``.

    Parameters
    ----------
    file_path:
        Path to ``journal_guidelines.json``.
    new_entry:
        Guideline object to append.
    """
    with open(file_path, "r+", encoding="utf-8") as f:
        data = json.load(f)
        data.append(new_entry)
        f.seek(0)
        json.dump(data, f, indent=2)
        f.truncate()


def main() -> None:
    file_path = "journal_guidelines.json"
    new_entry: dict = {
        # fill in your guideline fields here
    }
    append_guideline(file_path, new_entry)


if __name__ == "__main__":
    main()
