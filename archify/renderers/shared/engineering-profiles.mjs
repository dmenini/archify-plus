import { throwDiagnosticError } from './diagnostics.mjs';

const DEPLOYMENT_PROFILE = 'deployment-ownership';
const DEPLOYMENT_BOUNDARY_KINDS = new Set(['region', 'security-group']);
const PRIVATE_STATE_TYPES = new Set(['database']);

const THREAT_MODEL_PROFILE = 'threat-model';

function subject(collection, index, item = {}) {
  return {
    diagramType: 'architecture',
    profile: DEPLOYMENT_PROFILE,
    collection,
    index,
    ...(item.id ? { id: item.id } : {}),
  };
}

function membership(boundaries, componentId, kind) {
  return boundaries
    .map((boundary, index) => ({ boundary, index }))
    .filter(({ boundary }) => boundary.kind === kind && boundary.wraps.includes(componentId));
}

export function deploymentOwnershipDiagnostics(diagram) {
  const components = Array.isArray(diagram.components) ? diagram.components : [];
  const boundaries = (Array.isArray(diagram.boundaries) ? diagram.boundaries : [])
    .map((boundary) => ({ ...boundary, wraps: Array.isArray(boundary.wraps) ? boundary.wraps : [] }));
  const connections = Array.isArray(diagram.connections) ? diagram.connections : [];
  const diagnostics = [];

  for (const kind of DEPLOYMENT_BOUNDARY_KINDS) {
    const count = boundaries.filter((boundary) => boundary.kind === kind).length;
    if (count > 0) continue;
    diagnostics.push({
      code: 'engineering/deployment-boundary-kind',
      severity: 'error',
      message: `Deployment ownership requires at least one ${kind} boundary.`,
      subject: subject('boundaries', -1),
      evidence: { requiredKind: kind, found: count },
      supportedFixes: [`add one ${kind} boundary with an explicit wraps list`],
    });
  }

  components.forEach((component, index) => {
    if (component.type === 'external') return;
    if (typeof component.tag !== 'string' || component.tag.trim() === '') {
      diagnostics.push({
        code: 'engineering/deployment-owner-missing',
        severity: 'error',
        message: `Deployment component ${JSON.stringify(component.id)} does not name its owner in tag.`,
        subject: subject('components', index, component),
        evidence: { componentType: component.type, ownerField: 'tag' },
        supportedFixes: [`set /components/${index}/tag to the responsible team or owner`],
      });
    }

    const regions = membership(boundaries, component.id, 'region');
    if (regions.length === 0) {
      diagnostics.push({
        code: 'engineering/deployment-region-scope',
        severity: 'error',
        message: `Deployment component ${JSON.stringify(component.id)} is not assigned to a region boundary.`,
        subject: subject('components', index, component),
        evidence: { componentType: component.type, regionMemberships: 0 },
        supportedFixes: ['add the component id to the real region boundary wraps list'],
      });
    } else if (regions.length > 1) {
      diagnostics.push({
        code: 'engineering/deployment-region-ambiguous',
        severity: 'error',
        message: `Deployment component ${JSON.stringify(component.id)} belongs to more than one region boundary.`,
        subject: subject('components', index, component),
        evidence: {
          componentType: component.type,
          regions: regions.map(({ boundary, index: boundaryIndex }) => ({ boundaryIndex, label: boundary.label })),
        },
        supportedFixes: ['keep the component id in exactly one real region boundary wraps list'],
      });
    }

    if (PRIVATE_STATE_TYPES.has(component.type)) {
      const privateScopes = membership(boundaries, component.id, 'security-group');
      if (privateScopes.length === 0) {
        diagnostics.push({
          code: 'engineering/deployment-private-state',
          severity: 'error',
          message: `Stateful component ${JSON.stringify(component.id)} is not assigned to a private security-group boundary.`,
          subject: subject('components', index, component),
          evidence: { componentType: component.type, privateMemberships: 0 },
          supportedFixes: ['add the component id to the real private security-group boundary wraps list'],
        });
      }
    }
  });

  boundaries.forEach((boundary, index) => {
    if (boundary.kind !== 'security-group') return;
    const members = boundary.wraps.map((id) => ({
      id,
      regions: membership(boundaries, id, 'region').map(({ boundary: region, index: boundaryIndex }) => ({
        boundaryIndex,
        label: region.label,
      })),
    }));
    const regionIndexes = new Set(members.flatMap((member) => member.regions.map((region) => region.boundaryIndex)));
    const consistent = members.length > 0
      && members.every((member) => member.regions.length === 1)
      && regionIndexes.size === 1;
    if (consistent) return;
    diagnostics.push({
      code: 'engineering/deployment-private-region-consistency',
      severity: 'error',
      message: `Private boundary ${JSON.stringify(boundary.label)} must contain components from exactly one shared region.`,
      subject: subject('boundaries', index, boundary),
      evidence: { boundaryKind: boundary.kind, members },
      supportedFixes: ['assign every private-boundary component to exactly one shared region boundary'],
    });
  });

  connections.forEach((connection, index) => {
    const crossedBoundaries = boundaries
      .map((boundary, boundaryIndex) => ({
        boundaryIndex,
        kind: boundary.kind,
        label: boundary.label,
        fromInside: boundary.wraps.includes(connection.from),
        toInside: boundary.wraps.includes(connection.to),
      }))
      .filter((boundary) => DEPLOYMENT_BOUNDARY_KINDS.has(boundary.kind) && boundary.fromInside !== boundary.toInside);
    if (crossedBoundaries.length === 0 || (typeof connection.label === 'string' && connection.label.trim() !== '')) return;
    diagnostics.push({
      code: 'engineering/deployment-crossing-mechanism',
      severity: 'error',
      message: `Cross-boundary connection ${JSON.stringify(connection.id || `${connection.from}->${connection.to}`)} does not name its mechanism.`,
      subject: subject('connections', index, connection),
      evidence: {
        from: connection.from,
        to: connection.to,
        crossedBoundaries: crossedBoundaries.map(({ boundaryIndex, kind, label }) => ({ boundaryIndex, kind, label })),
      },
      supportedFixes: [`set /connections/${index}/label to the real cross-boundary mechanism`],
    });
  });

  return diagnostics;
}

