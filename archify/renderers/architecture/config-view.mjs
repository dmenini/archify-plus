const JS_KEYWORDS = new Set(['true', 'false', 'null', 'undefined']);
const STRING_LITERAL_RE = /'[^']*'|"[^"]*"/g;

export function extractIdentifiers(expr) {
  const withoutStringLiterals = expr.replace(STRING_LITERAL_RE, ' ');
  const matches = withoutStringLiterals.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) || [];
  const seen = new Set();
  for (const m of matches) {
    if (!JS_KEYWORDS.has(m)) seen.add(m);
  }
  return [...seen];
}

export function compileExpr(expr, knownIds) {
  const unknown = extractIdentifiers(expr).filter((id) => !knownIds.has(id));
  if (unknown.length > 0) {
    throw new Error(`Unknown identifier(s) in expression "${expr}": ${unknown.join(', ')}`);
  }
  // Trusted, hand-authored specs only — never end-user input.
  // eslint-disable-next-line no-new-func
  return new Function('state', `with (state) { return (${expr}); }`);
}

export function evaluateSpec(spec, fieldValues) {
  const declaredIds = new Set([
    ...spec.fields.map((f) => f.id),
    ...(spec.derived || []).map((d) => d.id),
  ]);

  const state = { ...fieldValues };
  for (const d of spec.derived || []) {
    const fn = compileExpr(d.expr, declaredIds);
    state[d.id] = !!fn(state);
  }

  const hiddenNodes = new Set();
  const attnNodes = new Set();
  const hiddenEdges = new Set();
  const attnEdges = new Set();
  const setText = {};

  for (const rule of spec.rules || []) {
    const fn = compileExpr(rule.when, declaredIds);
    if (!fn(state)) continue;
    for (const id of rule.hide?.nodes || []) hiddenNodes.add(id);
    for (const [a, b] of rule.hide?.edges || []) hiddenEdges.add(`${a}>${b}`);
    for (const id of rule.attn?.nodes || []) attnNodes.add(id);
    for (const [a, b] of rule.attn?.edges || []) attnEdges.add(`${a}>${b}`);
    for (const [nodeId, patch] of Object.entries(rule.setText || {})) {
      setText[nodeId] = { ...(setText[nodeId] || {}), ...patch };
    }
  }

  const warnings = [];
  const order = { danger: 0, warn: 1, info: 2 };
  for (const w of spec.warnings || []) {
    const fn = compileExpr(w.when, declaredIds);
    if (fn(state)) warnings.push(w);
  }
  warnings.sort((a, b) => order[a.level] - order[b.level]);

  return { state, hiddenNodes, attnNodes, hiddenEdges, attnEdges, setText, warnings };
}

export function defaultFieldValues(spec) {
  const values = {};
  for (const f of spec.fields) {
    values[f.id] = f.type === 'checkbox' ? !!f.default : f.default ?? f.options?.[0]?.value;
  }
  return values;
}

function collectReferencedIds(spec) {
  const nodeIds = new Set();
  const edgeIds = new Set();
  for (const rule of spec.rules || []) {
    for (const id of rule.hide?.nodes || []) nodeIds.add(id);
    for (const id of rule.attn?.nodes || []) nodeIds.add(id);
    for (const [a, b] of rule.hide?.edges || []) edgeIds.add(`${a}>${b}`);
    for (const [a, b] of rule.attn?.edges || []) edgeIds.add(`${a}>${b}`);
    for (const nodeId of Object.keys(rule.setText || {})) nodeIds.add(nodeId);
  }
  return { nodeIds, edgeIds };
}

export function validateConfigView(spec, realNodeIds, realEdgeKeys) {
  // Catch at generation time what the schema should already reject, in case
  // a future caller ever constructs the spec object directly rather than
  // through JSON-schema validation.
  for (const f of spec.fields) {
    if (f.type !== 'select') continue;
    if (!f.options || f.options.length === 0) {
      throw new Error(`meta.configView field "${f.id}" has type "select" but no options`);
    }
    if (f.default !== undefined && !f.options.some((o) => o.value === f.default)) {
      const validValues = f.options.map((o) => o.value).join(', ');
      throw new Error(
        `meta.configView field "${f.id}" has default ${JSON.stringify(f.default)} which does not match any of its options' values: ${validValues}`
      );
    }
  }

  // Exercises every declared expression exactly like evaluateSpec would,
  // regardless of whether its branch is truthy for these defaults — this is
  // what catches an undeclared identifier at generation time rather than in
  // a future browser session with a different toggle combination.
  evaluateSpec(spec, defaultFieldValues(spec));

  const { nodeIds, edgeIds } = collectReferencedIds(spec);
  const unknownNodes = [...nodeIds].filter((id) => !realNodeIds.has(id));
  const unknownEdges = [...edgeIds].filter((key) => !realEdgeKeys.has(key));
  if (unknownNodes.length || unknownEdges.length) {
    const parts = [];
    if (unknownNodes.length) parts.push(`unknown node ids: ${unknownNodes.join(', ')}`);
    if (unknownEdges.length) parts.push(`unknown edges: ${unknownEdges.map((k) => k.replace('>', ' -> ')).join(', ')}`);
    throw new Error(`meta.configView references ids not present in this diagram — ${parts.join('; ')}`);
  }
}
