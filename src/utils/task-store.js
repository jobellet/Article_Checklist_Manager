const DEFAULT_DURATION_ALPHA = 0.35;

/**
 * Simple in-memory Task representation used to mock the richer scheduler layer.
 * @typedef {Object} Task
 * @property {string} id
 * @property {string} user
 * @property {string} name
 * @property {number} durationMinutes
 * @property {number} [importance]
 * @property {number} [urgency]
 * @property {string|null} [deadline]
 * @property {string|null} [dependency]
 * @property {('FIX'|'FLEX')} [fixFlex]
 * @property {boolean} [completed]
 * @property {boolean} [active]
 * @property {string|null} [routineId]
 * @property {string|null} [type]
 */

/**
 * A lightweight TaskStore used for data-layer validation of the requested
 * scheduling/routine integrations. It stays UI-agnostic so it can be wired into
 * multiple front-end surfaces later (Today View, Planner, Focus Mode, etc.).
 */
export class TaskStore {
  constructor({ durationAlpha = DEFAULT_DURATION_ALPHA } = {}) {
    this.tasks = new Map();
    this.routines = new Map();
    this.durationProfiles = new Map();
    this.durationAlpha = durationAlpha;
    this.nextTaskId = 1;
  }

  /**
   * Add or update the shared duration profile for a task name using an
   * exponential moving average so routine and non-routine items learn together.
   * @param {string} name
   * @param {number} observedMinutes
   */
  updateDurationProfile(name, observedMinutes, { excludeTaskId = null } = {}) {
    if (observedMinutes == null) return;
    const profile = this.durationProfiles.get(name);
    let updated;
    if (!profile) {
      const peerDurations = Array.from(this.tasks.values())
        .filter((task) => task.name === name && task.id !== excludeTaskId)
        .map((task) => task.durationMinutes);
      if (!peerDurations.length) {
        this.durationProfiles.set(name, {
          durationMinutes: observedMinutes,
          samples: 1,
        });
        updated = observedMinutes;
      } else {
        const baseline =
          peerDurations.reduce((sum, minutes) => sum + minutes, 0) /
          peerDurations.length;
        updated =
          this.durationAlpha * observedMinutes +
          (1 - this.durationAlpha) * baseline;
        this.durationProfiles.set(name, {
          durationMinutes: updated,
          samples: peerDurations.length + 1,
        });
      }
    } else {
      updated =
        this.durationAlpha * observedMinutes +
        (1 - this.durationAlpha) * profile.durationMinutes;
      this.durationProfiles.set(name, {
        durationMinutes: updated,
        samples: profile.samples + 1,
      });
    }
    // cascade the learned duration to all matching tasks to keep scheduling
    // estimates consistent across routine/non-routine instances
    for (const task of this.tasks.values()) {
      if (task.name === name && !task.completed) {
        task.durationMinutes = updated;
      }
    }
  }

  getLearnedDuration(name) {
    return this.durationProfiles.get(name)?.durationMinutes ?? null;
  }

  generateTaskId() {
    return String(this.nextTaskId++);
  }

  /**
   * Persist a task and return the stored copy.
   * @param {Partial<Task>} task
   * @returns {Task}
   */
  addTask(task) {
    const id = task.id ?? this.generateTaskId();
    const record = {
      completed: false,
      active: true,
      dependency: null,
      deadline: null,
      fixFlex: 'FLEX',
      type: task.type ?? null,
      ...task,
      id,
    };
    this.tasks.set(id, record);
    return record;
  }

  updateTask(id, updates) {
    const existing = this.tasks.get(id);
    if (!existing) return null;
    const previous = { ...existing };
    Object.assign(existing, updates);
    if (updates.name) {
      const learned = this.getLearnedDuration(updates.name);
      if (learned) existing.durationMinutes = learned;
    }
    return { previous, updated: existing };
  }

  /**
   * Mark a task complete and feed its duration back into the learning profile.
   */
  markTaskComplete(id, { actualDurationMinutes, scheduledDurationMinutes } = {}) {
    const task = this.tasks.get(id);
    if (!task) return null;
    if (task.completed) return task;
    const observed =
      actualDurationMinutes ?? scheduledDurationMinutes ?? task.durationMinutes;
    this.updateDurationProfile(task.name, observed, { excludeTaskId: id });
    task.completed = true;
    task.completedAt = new Date().toISOString();
    task.durationMinutes = this.getLearnedDuration(task.name) ?? task.durationMinutes;
    return task;
  }