function threatModelSubject(collection, index, item = {}) {
  return {
    diagramType: 'architecture',
    profile: THREAT_MODEL_PROFILE,
    collection,
    index,
    ...(item.id ? { id: item.id } : {}),
  };
}

export function threatModelDiagnostics(diagram) {
  const crossings = Array.isArray(diagram.crossings) ? diagram.crossings : [];
  const componentIds = new Set((Array.isArray(diagram.components) ? diagram.components : []).map((c) => c.id));
  const edgeKeys = new Set((Array.isArray(diagram.connections) ? diagram.connections : [])
    .map((c) => `${c.from}>${c.to}`));
  const diagnostics = [];

  if (crossings.length === 0) {
    diagnostics.push({
      code: 'engineering/threat-model-no-crossings',
      severity: 'error',
      message: 'Threat model requires at least one entry in crossings.',
      subject: threatModelSubject('crossings', -1),
      evidence: { found: 0 },
      supportedFixes: ['add one crossings entry with real membership and at least one STRIDE row'],
    });
  }

  const seenIds = new Map();
  crossings.forEach((crossing, index) => {
    if (seenIds.has(crossing.id)) {
      diagnostics.push({
        code: 'engineering/threat-model-duplicate-id',
        severity: 'error',
        message: `Crossing id ${JSON.stringify(crossing.id)} is used more than once.`,
        subject: threatModelSubject('crossings', index, crossing),
        evidence: { duplicateOfIndex: seenIds.get(crossing.id) },
        supportedFixes: [`set /crossings/${index}/id to a unique value`],
      });
    } else {
      seenIds.set(crossing.id, index);
    }

    const nodes = crossing.members?.nodes || [];
    const edges = crossing.members?.edges || [];
    const unknownNodes = nodes.filter((id) => !componentIds.has(id));
    const unknownEdges = edges.filter(([from, to]) => !edgeKeys.has(`${from}>${to}`));
    if (unknownNodes.length || unknownEdges.length) {
      diagnostics.push({
        code: 'engineering/threat-model-unknown-member',
        severity: 'error',
        message: `Crossing ${JSON.stringify(crossing.id)} references ids not present in this diagram.`,
        subject: threatModelSubject('crossings', index, crossing),
        evidence: { unknownNodes, unknownEdges: unknownEdges.map(([from, to]) => `${from}>${to}`) },
        supportedFixes: [`fix /crossings/${index}/members to reference only real component ids and real [from,to] connection pairs`],
      });
    }
  });

  return diagnostics;
}

export function validateEngineeringProfile(diagramType, diagram) {
  const profile = diagram.meta?.engineering_profile;
  if (!profile || diagramType !== 'architecture') return;
  let diagnostics;
  if (profile === DEPLOYMENT_PROFILE) diagnostics = deploymentOwnershipDiagnostics(diagram);
  else if (profile === THREAT_MODEL_PROFILE) diagnostics = threatModelDiagnostics(diagram);
  else return;
  if (!diagnostics.length) return;
  throwDiagnosticError(
    `Engineering profile ${JSON.stringify(profile)} failed:\n${diagnostics.map((entry) => `- ${entry.message}`).join('\n')}`,
    diagnostics,
  );
}
