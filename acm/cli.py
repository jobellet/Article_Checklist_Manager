from __future__ import annotations

import sys
import yaml
from pathlib import Path
import typer

from .schema import SchemaError, validate_schema
from .progress import compute_progress


app = typer.Typer(help="Article Checklist Manager prototype")


@app.command()
def validate(path: Path) -> None:
    """Validate a YAML checklist file."""
    if not path.exists():
        typer.echo(f"File not found: {path}", err=True)
        raise typer.Exit(1)
    try:
        data = yaml.safe_load(path.read_text())
        validate_schema(data)
    except (yaml.YAMLError, SchemaError) as exc:
        typer.echo(f"Invalid checklist: {exc}", err=True)
        raise typer.Exit(1)
    typer.echo("Checklist valid")


@app.command()
def progress(path: Path) -> None:
    """Compute progress for a YAML checklist file."""
    if not path.exists():
        typer.echo(f"File not found: {path}", err=True)
        raise typer.Exit(1)
    try:
        data = yaml.safe_load(path.read_text())
        validate_schema(data)
    except (yaml.YAMLError, SchemaError) as exc:
        typer.echo(f"Invalid checklist: {exc}", err=True)
        raise typer.Exit(1)

    for name, task in data.items():
        pct = compute_progress(task)
        typer.echo(f"{name}: {pct:.0f}%")
