function evidenceIds(value) {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))]
    : [];
}

export function preferenceKey(value) {
  return String(value || '').replace(/\s+/g, '').trim();
}

export function canonicalSecurityCode(value) {
  const compact = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  const withoutVenuePrefix = compact.replace(/^(?:NASDAQ|NYSE|AMEX)[:.]/i, '');
  const withoutSuffix = withoutVenuePrefix.replace(
    /\.(?:SH|SZ|BJ|HK|US|OQ|O|N|NYS|NASDAQ|NYSE|AMEX)$/i,
    '',
  );
  const withoutPrefix = withoutSuffix.replace(/^(?:SH|SZ|BJ|HK)(?=\d)/, '');
  return /^\d+$/.test(withoutPrefix)
    ? withoutPrefix.replace(/^0+(?=\d)/, '')
    : withoutPrefix;
}

function sameIds(left, right) {
  if (left.length !== right.length) return false;
  const expected = new Set(right);
  return left.every((item) => expected.has(item));
}

function assertKnownEvidence(label, ids, knownEvidenceIds) {
  const unknown = ids.filter((id) => !knownEvidenceIds.has(id));
  if (unknown.length) {
    throw new Error(`${label} 引用了不存在的来源：${unknown.join('、')}`);
  }
}

export function assertPreferenceCoverage(coverage, preference, knownEvidenceIds) {
  if (!coverage || preferenceKey(coverage.preference) !== preferenceKey(preference)) {
    throw new Error(`没有记录用户偏好“${preference}”的覆盖状态。`);
  }
  if (!['covered', 'partial', 'watch'].includes(coverage.status)) {
    throw new Error(`用户偏好“${preference}”的覆盖状态无效：${coverage.status || '缺失'}。`);
  }

  const parentIds = evidenceIds(coverage.evidence_ids);
  assertKnownEvidence(`用户偏好“${preference}”`, parentIds, knownEvidenceIds);
  const facets = Array.isArray(coverage.facets) ? coverage.facets : [];

  if (!facets.length) {
    if (coverage.status === 'partial') {
      throw new Error(`用户偏好“${preference}”标记为部分覆盖，但没有子主题明细。`);
    }
    if (coverage.status === 'covered' && !parentIds.length) {
      throw new Error(`用户偏好“${preference}”标记为已覆盖，但没有有效来源。`);
    }
    if (coverage.status === 'watch' && parentIds.length) {
      throw new Error(`用户偏好“${preference}”标记为待观察，但仍绑定了来源。`);
    }
    return;
  }

  if (facets.length < 2) {
    throw new Error(`复合偏好“${preference}”的子主题数量不足。`);
  }
  const facetNames = facets.map((facet) => String(facet?.preference || '').trim());
  if (facetNames.some((name) => !name) || new Set(facetNames).size !== facetNames.length) {
    throw new Error(`复合偏好“${preference}”包含缺失或重复的子主题。`);
  }

  const coveredFacetIds = [];
  let coveredCount = 0;
  let watchCount = 0;
  for (const facet of facets) {
    if (!['covered', 'watch'].includes(facet.status)) {
      throw new Error(`复合偏好“${preference}”的子主题“${facet.preference}”状态无效。`);
    }
    const facetIds = evidenceIds(facet.evidence_ids);
    assertKnownEvidence(
      `复合偏好“${preference}”的子主题“${facet.preference}”`,
      facetIds,
      knownEvidenceIds,
    );
    if (facet.status === 'covered') {
      coveredCount += 1;
      if (!facetIds.length) {
        throw new Error(`复合偏好“${preference}”的子主题“${facet.preference}”没有有效来源。`);
      }
      coveredFacetIds.push(...facetIds);
    } else {
      watchCount += 1;
      if (facetIds.length) {
        throw new Error(`复合偏好“${preference}”的待观察子主题“${facet.preference}”仍绑定了来源。`);
      }
    }
  }

  const expectedStatus = coveredCount === facets.length
    ? 'covered'
    : watchCount === facets.length ? 'watch' : 'partial';
  if (coverage.status !== expectedStatus) {
    throw new Error(
      `复合偏好“${preference}”的汇总状态应为 ${expectedStatus}，实际为 ${coverage.status}。`,
    );
  }
  const expectedParentIds = evidenceIds(coveredFacetIds);
  if (!sameIds(parentIds, expectedParentIds)) {
    throw new Error(`复合偏好“${preference}”的汇总来源与已覆盖子主题不一致。`);
  }
}

export function assertReportSourcePolicy(item, expectedType) {
  const evidence = item?.report?.evidence || [];
  const types = new Set(evidence.map((entry) => entry.type));
  if (!types.has('datapro')) {
    throw new Error(`${expectedType} 报告没有包含可核验的 DataPro 证据。`);
  }
  const marketData = evidence.filter((entry) => (
    entry.type === 'datapro'
      && (entry.rows || []).some((row) => Object.keys(row).some((field) => (
        /^(?:最新价|收盘价|前收盘价|开盘价|最高价|最低价|涨跌幅|涨幅|成交量|总成交量|open|high|low|close|volume)$/i.test(field)
      )))
  ));
  if (!marketData.length) {
    throw new Error(`${expectedType} 报告没有包含可核验的最新行情 DataPro 证据。`);
  }
  if (types.has('web_search')) return;
  if (expectedType === 'brief') {
    throw new Error('brief 报告没有包含与正文对应的联网搜索证据。');
  }

  const webStatus = item?.provider_status?.web_search || {};
  if (webStatus.ok !== true || Number(webStatus.successful_query_count || 0) < 1) {
    throw new Error('monitor 报告没有联网来源，且无法证明本轮联网搜索成功执行。');
  }
  if (!['initial', 'no_material_change'].includes(item?.change_status)) {
    throw new Error('monitor 报告没有联网来源，却被标记为存在新增证据。');
  }
  if (item?.report?.analysis?.risk_level !== 'unknown') {
    throw new Error('monitor 报告没有联网风险证据，却给出了确定风险等级。');
  }
  const webReferences = [
    ...(item?.report?.analysis?.summary_evidence_ids || []),
    ...(item?.report?.analysis?.change_evidence_ids || []),
    ...(item?.report?.analysis?.sections || [])
      .flatMap((section) => section.claims.flatMap((claim) => claim.evidence_ids)),
    ...(item?.report?.analysis?.conclusion?.evidence_ids || []),
  ].filter((id) => String(id || '').startsWith('W'));
  if (webReferences.length) {
    throw new Error('monitor 报告正文引用了未展示的联网来源。');
  }
}
