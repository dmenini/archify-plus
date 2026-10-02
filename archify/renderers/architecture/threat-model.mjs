const SEVERITY_RANK = { low: 1, medium: 2, high: 3 };

function worstSeverityOf(rows) {
  let worst = null;
  for (const row of rows || []) {
    if (!row.severity) continue;
    if (!worst || SEVERITY_RANK[row.severity] > SEVERITY_RANK[worst]) worst = row.severity;
  }
  return worst;
}

export function resolveCrossingAttributes(crossings, connections) {
  const byEdgeKey = new Map();

  for (const crossing of crossings || []) {
    const severity = worstSeverityOf(crossing.rows);
    for (const [from, to] of crossing.members?.edges || []) {
      const key = `${from}>${to}`;
      const existing = byEdgeKey.get(key) || { ids: [], severity: null };
      existing.ids.push(crossing.id);
      if (severity && (!existing.severity || SEVERITY_RANK[severity] > SEVERITY_RANK[existing.severity])) {
        existing.severity = severity;
      }
      byEdgeKey.set(key, existing);
    }
  }

  const resolved = new Map();
  for (const connection of connections || []) {
    const key = `${connection.from}>${connection.to}`;
    if (byEdgeKey.has(key)) resolved.set(key, byEdgeKey.get(key));
  }
  return resolved;
}
