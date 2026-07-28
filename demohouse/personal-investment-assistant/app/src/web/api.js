async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.error?.message || `请求失败 (${response.status})`);
    error.code = body?.error?.code || 'REQUEST_FAILED';
    error.details = body?.error?.details;
    throw error;
  }
  return body;
}

export const api = {
  meta: () => request('/api/meta'),
  stocks: () => request('/api/stocks'),
  createStock: (input) => request('/api/stocks', { method: 'POST', body: JSON.stringify(input) }),
  updateStock: (id, input) => request(`/api/stocks/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteStock: (id) => request(`/api/stocks/${id}`, { method: 'DELETE' }),
  latestReport: (stockId, type) => request(`/api/reports/latest?stock_id=${stockId}&type=${type}`),
  reportHistory: (stockId, type) => request(`/api/reports/history?stock_id=${stockId}&type=${type}`),
  generateReport: (stockId, type) => request('/api/reports/generate', {
    method: 'POST',
    body: JSON.stringify({ stock_id: stockId, type }),
  }),
  monitorStatus: () => request('/api/monitor/status'),
  monitorSettings: (stockId) => request(`/api/monitor/settings/${stockId}`),
  monitorRuns: (stockId) => request(`/api/monitor/runs/${stockId}?limit=8`),
  saveMonitorSettings: (stockId, input) => request(`/api/monitor/settings/${stockId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  }),
};
