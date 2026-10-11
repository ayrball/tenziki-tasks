import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildExport } from '../../src/lib/exportTasks.js';
import { MAX_TASKS_PER_USER, SESSION_TTL_DAYS, TRASH_RETENTION_DAYS } from '../../src/lib/limits.js';

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
          category: 'Work',
          due_date: '2026-01-02',
          created_at: 'x',
          user_id: 'secret',
          extra: true,
        },
        { id: '2', title: 'B', completed: false, priority: 'low', category: 'Ideas', deleted_at: '2026-02-03T00:00:00.000Z' },
      ],
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
      category: 'Work',
      due_date: '2026-01-02',
      created_at: 'x',
      deleted_at: null,
    });
    assert.equal(out.tasks[1].deleted_at, '2026-02-03T00:00:00.000Z');
    assert.equal('user_id' in out.tasks[0], false, 'internal fields are not exported');
  });
});

describe('limits', () => {
  it('are sane numbers', () => {
    assert.ok(TRASH_RETENTION_DAYS > 0 && Number.isInteger(TRASH_RETENTION_DAYS));
    assert.ok(MAX_TASKS_PER_USER >= 1000);
    assert.ok(SESSION_TTL_DAYS > 0);
  });
});
