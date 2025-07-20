"""Utilities for running Article Checklist Manager inside Google Colab."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def _maybe_mount_drive() -> None:
    """Mount Google Drive if running in Colab."""
    try:
        from google.colab import drive  # type: ignore

        if not Path("/content/drive").exists():
            drive.mount("/content/drive")
    except Exception:
        # Not running on Colab or drive already mounted
        pass


def setup(project: str = "DemoPaper", repo_url: str | None = None) -> Path:
    """Prepare the Colab environment and return the project directory.

    The helper performs a few convenience steps so new users can focus on
    exploring the package:

    1. Mount Google Drive (if available) so projects persist between sessions.
    2. Clone the repository and install it in editable mode if ``repo_url`` is
       provided and the repo is not already present.
    3. Ensure a checklist project named ``project`` exists, creating it if
       necessary.

    Parameters
    ----------
    project:
        Name of the checklist project directory to create.
    repo_url:
        Optional Git repository URL to clone. If ``None`` the current
        directory is assumed to already contain the code.

    Returns
    -------
    Path
        Path to the project directory.
    """

    _maybe_mount_drive()

    cwd = Path.cwd()
    if repo_url:
        repo_name = Path(repo_url).stem
        if not (cwd / repo_name).exists():
            subprocess.run(["git", "clone", repo_url], check=True)
        cwd = cwd / repo_name

    subprocess.run([sys.executable, "-m", "pip", "install", "-e", "."], cwd=cwd, check=True)

    project_path = cwd / project
    if not project_path.exists():
        subprocess.run([sys.executable, "-m", "acm.cli", "init", project], cwd=cwd, check=True)
    return project_path

__all__ = ["setup"]
