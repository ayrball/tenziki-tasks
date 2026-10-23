import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareTasks,
  groupByList,
  isCrowded,
  nextBarColor,
  planGuestImport,
  planMove,
  positionForIndex,
  seedLists,
  spreadPositions,
  taskPosition,
} from '../../src/lib/lists.js';

const task = (id, extra = {}) => ({ id, list_id: 'a', completed: false, position: 0, created_at: '2026-01-01T00:00:00.000Z', ...extra });
const order = (tasks) => [...tasks].sort(compareTasks).map((t) => t.id);

describe('taskPosition / compareTasks', () => {
  it('uses the saved position, and falls back to newest-first for older tasks', () => {
    assert.equal(taskPosition({ position: 5 }), 5);
    const older = taskPosition({ created_at: '2026-01-01T00:00:00Z' });
    const newer = taskPosition({ created_at: '2026-06-01T00:00:00Z' });
    assert.ok(newer < older, 'newer sorts nearer the top');
    assert.ok(Number.isFinite(taskPosition({})));
  });

  it('puts open tasks before completed ones, then by position, then newest first', () => {
    const tasks = [
      task('done-top', { completed: true, position: 1 }),
      task('open-b', { position: 20 }),
      task('open-a', { position: 10 }),
      task('tie-old', { position: 30, created_at: '2026-01-01T00:00:00Z' }),
      task('tie-new', { position: 30, created_at: '2026-02-01T00:00:00Z' }),
    ];
    assert.deepEqual(order(tasks), ['open-a', 'open-b', 'tie-new', 'tie-old', 'done-top']);
  });
});

describe('positionForIndex', () => {
  it('handles an empty bar, the top, the bottom and the middle', () => {
    assert.ok(positionForIndex([], 0, 2000000) < 0, 'empty bar uses the same newest-first scale as new tasks');
    assert.ok(positionForIndex([10, 20], 0) < 10);
    assert.ok(positionForIndex([10, 20], 2) > 20);
    assert.equal(positionForIndex([10, 20], 1), 15);
    assert.equal(positionForIndex([10, 20, 40], 2), 30);
  });

  it('flags positions that have run out of room', () => {
    assert.equal(isCrowded([10, 20], 1, 15), false);
    assert.equal(isCrowded([10, 10.0000001], 1, 10.00000005), true);
    assert.equal(isCrowded([], 0, 1), false);
  });

  it('can split the same gap many times before running out of room', () => {
    let hi = 1024;
    let splits = 0;
    while (splits < 200) {
      const mid = positionForIndex([0, hi], 1);
      if (isCrowded([0, hi], 1, mid)) break;
      hi = mid; // keep squeezing a task in right next to the one before
      splits += 1;
    }
    assert.ok(splits >= 20 && splits < 200, `ran out of room after ${splits} splits`);
  });
});

describe('planMove', () => {
  const bar = (...specs) => specs.map(([id, position, extra]) => task(id, { position, ...extra }));

  it('moves to the top of a bar by default', () => {
    const tasks = [...bar(['x', 5, { list_id: 'a' }]), ...bar(['p', 10, { list_id: 'b' }], ['q', 20, { list_id: 'b' }])];
    const plan = planMove(tasks, 'x', 'b');
    assert.equal(plan.list_id, 'b');
    assert.ok(plan.position < 10);
    assert.equal(plan.rebalance, null);
  });

  it('places a task between two others (before / after)', () => {
    const tasks = [...bar(['x', 5, { list_id: 'a' }]), ...bar(['p', 10, { list_id: 'b' }], ['q', 20, { list_id: 'b' }], ['r', 30, { list_id: 'b' }])];
    assert.equal(planMove(tasks, 'x', 'b', { beforeId: 'q' }).position, 15);
    assert.equal(planMove(tasks, 'x', 'b', { afterId: 'q' }).position, 25);
    assert.ok(planMove(tasks, 'x', 'b', { atEnd: true }).position > 30);
    assert.ok(planMove(tasks, 'x', 'b', { afterId: 'r' }).position > 30);
  });

  it('reordering inside one bar ignores the task being moved', () => {
    const tasks = bar(['a1', 10], ['a2', 20], ['a3', 30]);
    // drag a1 to just after a2
    const plan = planMove(tasks, 'a1', 'a', { afterId: 'a2' });
    assert.equal(plan.position, 25);
    const moved = tasks.map((t) => (t.id === 'a1' ? { ...t, position: plan.position } : t));
    assert.deepEqual(order(moved), ['a2', 'a1', 'a3']);
  });

  it('lands in the right place for every drop position in a bar', () => {
    const tasks = bar(['a', 10], ['b', 20], ['c', 30], ['d', 40]);
    for (const movingId of ['a', 'b', 'c', 'd']) {
      const others = order(tasks).filter((id) => id !== movingId);
      for (let i = 0; i <= others.length; i++) {
        const target = i === 0 ? { beforeId: others[0] } : { afterId: others[i - 1] };
        const plan = planMove(tasks, movingId, 'a', target);
        const result = order(tasks.map((t) => (t.id === movingId ? { ...t, position: plan.position } : t)));
        const expected = [...others];
        expected.splice(i, 0, movingId);
        assert.deepEqual(result, expected, `move ${movingId} to index ${i}`);
      }
    }
  });

  it('never lets an open task jump above/below the open-completed split', () => {
    const tasks = bar(['o1', 10], ['o2', 20], ['c1', 5, { completed: true }], ['c2', 6, { completed: true }], ['x', 99, { list_id: 'z' }]);
    // an open task dropped next to a completed one goes to the end of the open ones
    const plan = planMove(tasks, 'x', 'a', { afterId: 'c1' });
    const result = order(tasks.map((t) => (t.id === 'x' ? { ...t, list_id: 'a', position: plan.position } : t)));
    assert.deepEqual(result, ['o1', 'o2', 'x', 'c1', 'c2']);
    // a completed task dropped next to an open one goes to the start of the completed ones
    const plan2 = planMove(tasks, 'c2', 'a', { beforeId: 'o1' });
    const result2 = order(tasks.filter((t) => t.id !== 'x').map((t) => (t.id === 'c2' ? { ...t, position: plan2.position } : t)));
    assert.deepEqual(result2, ['o1', 'o2', 'c2', 'c1']);
  });

  it('ignores Deleted tasks as neighbours', () => {
    const tasks = bar(['x', 1, { list_id: 'z' }], ['p', 10], ['gone', 15, { deleted_at: 'yesterday' }], ['q', 20]);
    assert.equal(planMove(tasks, 'x', 'a', { afterId: 'p' }).position, 15, 'between p and q, not squeezed by the deleted task');
  });

  it('renumbers the bar when two tasks have run out of room', () => {
    const tasks = [...bar(['x', 1, { list_id: 'z' }]), ...bar(['p', 10], ['q', 10.0000001])];
    const plan = planMove(tasks, 'x', 'a', { afterId: 'p' });
    assert.ok(plan.rebalance, 'asks for a renumber');
    assert.deepEqual(plan.rebalance.map((m) => m.id), ['p', 'x', 'q'], 'in the order the user dropped them');
    assert.deepEqual(plan.rebalance.map((m) => m.position), [1024, 2048, 3072]);
  });

  it('returns null for an unknown task', () => {
    assert.equal(planMove([], 'nope', 'a'), null);
  });
});

