import typer
from pathlib import Path
from .domain import ArticleProject, TaskNode
from .progress import render_tree

app = typer.Typer(help="Article Checklist Manager CLI")

PROJECT_FILE = "acm.yaml"


def load_project(path: Path = Path('.')) -> ArticleProject:
    file = path / PROJECT_FILE
    if not file.exists():
        raise typer.BadParameter(f"Project not initialised: {file} not found")
    return ArticleProject.from_yaml(file.read_text())


def save_project(project: ArticleProject, path: Path = Path('.')) -> None:
    file = path / PROJECT_FILE
    file.write_text(project.to_yaml())


def ensure_task(project: ArticleProject, path: str) -> TaskNode:
    parts = [p for p in path.split('/') if p]
    tasks = project.checklist.tasks
    node: TaskNode | None = None
    for part in parts:
        for t in tasks:
            if t.item == part:
                node = t
                break
        else:
            node = TaskNode(item=part)
            tasks.append(node)
        tasks = node.subtasks
    assert node is not None
    return node


def find_task(project: ArticleProject, path: str) -> TaskNode:
    parts = [p for p in path.split('/') if p]
    tasks = project.checklist.tasks
    node: TaskNode | None = None
    for part in parts:
        for t in tasks:
            if t.item == part:
                node = t
                tasks = t.subtasks
                break
        else:
            raise typer.BadParameter(f"Task path not found: {'/'.join(parts)}")
    assert node is not None
    return node


def find_parent(tasks, parts):
    parent = None
    idx = None
    current = tasks
    for part in parts:
        for i, t in enumerate(current):
            if t.item == part:
                parent = current
                idx = i
                current = t.subtasks
                break
        else:
            raise typer.BadParameter(f"Task path not found: {'/'.join(parts)}")
    return parent, idx


@app.command()
def init(project_name: str = typer.Option(None, help="Name of the project. Defaults to the current directory name.")):
    """Initialize a new article project in the current folder."""
    path = Path('.')
    if (path / PROJECT_FILE).exists():
        raise typer.BadParameter(f"Project already initialised at {path.resolve()}")

    if project_name is None:
        project_name = path.resolve().name

    project = ArticleProject(name=project_name)
    # Create a basic starter checklist
    project.checklist.tasks = [
        TaskNode(item="Title and Abstract", subtasks=[
            TaskNode(item="Title finalized"),
            TaskNode(item="Abstract drafted"),
        ]),
        TaskNode(item="Introduction"),
        TaskNode(item="Methods"),
        TaskNode(item="Results"),
        TaskNode(item="Discussion"),
        TaskNode(item="Figures & Tables"),
        TaskNode(item="References"),
    ]
    (path / PROJECT_FILE).write_text(project.to_yaml())
    typer.echo(f"Initialised project '{project_name}' at {path.resolve()}")


@app.command()
def status():
    """Show current checklist status."""
    project = load_project()
    root = TaskNode(item=project.name, subtasks=project.checklist.tasks)
    typer.echo(render_tree(root.to_progress_node()))


@app.command()
def check(task: str, percent: int = typer.Option(None, "--percent", min=0, max=100), done: bool = typer.Option(False, "--done")):
    """Mark a task as done or update percentage."""
    project = load_project()
    try:
        node = find_task(project, task)
    except typer.BadParameter as e:
        typer.echo(e)
        return
    if done:
        node.done = True
    if percent is not None:
        node.percent = percent
    save_project(project)
    typer.echo(f"Updated {task}")


@app.command()
def uncheck(task: str):
    """Mark a task as not done."""
    project = load_project()
    try:
        node = find_task(project, task)
        node.done = False
        node.percent = None
        save_project(project)
        typer.echo(f"Unchecked {task}")
    except typer.BadParameter as e:
        typer.echo(e)


@app.command()
def rename(task: str, new_name: str):
    """Rename a task."""
    project = load_project()
    node = find_task(project, task)
    node.item = new_name
    save_project(project)
    typer.echo(f"Renamed {task} -> {new_name}")


@app.command()
def delete(task: str):
    """Delete a task."""
    project = load_project()
    parts = [p for p in task.split('/') if p]
    if typer.confirm(f"Are you sure you want to delete '{task}'?"):
        parent, idx = find_parent(project.checklist.tasks, parts)
        parent.pop(idx)
        save_project(project)
        typer.echo(f"Deleted '{task}'")


@app.command()
def template(journal: str, article_type: str = typer.Option(None)):
    """Generate a journal checklist template."""
    from .journal import generate_template

    checklist = generate_template(journal, article_type)
    typer.echo(checklist.to_yaml())


@app.command()
def edit():
    """Open the interactive manuscript editor."""
    from .manuscript import cli_editor

    cli_editor(Path('.'))


if __name__ == "__main__":
    app()
