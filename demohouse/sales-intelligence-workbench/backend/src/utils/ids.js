let requestCounter = 0;
let entityCounter = 0;

export function makeRequestId() {
  requestCounter += 1;
  return `req_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}_${String(requestCounter).padStart(6, "0")}`;
}

export function makeId(prefix) {
  entityCounter += 1;
  return `${prefix}_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}_${String(entityCounter).padStart(6, "0")}`;
}
