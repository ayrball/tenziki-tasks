import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DROP_TABS, acceptsDrop, dropOnTab, previousValues } from '../../src/lib/tabDrop.js';

const TODAY = '2026-10-23';
const open = (extra = {}) => ({ id: 't', completed: false, priority: 'medium', due_date: null, list_id: 'bar-a', position: 5, ...extra });

describe('which tabs accept a dropped task', () => {
  it('accepts Today, Urgent, Done and Deleted, but not All', () => {
    assert.deepEqual(DROP_TABS, ['today', 'high', 'completed', 'deleted']);
    for (const tab of DROP_TABS) assert.equal(acceptsDrop(tab), true, tab);
    for (const tab of ['all', 'nodate', 'nonsense', undefined]) assert.equal(acceptsDrop(tab), false, String(tab));
  });

  it('returns null for a tab that is not a drop target', () => {
    assert.equal(dropOnTab('all', open(), TODAY), null);
    assert.equal(dropOnTab('whatever', open(), TODAY), null);
  });
});

describe('dropping on Today', () => {
  it('sets the due date to today', () => {
    const r = dropOnTab('today', open({ due_date: '2026-12-01' }), TODAY);
    assert.deepEqual(r.updates, { due_date: TODAY });
    assert.equal(r.label, 'Due today');
  });
  it('works for a task with no date', () => {
    assert.deepEqual(dropOnTab('today', open(), TODAY).updates, { due_date: TODAY });
  });
  it('does nothing (and says so) if it is already due today', () => {
    assert.deepEqual(dropOnTab('today', open({ due_date: TODAY }), TODAY), { unchanged: 'Already due today' });
  });
  it('reopens a completed task, so it shows up in Today', () => {
    const r = dropOnTab('today', open({ completed: true, due_date: '2026-01-01' }), TODAY);
    assert.deepEqual(r.updates, { due_date: TODAY, completed: false });
    assert.equal(r.label, 'Reopened, due today');
  });
  it('reopens a completed task even if its date is already today', () => {
    const r = dropOnTab('today', open({ completed: true, due_date: TODAY }), TODAY);
    assert.deepEqual(r.updates, { due_date: TODAY, completed: false });
  });
});

describe('dropping on Urgent', () => {
  it('sets the priority to high', () => {
    assert.deepEqual(dropOnTab('high', open({ priority: 'low' }), TODAY).updates, { priority: 'high' });
    assert.equal(dropOnTab('high', open(), TODAY).label, 'Marked urgent');
  });
  it('does nothing if it is already urgent and open', () => {
    assert.deepEqual(dropOnTab('high', open({ priority: 'high' }), TODAY), { unchanged: 'Already urgent' });
  });
  it('reopens a completed task, so it shows up in Urgent', () => {
    const r = dropOnTab('high', open({ completed: true, priority: 'high' }), TODAY);
    assert.deepEqual(r.updates, { priority: 'high', completed: false });
    assert.equal(r.label, 'Reopened as urgent');
  });
});

describe('dropping on Done', () => {
  it('marks it done (never toggles)', () => {
    assert.deepEqual(dropOnTab('completed', open(), TODAY).updates, { completed: true });
  });
  it('does nothing if it is already done', () => {
    assert.deepEqual(dropOnTab('completed', open({ completed: true }), TODAY), { unchanged: 'Already done' });
  });
});

describe('dropping on Deleted', () => {
  it('moves the task to Deleted, whatever state it is in', () => {
    assert.deepEqual(dropOnTab('deleted', open(), TODAY), { action: 'delete' });
    assert.deepEqual(dropOnTab('deleted', open({ completed: true }), TODAY), { action: 'delete' });
  });
});

describe('tab drops never touch the bar or the position', () => {
  it('only ever changes due_date, priority or completed', () => {
    for (const tab of ['today', 'high', 'completed']) {
      const r = dropOnTab(tab, open({ completed: true, priority: 'low', due_date: '2020-01-01' }), TODAY);
      for (const key of Object.keys(r.updates ?? {})) assert.ok(['due_date', 'priority', 'completed'].includes(key), `${tab} changed ${key}`);
    }
  });
});

describe('previousValues', () => {
  it('captures exactly what an update would overwrite, so it can be undone', () => {
    const task = open({ priority: 'low', completed: true, due_date: '2026-01-01' });
    const { updates } = dropOnTab('high', task, TODAY);
    assert.deepEqual(previousValues(task, updates), { priority: 'low', completed: true });
    const undone = { ...task, ...updates, ...previousValues(task, updates) };
    assert.deepEqual(undone, task);
  });
});