describe('spreadPositions', () => {
  it('spaces ids evenly in order', () => {
    assert.deepEqual(spreadPositions(['a', 'b']), [{ id: 'a', position: 1024 }, { id: 'b', position: 2048 }]);
  });
});

describe('groupByList', () => {
  const lists = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  it('groups in bar order, keeps empty bars, and sends strays to the first bar', () => {
    const groups = groupByList([task('1', { list_id: 'b' }), task('2', { list_id: 'a' }), task('3', { list_id: 'gone' }), task('4', { list_id: 'b' })], lists);
    assert.deepEqual(groups.map((g) => [g.list.id, g.tasks.map((t) => t.id)]), [['a', ['2', '3']], ['b', ['1', '4']], ['c', []]]);
  });
  it('copes with no bars', () => {
    assert.deepEqual(groupByList([task('1')], []), []);
  });
});

describe('seedLists', () => {
  it('creates the four standard bars and files tasks by their old category', () => {
    const { lists, tasks } = seedLists([task('1', { category: 'Work', list_id: undefined }), task('2', { category: 'Fitness', list_id: undefined })]);
    assert.deepEqual(lists.map((l) => l.name), ['Personal', 'Work', 'Fitness', 'Ideas']);
    const nameOf = (id) => lists.find((l) => l.id === tasks.find((t) => t.id === id).list_id).name;
    assert.equal(nameOf('1'), 'Work');
    assert.equal(nameOf('2'), 'Fitness');
  });

  it('adds a bar for any extra category in use, and puts unknown categories in the first bar', () => {
    const { lists, tasks } = seedLists([task('1', { category: 'Reading', list_id: undefined }), task('2', { category: '', list_id: undefined })]);
    assert.ok(lists.some((l) => l.name === 'Reading'));
    assert.equal(tasks.find((t) => t.id === '2').list_id, lists[0].id);
  });

  it('keeps tasks that already have a valid bar', () => {
    const first = seedLists([]).lists[1].id;
    const { tasks } = seedLists([task('1', { list_id: first, category: 'Ideas' })]);
    assert.equal(tasks[0].list_id, first);
  });
});

describe('planGuestImport', () => {
  const account = [{ id: 'srv-personal', name: 'Personal' }, { id: 'srv-work', name: 'Work' }];
  it('matches bars by name (ignoring case) and creates the ones the account lacks', () => {
    const guest = [{ id: 'local-personal', name: 'personal' }, { id: 'local-reading', name: 'Reading' }];
    const { idMap, toCreate } = planGuestImport(guest, account);
    assert.equal(idMap.get('local-personal'), 'srv-personal');
    assert.deepEqual(toCreate.map((l) => l.name), ['Reading']);
    assert.equal(idMap.get('local-reading'), 'local-reading');
  });

  it('puts tasks in the first account bar when there is no room for more bars', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, name: `Bar ${i}` }));
    const { idMap, toCreate } = planGuestImport([{ id: 'g1', name: 'Brand new' }], many);
    assert.equal(toCreate.length, 0);
    assert.equal(idMap.get('g1'), 's0');
  });

  it('does not create the same bar twice', () => {
    const { toCreate } = planGuestImport([{ id: 'g1', name: 'Same' }, { id: 'g2', name: 'same' }], account);
    assert.equal(toCreate.length, 1);
  });
});

describe('nextBarColor', () => {
  it('picks a colour no bar uses yet, then cycles', () => {
    assert.equal(nextBarColor([{ color: 'sky' }, { color: 'violet' }]), 'emerald');
    const all = ['sky', 'violet', 'emerald', 'amber', 'rose', 'pink', 'teal', 'orange', 'indigo', 'slate'].map((color) => ({ color }));
    assert.ok(typeof nextBarColor(all) === 'string');
  });
});
