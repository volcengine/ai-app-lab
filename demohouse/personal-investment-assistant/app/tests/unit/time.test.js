import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isScheduleDue,
  nextScheduledRun,
  timeInternals,
  zonedParts,
} from '../../src/server/domain/time.js';

const settings = {
  enabled: true,
  schedule_time: '18:00',
  schedule_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  timezone: 'Asia/Shanghai',
  last_run_date: null,
};

test('detects a due run using the configured timezone', () => {
  assert.equal(isScheduleDue(settings, new Date('2026-07-21T09:59:00.000Z')), false);
  assert.equal(isScheduleDue(settings, new Date('2026-07-21T10:01:00.000Z')), true);
});

test('does not backfill a schedule configured after today planned time', () => {
  const configuredAfterSchedule = {
    ...settings,
    updated_at: '2026-07-21T10:00:30.000Z',
  };
  assert.equal(
    isScheduleDue(configuredAfterSchedule, new Date('2026-07-21T10:01:00.000Z')),
    false,
  );
  assert.equal(
    isScheduleDue(configuredAfterSchedule, new Date('2026-07-22T10:01:00.000Z')),
    true,
  );
});

test('never presents a past-due time as the next execution', () => {
  const now = new Date('2026-07-21T10:01:00.000Z');
  assert.equal(nextScheduledRun(settings, now), '2026-07-22 18:00');
  assert.equal(nextScheduledRun({ ...settings, last_run_date: '2026-07-21' }, now), '2026-07-22 18:00');
});

test('skips a future schedule when the same local day already ran', () => {
  const now = new Date('2026-07-21T01:00:00.000Z');
  assert.equal(nextScheduledRun({ ...settings, last_run_date: '2026-07-21' }, now), '2026-07-22 18:00');
});

test('waits for a scheduled retry without a daily attempt limit', () => {
  const retrying = {
    ...settings,
    schedule_attempt_date: '2026-07-21',
    schedule_retry_count: 1,
    next_retry_at: '2026-07-21T10:05:00.000Z',
  };
  assert.equal(isScheduleDue(retrying, new Date('2026-07-21T10:04:59.000Z')), false);
  assert.equal(isScheduleDue(retrying, new Date('2026-07-21T10:05:00.000Z')), true);
  assert.equal(nextScheduledRun(retrying, new Date('2026-07-21T10:01:00.000Z')), '2026-07-21 18:05');
  assert.equal(nextScheduledRun(retrying, new Date('2026-07-21T10:06:00.000Z')), '2026-07-22 18:00');

  const exhausted = {
    ...retrying,
    schedule_retry_count: 3,
    next_retry_at: null,
  };
  assert.equal(isScheduleDue(exhausted, new Date('2026-07-21T12:00:00.000Z')), true);
  assert.equal(nextScheduledRun(exhausted, new Date('2026-07-21T12:00:00.000Z')), '2026-07-22 18:00');
});

test('converts local schedule time across daylight-saving offsets', () => {
  const instant = timeInternals.zonedDateTimeToInstant('2026-03-09', '09:00', 'America/New_York');
  assert.equal(instant.toISOString(), '2026-03-09T13:00:00.000Z');
  assert.deepEqual(zonedParts(instant, 'America/New_York'), {
    date: '2026-03-09', time: '09:00', weekday: 'Mon',
  });
});
