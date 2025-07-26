from __future__ import annotations

"""Utilities for editing manuscript sections via CLI or Colab."""

from pathlib import Path
from typing import Dict, Optional
import threading
import time
import curses
from curses import textpad
import yaml

from .progress import progress_bar

SECTIONS_FILE = "manuscript.yaml"
SAVE_INTERVAL = 2.0


def load_sections(path: Path) -> Dict[str, dict]:
    """Load manuscript sections from ``manuscript.yaml``.

    Parameters
    ----------
    path:
        Directory containing the manuscript file.

    Returns
    -------
    dict
        Mapping of section names to ``{"text": str, "limit": int | None}``.
    """
    file = path / SECTIONS_FILE
    if not file.exists():
        return {}
    data = yaml.safe_load(file.read_text()) or {}
    return data.get("sections", {})


def save_sections(sections: Dict[str, dict], path: Path) -> None:
    """Persist sections to ``manuscript.yaml``."""
    file = path / SECTIONS_FILE
    file.write_text(yaml.dump({"sections": sections}, sort_keys=False))


def _update_status(win, text: str, limit: Optional[int]) -> None:
    words = len(text.split())
    chars = len(text)
    pct = 0.0
    if limit:
        pct = min(words / limit * 100, 100)
    bar = progress_bar(pct, width=20)
    win.erase()
    win.addstr(0, 0, f"Words: {words}  Chars: {chars}")
    if limit:
        win.addstr(1, 0, f"[{bar}] {pct:6.2f}% of {limit} words")
    win.refresh()


def _edit_section(stdscr, name: str, data: dict, save_cb) -> None:
    height, width = stdscr.getmaxyx()
    edit_win = curses.newwin(height - 2, width, 0, 0)
    status_win = curses.newwin(2, width, height - 2, 0)

    edit_win.addstr(0, 0, data.get("text", ""))
    box = textpad.Textbox(edit_win)
    running = True

    def autosave_loop() -> None:
        while running:
            data["text"] = box.gather()
            save_cb()
            time.sleep(SAVE_INTERVAL)

    t = threading.Thread(target=autosave_loop, daemon=True)
    t.start()

    def validator(ch):
        _update_status(status_win, box.gather(), data.get("limit"))
        return ch

    box.edit(validator)
    running = False
    data["text"] = box.gather()
    save_cb()


def cli_editor(path: Path = Path(".")) -> None:
    """Run a simple curses-based manuscript editor."""
    sections = load_sections(path)
    if not sections:
        sections = {"Introduction": {"text": "", "limit": None}}

    current = 0
    names = list(sections.keys())

    def save_all():
        save_sections(sections, path)

    def menu(stdscr):
        nonlocal current, names
        curses.curs_set(0)
        while True:
            stdscr.erase()
            stdscr.addstr(0, 0, "Select section (Enter to edit, n=add, q=quit)")
            for i, name in enumerate(names):
                attr = curses.A_REVERSE if i == current else 0
                stdscr.addstr(i + 1, 0, name, attr)
            ch = stdscr.getch()
            if ch in (curses.KEY_UP, ord("k")):
                current = max(0, current - 1)
            elif ch in (curses.KEY_DOWN, ord("j")):
                current = min(len(names) - 1, current + 1)
            elif ch in (10, 13):
                curses.curs_set(1)
                _edit_section(stdscr, names[current], sections[names[current]], save_all)
                curses.curs_set(0)
            elif ch == ord("n"):
                stdscr.addstr(len(names) + 2, 0, "New section name: ")
                curses.echo()
                name = stdscr.getstr().decode("utf-8").strip()
                curses.noecho()
                if name:
                    sections[name] = {"text": "", "limit": None}
                    names = list(sections.keys())
                    current = names.index(name)
                    save_all()
            elif ch in (ord("q"), 27):
                break
            stdscr.refresh()

    curses.wrapper(menu)


def colab_editor(path: Path = Path(".")):
    """Return ipywidgets for editing manuscript sections in Colab."""
    import ipywidgets as widgets  # type: ignore

    sections = load_sections(path)
    if not sections:
        sections = {"Introduction": {"text": "", "limit": None}}

    names = list(sections.keys())
    dropdown = widgets.Dropdown(options=names)
    textarea = widgets.Textarea(layout=widgets.Layout(width="100%", height="300px"))
    info = widgets.HTML()
    progress = widgets.FloatProgress(value=0, min=0, max=100)
    new_name = widgets.Text(placeholder="New section name")
    add_btn = widgets.Button(description="Add")

    current = {"name": dropdown.value}

    def save_current(*args):
        sections[current["name"]]["text"] = textarea.value
        save_sections(sections, path)

    save_timer: Optional[threading.Timer] = None

    def schedule_save(*args):
        nonlocal save_timer
        if save_timer:
            save_timer.cancel()
        save_timer = threading.Timer(SAVE_INTERVAL, save_current)
        save_timer.start()

    def update_counts(*args):
        text = textarea.value
        words = len(text.split())
        chars = len(text)
        limit = sections[current["name"]].get("limit")
        pct = 0
        if limit:
            pct = min(words / limit * 100, 100)
        info.value = f"<b>{words} words</b> | {chars} chars"
        progress.value = pct

    def on_dropdown(change):
        save_current()
        current["name"] = change.new
        textarea.value = sections[current["name"]].get("text", "")
        update_counts()

    def on_add(btn):
        name = new_name.value.strip()
        if not name:
            return
        sections[name] = {"text": "", "limit": None}
        dropdown.options = list(sections.keys())
        dropdown.value = name
        new_name.value = ""
        save_sections(sections, path)

    dropdown.observe(on_dropdown, "value")
    textarea.observe(update_counts, "value")
    textarea.observe(schedule_save, "value")
    add_btn.on_click(on_add)
    textarea.value = sections[current["name"]].get("text", "")
    update_counts()

    return widgets.VBox([
        widgets.HBox([dropdown, new_name, add_btn]),
        textarea,
        info,
        progress,
    ])

__all__ = [
    "load_sections",
    "save_sections",
    "cli_editor",
    "colab_editor",
]
