export class TaskNode {
  constructor({ item, done = false, percent = null, subtasks = [] }) {
    this.item = item || "";
    this.done = done;
    this.percent = percent === undefined ? null : percent;
    this.subtasks = subtasks.map((s) => new TaskNode(s));
  }

  addSubtask(subtask) {
    this.subtasks.push(subtask);
  }

  removeSubtask(index) {
    this.subtasks.splice(index, 1);
  }

  computedPercent() {
    if (this.done) return 100;
    if (this.percent !== null && this.percent !== undefined) {
      return Number(this.percent);
    }
    if (!this.subtasks.length) return 0;
    const sum = this.subtasks.reduce((acc, child) => acc + child.computedPercent(), 0);
    return sum / this.subtasks.length;
  }

  toDict() {
    const data = { item: this.item };
    if (this.done) data.done = true;
    if (this.percent !== null && this.percent !== undefined) data.percent = Number(this.percent);
    if (this.subtasks.length) data.subtasks = this.subtasks.map((s) => s.toDict());
    return data;
  }

  static fromDict(data) {
    return new TaskNode({
      item: data?.item ?? "",
      done: data?.done ?? false,
      percent: data?.percent ?? null,
      subtasks: (data?.subtasks || data?.tasks || []).map((s) => TaskNode.fromDict(s)),
    });
  }
}

export class Checklist {
  constructor({ tasks = [] } = {}) {
    this.tasks = tasks.map((t) => new TaskNode(t));
  }

  addTask(task) {
    this.tasks.push(task);
  }

  removeTask(index) {
    this.tasks.splice(index, 1);
  }

  computedPercent() {
    if (!this.tasks.length) return 0;
    const total = this.tasks.reduce((acc, task) => acc + task.computedPercent(), 0);
    return total / this.tasks.length;
  }

  toDict() {
    return { tasks: this.tasks.map((t) => t.toDict()) };
  }

  static fromDict(data) {
    return new Checklist({ tasks: data?.tasks || [] });
  }
}

export class ArticleProject {
  constructor({ name, checklist = new Checklist() }) {
    this.name = name || "Untitled project";
    this.checklist = checklist instanceof Checklist ? checklist : new Checklist(checklist);
  }

  computedPercent() {
    return this.checklist.computedPercent();
  }

  toDict() {
    return { name: this.name, checklist: this.checklist.toDict() };
  }

  toJSON(indent = 2) {
    return JSON.stringify(this.toDict(), null, indent);
  }

  static fromDict(data) {
    return new ArticleProject({
      name: data?.name ?? "Untitled project",
      checklist: Checklist.fromDict(data?.checklist || {}),
    });
  }

  static fromJSON(text) {
    return ArticleProject.fromDict(JSON.parse(text));
  }
}

export function createDemoProject() {
  return new ArticleProject({
    name: "Demo manuscript",
    checklist: new Checklist({
      tasks: [
        {
          item: "Title & Abstract",
          percent: 60,
          subtasks: [
            { item: "Finalize title", done: true },
            { item: "Polish abstract", percent: 40 },
          ],
        },
        {
          item: "Introduction",
          percent: 50,
          subtasks: [
            { item: "Literature gap", done: true },
            { item: "Hypothesis", percent: 50 },
            { item: "Outline flow", percent: 0 },
          ],
        },
        {
          item: "Methods",
          subtasks: [
            { item: "Data collection", percent: 50 },
            { item: "Analysis plan", percent: 75 },
          ],
        },
        { item: "Results", done: false, percent: 30 },
        { item: "Discussion", done: false, percent: 10 },
      ],
    }),
  });
}
