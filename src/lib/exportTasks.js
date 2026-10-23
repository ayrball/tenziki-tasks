// Lets people take their data with them: downloads every task (including Deleted ones) and their bars as a JSON file.

export function buildExport(tasks, lists = [], now = new Date()) {
  const barName = new Map(lists.map((l) => [l.id, l.name]));
  return {
    app: 'Tenziki Tasks',
    exportedAt: now.toISOString(),
    count: tasks.length,
    bars: lists.map((l, i) => ({ name: l.name, color: l.color, order: i + 1 })),
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description || '',
      completed: Boolean(t.completed),
      priority: t.priority,
      bar: barName.get(t.list_id) ?? null,
      due_date: t.due_date || null,
      created_at: t.created_at || null,
      deleted_at: t.deleted_at || null,
    })),
  };
}

export function downloadTasksJson(tasks, lists = []) {
  const now = new Date();
  const blob = new Blob([JSON.stringify(buildExport(tasks, lists, now), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `tenziki-tasks-${now.toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
