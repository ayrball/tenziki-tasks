import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildExport } from '../../src/lib/exportTasks.js';
import { MAX_LISTS_PER_USER, MAX_TASKS_PER_USER, SESSION_TTL_DAYS, TRASH_RETENTION_DAYS } from '../../src/lib/limits.js';

const lists = [
  { id: 'bar-work', name: 'Work', color: 'violet' },
  { id: 'bar-home', name: 'Home', color: 'sky' },
];

describe('buildExport', () => {
  it('includes every task, deleted ones too, with only the user-facing fields', () => {
    const out = buildExport(
      [
        {
          id: '1',
          title: 'A',
          description: undefined,
          completed: 1,
          priority: 'high',
          list_id: 'bar-home',
          category: 'Legacy',
          due_date: '2026-01-02',
          created_at: 'x',
          user_id: 'secret',
          position: 12.5,
          extra: true,
        },
        { id: '2', title: 'B', completed: false, priority: 'low', list_id: 'bar-work', deleted_at: '2026-02-03T00:00:00.000Z' },
      ],
      lists,
      new Date('2026-03-04T05:06:07Z')
    );
    assert.equal(out.count, 2);
    assert.equal(out.exportedAt, '2026-03-04T05:06:07.000Z');
    assert.deepEqual(out.tasks[0], {
      id: '1',
      title: 'A',
      description: '',
      completed: true,
      priority: 'high',
      bar: 'Home',
      due_date: '2026-01-02',
      created_at: 'x',
      deleted_at: null,
    });
    assert.equal(out.tasks[1].deleted_at, '2026-02-03T00:00:00.000Z');
    assert.equal('user_id' in out.tasks[0], false, 'internal fields are not exported');
    assert.equal('position' in out.tasks[0], false);
  });

  it('exports the bars in order, and tasks name the bar they were in', () => {
    const out = buildExport([{ id: '1', title: 'A', list_id: 'bar-work' }, { id: '2', title: 'B', list_id: 'gone' }], lists);
    assert.deepEqual(out.bars, [{ name: 'Work', color: 'violet', order: 1 }, { name: 'Home', color: 'sky', order: 2 }]);
    assert.equal(out.tasks[0].bar, 'Work');
    assert.equal(out.tasks[1].bar, null, 'a task whose bar is gone is exported without one');
  });

  it('still works without any bars', () => {
    const out = buildExport([{ id: '1', title: 'A' }]);
    assert.deepEqual(out.bars, []);
    assert.equal(out.tasks[0].bar, null);
  });
});

describe('limits', () => {
  it('are sane numbers', () => {
    assert.ok(TRASH_RETENTION_DAYS > 0 && Number.isInteger(TRASH_RETENTION_DAYS));
    assert.ok(MAX_TASKS_PER_USER >= 1000);
    assert.ok(MAX_LISTS_PER_USER >= 4, 'room for at least the four starter bars');
    assert.ok(SESSION_TTL_DAYS > 0);
  });
});
