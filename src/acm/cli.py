import typer

app = typer.Typer(help="Article Checklist Manager CLI")

@app.command()
def init(project_name: str):
    """Initialize a new article project."""
    typer.echo("init stub - project: {}".format(project_name))

@app.command()
def status():
    """Show current checklist status."""
    typer.echo("status stub")

@app.command()
def check(task: str, percent: int = typer.Option(None, "--percent", min=0, max=100), done: bool = typer.Option(False, "--done")):
    """Mark a task as done or update percentage."""
    typer.echo(f"check stub - task: {task} percent={percent} done={done}")

@app.command()
def uncheck(task: str):
    """Mark a task as not done."""
    typer.echo(f"uncheck stub - task: {task}")

@app.command()
def rename(task: str, new_name: str):
    """Rename a task."""
    typer.echo(f"rename stub - task: {task} new_name={new_name}")

@app.command()
def delete(task: str):
    """Delete a task."""
    typer.echo(f"delete stub - task: {task}")

if __name__ == "__main__":
    app()
