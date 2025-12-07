export function getTomorrowWindow({
  startHour = 6,
  startMinute = 0,
  endHour = 12,
  endMinute = 0,
} = {}) {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const start = new Date(tomorrow);
  start.setHours(startHour, startMinute, 0, 0);
  const end = new Date(tomorrow);
  end.setHours(endHour, endMinute, 0, 0);
  return { start, end };
}

export function parseTaskDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function deriveScheduledDate(task, windowStart, windowEnd, seed = 0) {
  const explicitSource = task.scheduledTime || task.deadline;
  const hasTimeComponent = typeof explicitSource === 'string' && explicitSource.includes('T');
  if (hasTimeComponent) {
    const explicit = parseTaskDate(explicitSource);
    if (explicit) return explicit;
  }

  // If the task has no explicit time but is meant for the same day as the window,
  // assign a deterministic offset within the window so items appear on the grid.
  const taskDate = task.deadline ? parseTaskDate(task.deadline) : null;
  if (taskDate) {
    const sameDay =
      taskDate.getFullYear() === windowStart.getFullYear() &&
      taskDate.getMonth() === windowStart.getMonth() &&
      taskDate.getDate() === windowStart.getDate();
    if (!sameDay) return null;
  }

  const windowMinutes = Math.max(1, (windowEnd - windowStart) / (1000 * 60));
  const offsetMinutes = seed % windowMinutes;
  const scheduled = new Date(windowStart);
  scheduled.setMinutes(windowStart.getMinutes() + offsetMinutes);
  return scheduled;
}

export function mapTimeToRatio(time, minTime, maxTime) {
  if (!time || !minTime || !maxTime || maxTime.getTime() === minTime.getTime()) {
    return 0;
  }
  const clamped = Math.min(Math.max(time.getTime(), minTime.getTime()), maxTime.getTime());
  const ratio = (clamped - minTime.getTime()) / (maxTime.getTime() - minTime.getTime());
  return Math.min(1, Math.max(0, ratio));
}
