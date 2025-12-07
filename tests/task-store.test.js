import assert from 'assert/strict';
import { describe, it } from 'node:test';
import { TaskStore, habitDefaults } from '../src/utils/task-store.js';

describe('TaskStore routine integration', () => {
  it('creates tasks for each routine step and surfaces them per-user', () => {
    const store = new TaskStore();
    store.createRoutine({
      user: 'alice',
      steps: [
        { label: 'Warmup', durationMinutes: 10, importance: 1 },
        { label: 'Practice', durationMinutes: 25, importance: 2 },
      ],
    });
    const tasks = store.getTasksForUser('alice');
    assert.equal(tasks.length, 2);
    assert.equal(tasks[0].name, 'Warmup');
    assert.equal(tasks[1].name, 'Practice');
  });

  it('updates routine steps and deactivates removed tasks', () => {
    const store = new TaskStore();
    const routine = store.createRoutine({
      id: 'r1',
      user: 'bob',
      steps: [
        { id: 's1', label: 'Draft', durationMinutes: 30 },
        { id: 's2', label: 'Review', durationMinutes: 15 },
      ],
    });

    store.updateRoutine(routine.id, {
      steps: [
        { id: 's1', label: 'Draft', durationMinutes: 35 },
        { id: 's3', label: 'QA', durationMinutes: 20 },
      ],
    });

    const active = store.getTasksForUser('bob');
    assert.equal(active.length, 2);
    assert.equal(active.find((t) => t.name === 'Draft').durationMinutes, 35);
    const reviewTask = Array.from(store.tasks.values()).find((t) => t.name === 'Review');
    assert(reviewTask);
    assert.equal(reviewTask.active, false);
  });

  it('shares duration learning between routine and ad-hoc tasks', () => {
    const store = new TaskStore({ durationAlpha: 0.5 });
    const routine = store.createRoutine({
      id: 'r2',
      user: 'carol',
      steps: [{ id: 's1', label: 'Read', durationMinutes: 20 }],
    });
    const adHoc = store.addTask({ user: 'carol', name: 'Read', durationMinutes: 30 });

    const stepId = routine.stepTaskIds.get('s1');
    store.markRoutineStepComplete('r2', 's1', { actualDurationMinutes: 10 });
    // ad-hoc task should pick up the learned duration
    const learned = store.getLearnedDuration('Read');
    assert.equal(learned, 20); // 0.5*10 + 0.5*30 base
    assert.equal(store.tasks.get(adHoc.id).durationMinutes, learned);
  });
});

describe('Habit integration defaults', () => {
  it('creates habit tasks with a naming convention and completes them', () => {
    const store = new TaskStore();
    const habitTask = store.ingestHabitCompletion({ name: 'Stretch', user: 'dana' });
    assert.equal(habitTask.name, 'Habit: Stretch');
    assert.equal(habitTask.importance, habitDefaults.importance);
    assert.equal(habitTask.durationMinutes, habitDefaults.durationMinutes);
    assert.equal(store.tasks.get(habitTask.id).completed, true);
  });
});

describe('Focus session passthrough', () => {
  it('marks tasks complete and records duration from focus', () => {
    const store = new TaskStore({ durationAlpha: 1 });
    const task = store.addTask({ user: 'erin', name: 'Outline', durationMinutes: 15 });
    store.completeFocusSession(task.id, { actualDurationMinutes: 25 });
    const stored = store.tasks.get(task.id);
    assert.equal(stored.completed, true);
    assert.equal(store.getLearnedDuration('Outline'), 25);
  });
});

describe('TaskStore hydration and corruption handling', () => {
  it('normalizes missing legacy fields when hydrating', () => {
    const store = new TaskStore();
    store.hydrateSnapshot({
      tasks: [
        { id: 'legacy-1', name: 'Legacy task' },
        { name: 'Anonymous task', durationMinutes: 'not-a-number' },
      ],
    });
    const task = store.tasks.get('legacy-1');
    assert.equal(task.user, 'unknown');
    assert.equal(task.durationMinutes, 30);
    assert.equal(task.fixFlex, 'FLEX');
    assert.equal(store.tasks.size, 2);
  });

  it('handles corrupted storage payloads gracefully', () => {
    const store = new TaskStore();
    const badStorage = {
      getItem() {
        return '{"tasks": [invalid json]';
      },
      setItem() {},
    };
    const result = store.loadFromStorage(badStorage, 'acm-taskstore');
    assert.equal(result.ok, false);
    assert.ok(result.message.includes('corrupted'));
  });
});
