// Removal belongs to the logical point, never to its source photos.
export const activePoints = (points = []) => points.filter((point) => !point.removed);

export const setPointRemoved = (points, id, removed) => points.map((point) =>
  point.id === id ? { ...point, removed } : point);

// Store the accepted category sequence in the recovery manifest. Badges may
// change with the active set; these slots only change on explicit regrouping.
export function establishReviewSlots(points, grouped) {
  const slots = new Map([
    ['main', grouped.main], ['reserve', grouped.reserve], ['review', grouped.unresolved],
  ].flatMap(([section, items]) => items.map((point) => [point.id, section])));
  let position = 0;
  const order = new Map(['main', 'reserve', 'review'].flatMap((section) =>
    points.filter((point) => slots.get(point.id) === section)
      .map((point) => [point.id, { reviewSection: section, reviewSlot: position++ }])));
  return points.map((point) => ({ ...point, ...(order.get(point.id) || {}) }));
}

export function reviewSections(points, grouped) {
  const derived = new Map([...grouped.main, ...grouped.reserve, ...grouped.unresolved]
    .map((point) => [point.id, point]));
  return [
    ['main', 'Основные'], ['reserve', 'Резерв'], ['review', 'Требует проверки'],
  ].map(([key, title]) => ({ key, title, count: (key === 'review' ? grouped.unresolved : grouped[key]).length,
    items: points.filter((point) => point.reviewSection === key)
      .sort((a, b) => a.reviewSlot - b.reviewSlot)
      .map((point) => derived.get(point.id) || point),
  })).filter((section) => section.items.length);
}
