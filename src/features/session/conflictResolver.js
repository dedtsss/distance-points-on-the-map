import { findDistanceViolations } from '../../utils/geoDistance.js';
import { isActivePhoto } from './sessionDomain.js';

const comparePhotos = (left, right, photosById) => {
  const leftNumber = Number(photosById.get(left)?.number) || Number.MAX_SAFE_INTEGER;
  const rightNumber = Number(photosById.get(right)?.number) || Number.MAX_SAFE_INTEGER;
  return leftNumber - rightNumber || String(left).localeCompare(String(right));
};

const normalizedEdges = (violations) => [...new Map((violations || []).map((violation) => {
  const ids = [String(violation.pointAId), String(violation.pointBId)].sort();
  return [`${ids[0]}:${ids[1]}`, ids];
})).values()];

const connectedComponents = (edges) => {
  const adjacency = new Map();
  edges.forEach(([left, right]) => {
    adjacency.set(left, new Set([...(adjacency.get(left) || []), right]));
    adjacency.set(right, new Set([...(adjacency.get(right) || []), left]));
  });
  const seen = new Set();
  return [...adjacency.keys()].sort().flatMap((start) => {
    if (seen.has(start)) return [];
    const stack = [start];
    const vertices = new Set();
    seen.add(start);
    while (stack.length) {
      const current = stack.pop();
      vertices.add(current);
      (adjacency.get(current) || []).forEach((neighbor) => {
        if (!seen.has(neighbor)) {
          seen.add(neighbor);
          stack.push(neighbor);
        }
      });
    }
    return [{
      vertices: [...vertices],
      edges: edges.filter(([left, right]) => vertices.has(left) && vertices.has(right)),
    }];
  });
};

const selectedKey = (selected, compare) => [...selected].sort(compare).join('|');

const exactCover = (edges, compare) => {
  let best = null;
  const visit = (remaining, selected) => {
    if (best && selected.size > best.size) return;
    if (remaining.length === 0) {
      if (!best || selected.size < best.size || (
        selected.size === best.size && selectedKey(selected, compare).localeCompare(selectedKey(best, compare)) > 0
      )) best = new Set(selected);
      return;
    }
    const degrees = new Map();
    remaining.forEach(([left, right]) => {
      degrees.set(left, (degrees.get(left) || 0) + 1);
      degrees.set(right, (degrees.get(right) || 0) + 1);
    });
    const [left, right] = [...remaining].sort((edgeA, edgeB) => (
      ((degrees.get(edgeB[0]) || 0) + (degrees.get(edgeB[1]) || 0))
        - ((degrees.get(edgeA[0]) || 0) + (degrees.get(edgeA[1]) || 0))
        || `${edgeA[0]}:${edgeA[1]}`.localeCompare(`${edgeB[0]}:${edgeB[1]}`)
    ))[0];
    [left, right].sort((a, b) => compare(b, a)).forEach((vertex) => {
      const next = new Set(selected);
      next.add(vertex);
      visit(remaining.filter(([edgeLeft, edgeRight]) => edgeLeft !== vertex && edgeRight !== vertex), next);
    });
  };
  visit(edges, new Set());
  return [...(best || [])];
};

const greedyCover = (edges, compare) => {
  let remaining = [...edges];
  const selected = [];
  while (remaining.length) {
    const degrees = new Map();
    remaining.forEach(([left, right]) => {
      degrees.set(left, (degrees.get(left) || 0) + 1);
      degrees.set(right, (degrees.get(right) || 0) + 1);
    });
    const vertex = [...degrees.keys()].sort((left, right) => (
      (degrees.get(right) - degrees.get(left)) || compare(right, left)
    ))[0];
    selected.push(vertex);
    remaining = remaining.filter(([left, right]) => left !== vertex && right !== vertex);
  }
  return selected;
};

/**
 * Computes a minimum vertex cover for ordinary-size connected components and a
 * deterministic bounded vertex-cover heuristic for unusually large batches.
 * Reserving every returned item removes every active < threshold conflict.
 */
export function recommendReserveForConflicts(photos = [], thresholdMeters = 25, options = {}) {
  const activePhotos = (photos || []).filter(isActivePhoto);
  const violations = findDistanceViolations(activePhotos, { thresholdMeters });
  const edges = normalizedEdges(violations);
  const photosById = new Map((photos || []).map((photo) => [String(photo.id), photo]));
  const compare = (left, right) => comparePhotos(left, right, photosById);
  const exactLimit = Math.max(4, Number(options.exactComponentLimit) || 22);
  const reservePhotoIds = [];
  let bounded = false;
  let componentCount = 0;

  connectedComponents(edges).forEach((component) => {
    componentCount += 1;
    if (component.vertices.length <= exactLimit) {
      reservePhotoIds.push(...exactCover(component.edges, compare));
    } else {
      bounded = true;
      reservePhotoIds.push(...greedyCover(component.edges, compare));
    }
  });

  const uniqueReservePhotoIds = [...new Set(reservePhotoIds)].sort(compare);
  return {
    thresholdMeters: Number(thresholdMeters) || 25,
    conflictCount: violations.length,
    reservePhotoIds: uniqueReservePhotoIds,
    activeAfterCount: activePhotos.length - uniqueReservePhotoIds.length,
    remainingConflictCount: 0,
    componentCount,
    strategy: bounded ? 'bounded-deterministic' : 'exact-minimum',
    message: edges.length === 0
      ? 'Конфликтов ACTIVE-точек нет.'
      : bounded
        ? 'Для крупной сети использована детерминированная bounded-рекомендация; все конфликты будут устранены.'
        : 'Найдена точная минимальная рекомендация для перевода в RESERVE.',
  };
}