  /**
   * Create routine-linked tasks for each step. Steps can be re-ordered and
   * updated later via updateRoutine.
   */
  createRoutine({ id, user, steps }) {
    const routineId = id ?? `routine-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const stepTaskIds = new Map();
    steps.forEach((step, index) => {
      const stepId = step.id ?? `${routineId}-step-${index + 1}`;
      const task = this.addTask({
        user,
        name: step.label,
        durationMinutes: step.durationMinutes,
        importance: step.importance,
        deadline: step.deadline ?? null,
        dependency: step.dependency ?? null,
        fixFlex: step.fixFlex ?? 'FLEX',
        routineId,
      });
      stepTaskIds.set(stepId, task.id);
    });
    const stored = { id: routineId, user, steps, stepTaskIds, active: true };
    this.routines.set(routineId, stored);
    return stored;
  }

  /**
   * Update a routine definition and sync underlying tasks. Removed steps mark
   * their tasks inactive to preserve history.
   */
  updateRoutine(routineId, { steps }) {
    const routine = this.routines.get(routineId);
    if (!routine) return null;
    const seenTaskIds = new Set();
    const updatedSteps = steps.map((step, index) => {
      const stepId = step.id ?? `${routineId}-step-${index + 1}`;
      let taskId = routine.stepTaskIds.get(stepId);
      if (!taskId) {
        const task = this.addTask({
          user: routine.user,
          name: step.label,
          durationMinutes: step.durationMinutes,
          importance: step.importance,
          deadline: step.deadline ?? null,
          dependency: step.dependency ?? null,
          fixFlex: step.fixFlex ?? 'FLEX',
          routineId,
        });
        taskId = task.id;
      } else {
        this.updateTask(taskId, {
          name: step.label,
          durationMinutes: step.durationMinutes,
          importance: step.importance,
          deadline: step.deadline ?? null,
          dependency: step.dependency ?? null,
          fixFlex: step.fixFlex ?? 'FLEX',
        });
      }
      seenTaskIds.add(taskId);
      routine.stepTaskIds.set(stepId, taskId);
      return { ...step, id: stepId };
    });

    // deactivate tasks that no longer have matching steps
    for (const [stepId, taskId] of routine.stepTaskIds.entries()) {
      if (!updatedSteps.find((s) => s.id === stepId)) {
        const task = this.tasks.get(taskId);
        if (task) task.active = false;
      }
    }

    routine.steps = updatedSteps;
    return routine;
  }

  deleteRoutine(routineId, { keepTaskHistory = true } = {}) {
    const routine = this.routines.get(routineId);
    if (!routine) return false;
    routine.active = false;
    if (!keepTaskHistory) {
      for (const taskId of routine.stepTaskIds.values()) {
        this.tasks.delete(taskId);
      }
    } else {
      for (const taskId of routine.stepTaskIds.values()) {
        const task = this.tasks.get(taskId);
        if (task) task.active = false;
      }
    }
    return true;
  }

  markRoutineStepComplete(routineId, stepId, { actualDurationMinutes, scheduledDurationMinutes } = {}) {
    const routine = this.routines.get(routineId);
    if (!routine) return null;
    const taskId = routine.stepTaskIds.get(stepId);
    if (!taskId) return null;
    return this.markTaskComplete(taskId, {
      actualDurationMinutes,
      scheduledDurationMinutes,
    });
  }

  /**
   * Simple focus session passthrough to Task completion to keep completion
   * plumbing consistent across Today View / Planner entry points.
   */
  completeFocusSession(taskId, { actualDurationMinutes, scheduledDurationMinutes } = {}) {
    return this.markTaskComplete(taskId, {
      actualDurationMinutes,
      scheduledDurationMinutes,
    });
  }

  /**
   * Filter tasks by user and active flag.
   */
  getTasksForUser(user, { includeInactive = false } = {}) {
    return Array.from(this.tasks.values()).filter(
      (task) => task.user === user && (includeInactive || task.active),
    );
  }

  /**
   * Apply skip/reschedule logic. This method only stores metadata; callers can
   * interpret it when rebuilding schedules.
   */
  rescheduleTask(id, { newDate, dependencyCascade = false }) {
    const task = this.tasks.get(id);
    if (!task) return null;
    if (task.dependency && !dependencyCascade) {
      return { blocked: true, reason: 'blocked-by-dependency' };
    }
    task.deadline = newDate ?? task.deadline;
    return { blocked: false, task };
  }

  ingestHabitCompletion({ name, user, durationMinutes = 15, importance = 2 }) {
    const taskName = name.startsWith('Habit:') ? name : `Habit: ${name}`;
    const task = this.addTask({
      user,
      name: taskName,
      durationMinutes,
      importance,
      type: 'habit',
    });
    this.markTaskComplete(task.id, { scheduledDurationMinutes: durationMinutes });
    return task;
  }
}

export const habitDefaults = {
  durationMinutes: 15,
  importance: 2,
};
