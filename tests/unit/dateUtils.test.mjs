import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  formatDisplayDate,
  getTodayDateString,
  getTomorrowDateString,
  isOverdue,
  normalizeDueDate,
  timeAgo,
  toDateString,
} from '../../src/lib/dateUtils.js';

describe('dateUtils', () => {
  it('formats local dates with zero padding', () => {
    assert.equal(toDateString(new Date(2026, 0, 5)), '2026-01-05');
    assert.equal(toDateString(new Date(2026, 11, 31)), '2026-12-31');
  });

  it('adds days across month, year and leap-day boundaries', () => {
    assert.equal(addDays('2026-01-31', 1), '2026-02-01');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2028-02-28', 1), '2028-02-29');
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  });

  it('knows today and tomorrow', () => {
    assert.equal(getTomorrowDateString(), addDays(getTodayDateString(), 1));
    assert.equal(formatDisplayDate(getTodayDateString()), 'Today');
    assert.equal(formatDisplayDate(getTomorrowDateString()), 'Tomorrow');
    assert.equal(formatDisplayDate(addDays(getTodayDateString(), -1)), 'Yesterday');
    assert.equal(formatDisplayDate(null), null);
    assert.equal(formatDisplayDate('Today'), null);
  });

  it('flags only past dates as overdue', () => {
    const today = getTodayDateString();
    assert.equal(isOverdue(addDays(today, -1)), true);
    assert.equal(isOverdue(today), false);
    assert.equal(isOverdue(addDays(today, 1)), false);
    assert.equal(isOverdue(null), false);
    assert.equal(isOverdue('Today'), false);
  });

  it('converts old "Today"/"Tomorrow" words relative to when the task was created', () => {
    const created = new Date(2026, 5, 10, 12, 0).toISOString();
    assert.equal(normalizeDueDate('Today', created), '2026-06-10');
    assert.equal(normalizeDueDate('Tomorrow', created), '2026-06-11');
    assert.equal(normalizeDueDate('2026-07-04', created), '2026-07-04');
    assert.equal(normalizeDueDate(null, created), null);
    assert.equal(normalizeDueDate('', created), null);
    assert.equal(normalizeDueDate('garbage', created), null);
  });

  it('describes how long ago something happened', () => {
    const ago = (ms) => new Date(Date.now() - ms).toISOString();
    assert.equal(timeAgo(ago(5 * 1000)), 'just now');
    assert.equal(timeAgo(ago(5 * 60 * 1000)), '5 min ago');
    assert.equal(timeAgo(ago(3 * 3600 * 1000)), '3 h ago');
    assert.equal(timeAgo(ago(24 * 3600 * 1000)), '1 day ago');
    assert.equal(timeAgo(ago(3 * 24 * 3600 * 1000)), '3 days ago');
    assert.match(timeAgo(ago(30 * 24 * 3600 * 1000)), /^[A-Z][a-z]{2} \d{1,2}$/);
    assert.equal(timeAgo('not a date'), '');
  });
});
