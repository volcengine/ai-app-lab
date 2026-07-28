const weekdayMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const scheduleMaxAttempts = Number.POSITIVE_INFINITY;

export function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
    weekday: get('weekday'),
  };
}

export function isScheduleDue(settings, now = new Date()) {
  if (!settings?.enabled) return false;
  const parts = zonedParts(now, settings.timezone);
  const days = settings.schedule_days || weekdayMap.slice(1, 6);
  if (!days.includes(parts.weekday)) return false;
  if (parts.time < settings.schedule_time) return false;
  if (settings.last_run_date === parts.date) return false;
  const settingsUpdatedAt = Date.parse(settings.updated_at || '');
  const scheduledAt = zonedDateTimeToInstant(
    parts.date,
    settings.schedule_time,
    settings.timezone,
  ).getTime();
  if (
    settings.schedule_attempt_date !== parts.date
    && Number.isFinite(settingsUpdatedAt)
    && settingsUpdatedAt > scheduledAt
  ) return false;
  if (settings.schedule_attempt_date === parts.date) {
    const retryAt = Date.parse(settings.next_retry_at || '');
    if (Number.isFinite(retryAt) && now.getTime() < retryAt) return false;
  }
  return true;
}

function addCalendarDays(dateText, offset) {
  const [year, month, day] = dateText.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + offset, 12)).toISOString().slice(0, 10);
}

function zonedDateTimeToInstant(dateText, timeText, timeZone) {
  const [year, month, day] = dateText.split('-').map(Number);
  const [hour, minute] = timeText.split(':').map(Number);
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = targetAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = zonedParts(new Date(candidate), timeZone);
    const [shownYear, shownMonth, shownDay] = parts.date.split('-').map(Number);
    const [shownHour, shownMinute] = parts.time.split(':').map(Number);
    const shownAsUtc = Date.UTC(shownYear, shownMonth - 1, shownDay, shownHour, shownMinute);
    candidate += targetAsUtc - shownAsUtc;
  }
  return new Date(candidate);
}

export function nextScheduledRun(settings, now = new Date()) {
  if (!settings?.enabled) return null;
  const allowed = new Set(settings.schedule_days || weekdayMap.slice(1, 6));
  const current = zonedParts(now, settings.timezone);
  const today = current.date;
  if (settings.schedule_attempt_date === today && settings.next_retry_at) {
    const retryAt = new Date(settings.next_retry_at);
    if (!Number.isNaN(retryAt.getTime())) {
      const retry = zonedParts(retryAt, settings.timezone);
      if (retry.date === today && retryAt > now) return `${retry.date} ${retry.time}`;
    }
  }
  for (let offset = 0; offset < 14; offset += 1) {
    const date = addCalendarDays(today, offset);
    const candidate = zonedDateTimeToInstant(date, settings.schedule_time, settings.timezone);
    const parts = zonedParts(candidate, settings.timezone);
    if (!allowed.has(parts.weekday)) continue;
    if (settings.last_run_date === date || candidate <= now) continue;
    return `${date} ${settings.schedule_time}`;
  }
  return null;
}

export const timeInternals = { addCalendarDays, zonedDateTimeToInstant };
