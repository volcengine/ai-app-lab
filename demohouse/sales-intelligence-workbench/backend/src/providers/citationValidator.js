function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

export function collectCitationContext(cards = [], sources = []) {
  const cardIds = new Set(cards.map((card) => card.id).filter(Boolean));
  const sourceIds = new Set(sources.map((source) => source.id).filter(Boolean));
  return { cardIds, sourceIds };
}

export function filterCitationIds(ids, allowed) {
  return unique((ids || []).map((id) => String(id || "").trim()).filter((id) => allowed.has(id)));
}

export function hasAnyCitation(item) {
  return Boolean(item?.citation_card_ids?.length || item?.citation_source_ids?.length);
}

export function sourceLabelsForIds(sources = [], ids = []) {
  const byId = new Map(sources.map((source) => [source.id, source.label || source.url || source.id]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}
