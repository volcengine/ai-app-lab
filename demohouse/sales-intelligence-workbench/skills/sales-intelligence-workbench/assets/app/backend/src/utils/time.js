export function nowIso() {
  return new Date().toISOString();
}

export function nowLabel() {
  return "刚刚";
}

export function isoFromLocal(value) {
  if (!value || value === "尚未运行" || value === "刚刚") return null;
  const normalized = String(value).replace(" ", "T");
  const date = new Date(`${normalized}:00+08:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
