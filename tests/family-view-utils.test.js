import test from 'node:test';
import assert from 'node:assert';
import {
  deriveScheduledDate,
  getTomorrowWindow,
  mapTimeToRatio,
  parseTaskDate,
} from '../src/utils/family-view-utils.js';

test('mapTimeToRatio clamps and is monotonic', () => {
  const base = new Date('2024-01-01T06:00:00Z');
  const mid = new Date('2024-01-01T09:00:00Z');
  const end = new Date('2024-01-01T12:00:00Z');
  assert.strictEqual(mapTimeToRatio(mid, base, end), 0.5);
  assert.strictEqual(mapTimeToRatio(base, base, end), 0);
  assert.strictEqual(mapTimeToRatio(end, base, end), 1);
  assert.strictEqual(mapTimeToRatio(new Date('2024-01-01T13:00:00Z'), base, end), 1);
  assert.strictEqual(mapTimeToRatio(new Date('2024-01-01T05:00:00Z'), base, end), 0);
});

test('deriveScheduledDate uses explicit scheduledTime first', () => {
  const window = getTomorrowWindow();
  const task = { scheduledTime: '2024-01-01T07:30:00Z' };
  const scheduled = deriveScheduledDate(task, window.start, window.end, 0);
  assert.ok(scheduled instanceof Date);
  assert.strictEqual(scheduled.toISOString(), '2024-01-01T07:30:00.000Z');
});

test('deriveScheduledDate deterministically offsets tasks without time inside window', () => {
  const { start, end } = getTomorrowWindow();
  const task = { deadline: start.toISOString().slice(0, 10) };
  const scheduledA = deriveScheduledDate(task, start, end, 5);
  const scheduledB = deriveScheduledDate(task, start, end, 5);
  assert.strictEqual(scheduledA.getTime(), scheduledB.getTime());
  assert.ok(scheduledA >= start && scheduledA <= end);
});

test('parseTaskDate handles invalid input gracefully', () => {
  assert.strictEqual(parseTaskDate(''), null);
  assert.strictEqual(parseTaskDate(null), null);
  assert.strictEqual(parseTaskDate('not-a-date'), null);
});
