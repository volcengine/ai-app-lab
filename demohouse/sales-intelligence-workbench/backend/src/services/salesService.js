import { createHash } from "node:crypto";
import { createEnvReader } from "../config/runtimeEnv.js";
import { createRuntimePolicy } from "../config/runtimePolicy.js";
import { ProviderRunStore } from "../observability/providerRunStore.js";
import { PaidWorkflowGuard } from "../limits/paidWorkflowGuard.js";
import { ProviderCircuitBreaker } from "../limits/providerCircuitBreaker.js";
import {
  buildDossierAgentContext,
  DossierAgent,
  dossierSourceUsageErrors,
} from "../agents/dossierAgent.js";
import {
  deriveEvidenceDataAsOf,
  extractGroundingDates,
  extractGroundingNumbers,
  groundedTextErrors,
} from "../evidence/claimGrounding.js";
import { compileDossierEvidenceAtoms } from "../evidence/dossierEvidenceCompiler.js";
import {
  analyzeQaQuestion,
  assessQaAnswerability,
  buildDossierEvidencePack,
  buildQaEnumerationRequirements,
  buildQaEvidence,
  evidencePackCitations,
  fuseQaRetrievalContexts,
  makeDossierFingerprint,
  resolveCompanyEntity,
  validateDossierModelAnswer,
  validateProductionEvidencePack,
  validateQaModelAnswer,
} from "../evidence/salesEvidence.js";
import {
  buildMaterialSyncIdentity,
  decodeMaterialSnapshot,
  encodeMaterialSnapshot,
  makeMaterialContentHash,
  mergeSourceItems,
  normalizeSourceItems,
  renderSourceItems,
} from "../sync/materialSync.js";
import { HttpError } from "../utils/http.js";
import { makeId } from "../utils/ids.js";
import { nowIso } from "../utils/time.js";

const clone = (value) => JSON.parse(JSON.stringify(value));
const enabled = (value) => ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
const QA_SESSION_MESSAGE_PATTERN = /(?:\n|^)<!--\s*sales-workbench-qa-v1:([A-Za-z0-9+/=]+)\s*-->\s*$/;
const ASYNC_JOB_TYPES = new Set([
  "sales_dossier_generation",
  "sales_material_openviking_sync",
]);
const DOSSIER_SECTION_TITLES = Object.freeze([
  "企业与业务概览",
  "经营与业务动态",
  "近期公开动态",
  "风险与关注事项",
  "销售机会判断",
  "建议行动",
]);
const DOSSIER_INTERNAL_META_PATTERNS = Object.freeze([
  /关键(?:字段|数字).{0,20}(?:来源(?:存在)?差异|来源冲突|口径冲突)/,
  /(?:来源|口径)[^。；\n]{0,80}(?:不一致|冲突|存在差异|等级不足|一致性问题)/,
  /冲突字段|evidence_conflicts|source_selection_policy/i,
  /本次(?:未|没有)(?:检索|获取|返回|发现|查询到)/,
  /(?:专业数据集|豆包搜索|联网搜索|(?:企业)?数据库).{0,20}(?:调用成功|没有返回|未返回|可用于核验|完成核验但)/,
  /缺少(?:两个|独立).{0,10}来源/,
  /(?:资料|信息|证据)(?:仍然|依然|尚)?(?:不足|缺口|不充分|未覆盖)/,
  /(?:不作为|不写为|不将[^。；\n]{0,20}写为)(?:确定|已确认)?事实/,
  /(?:需|仍需|建议)(?:进一步|持续|交叉)?核验(?:来源|口径|日期|主体|数字)/,
  /(?:已|可)核验的(?:风险|信息|数据|来源|经营|变化|事项)/,
]);
const DOSSIER_EVIDENCE_DEBRIS_PATTERNS = Object.freeze([
  /查看详情|查看更多(?:相关)?|立即注册|免费查看|点击查看|登录后查看|打开\s*(?:APP|客户端)/i,
  /<\/?(?:table|thead|tbody|tr|th|td)\b/i,
  /(?:^|[\s：:])Untitled(?:[\s。；]|$)/i,
  /来源返回可引用信息/,
  /\b20\d{2}年\d{1,2}月\d{1,2}日\s+\d{1,2}:\d{2}\b/u,
  /(?:市场|行业|公司|商业)?资讯\s*[（(]来源[：:]/u,
  /[（(]来源[：:][^）)]{1,80}[）)]/u,
]);
const DOSSIER_LOW_VALUE_PUBLIC_SOURCE_PATTERNS = Object.freeze([
  /for better experience.{0,80}(?:verification|verify)/iu,
  /(?:complete|pass).{0,40}(?:the )?verification process/iu,
  /(?:verify you are human|captcha|access denied|robot check|security check)/iu,
  /(?:请|需要).{0,16}(?:完成|通过).{0,12}(?:人机|安全|访问|滑动)?验证/iu,
  /(?:人机验证|安全验证|访问验证|滑动验证|验证码页面|页面不存在|内容已下线)/iu,
  /(?:网站|官网|网页|站群)(?:建设|设计|制作|改版|升级)(?:案例|服务|项目|方案)?/iu,
  /(?:建站|SEO|数字营销|品牌网站).{0,24}(?:案例|服务商|公司|解决方案)/iu,
  /(?:客户案例|成功案例).{0,24}(?:网站|官网|网页|建站)/iu,
  /(?:我们|小伙伴们|项目团队).{0,32}(?:网站|官网).{0,32}(?:上线|交付|建设)/iu,
  /(?:全新|新版|品牌)?官网(?:全面)?(?:焕新|上线).{0,36}(?:网站建设|建站|网页设计)/iu,
  /(?:杀人诛心|让对方下不来台|狠狠打脸|瞬间打脸|当场傻眼|彻底慌了|坐不住了|真相曝光|惊天内幕)/iu,
]);
const DOSSIER_ACTION_TERMS = /发布|公告|披露|签署|合作|中标|招标|采购|投产|量产|扩产|建设|回购|融资|研发|推出|上线|召回|处罚|诉讼|失信|经营异常|监管|交付|供应链|营收|利润|销量|市占率/;
const DOSSIER_RISK_TERMS = /企业风险数据库|风险事项|行政处罚|司法诉讼|失信被执行|限制高消费|经营异常|监管处罚|产品召回|安全事故|供应中断|交付延期|合规整改/;
const DOSSIER_SPECIFIC_RISK_TERMS = /行政处罚|司法诉讼|失信被执行|限制高消费|经营异常|监管处罚|产品召回|安全事故|供应中断|交付延期|交付周期延长|被罚|索赔|赔偿/;
const DOSSIER_COMPANY_WIDE_INFERENCE = /(?:说明|表明|显示|可见|由此可见)[^。！？\n]{0,48}(?:订单结构|客户结构|业务结构|收入结构|采购结构|项目结构)[^。！？\n]{0,36}(?:为主|集中|分散|偏[大小高低]|单一|多元|稳定|不稳定|依赖)/u;
const DOSSIER_BUSINESS_TRAJECTORY_INFERENCE = /(?:业务|能力|产品|市场)[^。！？\n]{0,16}(?:(?:已|正)?(?:从|由)[^。！？\n]{1,36}(?:扩展|转向|升级|延伸)(?:到|至|为)|(?:布局)?(?:延伸|扩展)(?:到|至))/u;
const DOSSIER_RECENT_DEMAND_INFERENCE = /(?:采购|配套|交付|项目|资源)[^。！？\n]{0,12}(?:需求|意向)[^。！？\n]{0,20}(?:活跃|明确|形成|增加|释放|旺盛|存在)/u;
const DOSSIER_SENTENCE_PREDICATE_TERMS = /(?:为|是|成立|设立|注册|位于|经营|主营|从事|提供|覆盖|包含|涉及|专注|聚焦|布局|拥有|具备|采用|应用|承担|承接|生产|制造|销售|投资|收购|发布|披露|签署|合作|中标|招标|采购|建设|上线|推出|新增|更新|升级|交付|部署|扩展|扩大|进入|成为|列为|入选|获评|增长|提升|保持|减少|下降|实现|达到|存在|需要|需|应当|应|可以|可|建议|确认|核实|核验|准备|跟进|联系|验证|判断|表明|显示|反映|计划|推进|开展|完成|获得|发生|面临|影响|有助于|属于|形成|支持|服务于|负责|拟)/u;
const DOSSIER_TITLE_FRAGMENT_PATTERNS = Object.freeze([
  /(?:有限责任公司|股份有限公司|集团|公司)\s*[-—|]\s*(?:最新|近期)?.{0,24}(?:结果|公告|新闻|动态|发布)$/u,
  /(?:最新|近期).{0,24}(?:中标|招标|采购|合作|签约|融资|处罚|诉讼)(?:结果)?(?:发布|公告)$/u,
  /(?:中标|招标|采购|合作|签约|融资|处罚|诉讼)(?:结果|公告|新闻|动态)$/u,
]);
const DOSSIER_GENERIC_TEMPLATE_PATTERNS = Object.freeze([
  /上述业务动作指向.{0,40}(?:经营与技术方向|相关方向)/u,
  /当前信息更适合作为.{0,30}背景材料/u,
  /可优先验证.{0,40}相关的采购、技术协同或项目交付场景/u,
  /企业近期发布产品升级公告并需要继续关注/u,
  /可进一步核验重点产品线/u,
  /需持续关注相关风险/u,
]);

function safeValidationErrors(value, limit = 16) {
  return firstJsonArray(value)
    .map((item) => String(item || "")
      .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
      .replace(/ark-[0-9a-f-]{24,}/gi, "[REDACTED]")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500))
    .filter(Boolean)
    .slice(0, limit);
}

function hasDossierInternalMetaText(value) {
  const text = String(value || "");
  return DOSSIER_INTERNAL_META_PATTERNS.some((pattern) => pattern.test(text));
}

function hasUnbalancedDossierPunctuation(value) {
  const text = String(value || "");
  return [
    ["(", ")"],
    ["（", "）"],
    ["[", "]"],
    ["【", "】"],
    ["“", "”"],
  ].some(([left, right]) => (
    text.split(left).length - 1 !== text.split(right).length - 1
  ));
}

function hasTruncatedDossierNumber(value) {
  return /(?:营业收入|营收|净利润|利润|金额|产能|市占率)[^。；\n]{0,24}\d+(?:\.\d+)?(?=\s*(?:[。；]|$))/.test(
    String(value || ""),
  );
}

function hasDossierEvidenceDebris(value) {
  const text = String(value || "");
  return DOSSIER_EVIDENCE_DEBRIS_PATTERNS.some((pattern) => pattern.test(text));
}

function isQuestionLikeDossierText(value) {
  const text = stripDossierSectionTitle(value)
    .replace(/[。！？!?]+$/gu, "")
    .trim();
  if (!text || text.length > 120) return false;
  if (/[？?]\s*$/u.test(stripDossierSectionTitle(value))) return true;
  const interrogative = text.match(/是否|有无|有没有|能否|可否|如何|为什么|为何|怎样|怎么/u);
  if (!interrogative) return false;
  const prefix = text.slice(0, interrogative.index);
  return !/(?:需要|需|应当|应|建议|确认|核实|核验|评估|判断|了解|询问|联系|验证|调查)/u.test(prefix);
}

function dossierPointQualityErrors(value) {
  const errors = [];
  if (hasDossierEvidenceDebris(value)) errors.push("包含搜索站点模板或引流文字");
  if (isQuestionLikeDossierText(value)) errors.push("把检索问题或问句当作企业事实");
  if (hasUnbalancedDossierPunctuation(value)) errors.push("存在未闭合的括号、引号或方括号");
  if (hasTruncatedDossierNumber(value)) errors.push("存在缺少单位或上下文的截断数字");
  return errors;
}

function isSubstantiveDossierSummary(value) {
  const text = compactText(value, 360);
  return text.length >= 40
    && !hasBadDisplayText(text)
    && !hasDossierInternalMetaText(text)
    && dossierPointQualityErrors(text).length === 0;
}

function stripDossierSectionTitle(value) {
  return String(value || "")
    .replace(new RegExp(`^(?:${DOSSIER_SECTION_TITLES.join("|")})[：:]\\s*`), "")
    .trim();
}

function normalizeChineseDossierPunctuation(value) {
  return String(value || "")
    .replace(/([\p{Script=Han}”’）】])\s*:\s*/gu, "$1：")
    .replace(/(?<!\d),|,(?!\d)/gu, "，")
    .replace(/;\s*/gu, "；")
    .replace(/\s*\?(?=\s|$)/gu, "？")
    .replace(/\s*!(?=\s|$)/gu, "！")
    .replace(/([\p{Script=Han}])\(/gu, "$1（")
    .replace(/\)(?=[\p{Script=Han}，。；：])/gu, "）");
}

function ensureDossierLinePunctuation(value) {
  const text = normalizeChineseDossierPunctuation(value)
    .trim()
    .replace(/\s+([，。；：！？、])/gu, "$1")
    .replace(/([（【“])\s+/gu, "$1")
    .replace(/\s+([）】”])/gu, "$1")
    .replace(/\?$/u, "？")
    .replace(/!$/u, "！");
  if (!text) return "";
  if (/[。！？]$/u.test(text)) return text;
  return `${text.replace(/[；;，,:：、\s]+$/gu, "")}。`;
}

function normalizeDossierSectionText(value, title, maxLength = 1400) {
  let content = normalizeImportedText(normalizeSalesText(value))
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  content = stripDossierSectionTitle(content);
  content = content
    .replace(/[ \t]+(?=(?:[2-9]|1\d)[.、](?=\s|[\p{Script=Han}A-Z]))/gu, "\n")
    .replace(/([。！？；])(?=(?:[2-9]|1\d)[.、](?=\s|[\p{Script=Han}A-Z]))/gu, "$1\n")
    .replace(/([。！？；])(?=(?:第[二三四五六七八九十]+|其次|再次|最后)[、，：:])/gu, "$1\n");
  const lines = content
    .split(/\n+/u)
    .map(ensureDossierLinePunctuation)
    .filter(Boolean);
  if (!lines.length) return "";
  const normalized = `${title}：${lines.join("\n")}`;
  if (normalized.length <= maxLength) return normalized;
  const truncated = normalized.slice(0, Math.max(title.length + 4, maxLength - 1));
  return ensureDossierLinePunctuation(truncated);
}

function cleanDossierBodyText(value, title, fallback = "", maxLength = 1400) {
  const text = normalizeDossierSectionText(value, title, maxLength);
  if (!text || hasBadDisplayText(text)) {
    return fallback ? normalizeDossierSectionText(fallback, title, maxLength) : "";
  }
  return text;
}

function dossierFactUnits(value) {
  return stripDossierSectionTitle(value)
    .split(/(?:\n+|[。！？；]\s*)/u)
    .map((item) => item.replace(/^\d{1,2}[.、]\s*/u, "").trim())
    .filter((item) => item.length >= 12)
    .map((item) => item
      .toLowerCase()
      .replace(/\[[0-9]+\]/gu, "")
      .replace(/[\s，。；：！？、,.!?;:'"“”‘’（）()【】[\]《》<>-]/gu, ""));
}

function dossierSentenceUnits(value) {
  return stripDossierSectionTitle(value)
    .split(/(?:\n+|[。！？]\s*)/u)
    .map((item) => item.replace(/^\d{1,2}[.、]\s*/u, "").trim())
    .filter(Boolean);
}

function dossierSentenceQualityErrors(value) {
  const errors = [];
  for (const sentence of dossierSentenceUnits(value)) {
    if (DOSSIER_TITLE_FRAGMENT_PATTERNS.some((pattern) => pattern.test(sentence))) {
      errors.push("包含被当作正文的搜索标题或事件标题残片");
      continue;
    }
    if (!DOSSIER_SENTENCE_PREDICATE_TERMS.test(sentence)) {
      errors.push("包含缺少明确陈述或行动谓语的名词片段");
    }
  }
  if (DOSSIER_GENERIC_TEMPLATE_PATTERNS.some((pattern) => pattern.test(String(value || "")))) {
    errors.push("包含不能直接形成销售结论的通用模板话术");
  }
  return [...new Set(errors)];
}

function dossierBigramSimilarity(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length > right.length ? left : right;
  if (shorter.length >= 28 && longer.includes(shorter)) {
    return shorter.length / longer.length;
  }
  const bigrams = (value) => {
    const result = new Set();
    for (let index = 0; index < value.length - 1; index += 1) {
      result.add(value.slice(index, index + 2));
    }
    return result;
  };
  const leftBigrams = bigrams(left);
  const rightBigrams = bigrams(right);
  if (!leftBigrams.size || !rightBigrams.size) return 0;
  let overlap = 0;
  for (const item of leftBigrams) {
    if (rightBigrams.has(item)) overlap += 1;
  }
  return (2 * overlap) / (leftBigrams.size + rightBigrams.size);
}

function dossierSectionContentErrors(body) {
  const errors = [];
  DOSSIER_SECTION_TITLES.forEach((title, index) => {
    const text = String(body[index]?.text || "");
    const content = stripDossierSectionTitle(text);
    if (!content) {
      errors.push(`${title}缺少正文`);
    }
    if (content.length > 1200) {
      errors.push(`${title}超过 1200 个字符的异常输出保护上限`);
    }
    const incompleteLines = content
      .split(/\n+/u)
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => !/[。！？]$/u.test(item));
    if (incompleteLines.length) {
      errors.push(`${title}存在未使用完整句末标点的段落或分点`);
    }
    if (hasDossierInternalMetaText(content)) {
      errors.push(`${title}包含仅供系统内部使用的检索或证据诊断话术`);
    }
    dossierPointQualityErrors(content).forEach((error) => {
      errors.push(`${title}${error}`);
    });
    dossierSentenceQualityErrors(content).forEach((error) => {
      errors.push(`${title}${error}`);
    });
  });
  const seenFacts = [];
  DOSSIER_SECTION_TITLES.forEach((title, index) => {
    for (const fact of dossierFactUnits(body[index]?.text)) {
      const duplicate = seenFacts.find((item) => dossierBigramSimilarity(item.fact, fact) >= 0.82);
      if (duplicate) {
        errors.push(`${title}与${duplicate.title}存在重复或高度相似的事实表述`);
        continue;
      }
      seenFacts.push({ title, fact });
    }
  });
  return errors;
}

function dossierSourceIds(citations, predicate) {
  return new Set(
    citations
      .filter(predicate)
      .map((item) => String(item.id)),
  );
}

function isUsableProfessionalDossierCitation(item) {
  const point = safeDeterministicDossierPoint(conciseProfessionalPoint(item));
  return Boolean(
    point
    && !isLowValueProfessionalPoint(point)
    && isSubstantiveDossierEvidencePoint(point)
  );
}

function isUsablePublicDossierCitation(item) {
  const point = safeDeterministicDossierPoint(concisePublicPoint(item));
  return Boolean(
    point
    && !isLowValuePublicDossierSource(item)
    && isSubstantiveDossierEvidencePoint(point)
  );
}

function dossierSectionSourcePolicy(citations, company = null) {
  const professional = dossierSourceIds(
    citations,
    (item) => item.source_kind === "专业数据集" && isUsableProfessionalDossierCitation(item),
  );
  const web = dossierSourceIds(
    citations,
    (item) => (
      item.source_kind === "联网搜索"
      && isUsablePublicDossierCitation(item)
      && (
        !company
        || isRecentPublicDossierCitation(item, concisePublicPoint(item), company)
      )
    ),
  );
  const business = dossierSourceIds(
    citations,
    (item) => {
      if (
        item.source_kind !== "专业数据集"
        || !/企业工商数据库/.test(String(item.label || ""))
        || !isUsableProfessionalDossierCitation(item)
      ) return false;
      if (!company) return true;
      const record = dossierBusinessEntityRecord(item);
      const targetName = String(company?.name || company?.legal_name || "").trim();
      return Boolean(
        record
        && targetName
        && normalizeLegalEntityName(record.name) === normalizeLegalEntityName(targetName)
      );
    },
  );
  const risk = dossierSourceIds(
    citations,
    (item) => (
      item.source_kind === "专业数据集"
      && /企业风险数据库/.test(String(item.label || ""))
      && !dossierBusinessEntityRecord(item)
      && isUsableProfessionalDossierCitation(item)
    ),
  );
  const market = dossierSourceIds(
    citations,
    (item) => (
      item.source_kind === "专业数据集"
      && /金融数据库|汽车销量数据库|科研学术数据搜索服务/.test(String(item.label || ""))
      && !dossierBusinessEntityRecord(item)
      && isUsableProfessionalDossierCitation(item)
    ),
  );
  const businessDynamics = market.size
    ? new Set(market)
    : web.size >= 2
      ? new Set(web)
      : new Set();
  return { professional, web, business, risk, market, businessDynamics };
}

function dossierSectionSourceErrors(body, citations, company = null) {
  const policy = dossierSectionSourcePolicy(citations, company);
  const errors = [];
  const usesAny = (index, ids) => (
    ids.size > 0 && (body[index]?.citation_ids || []).some((id) => ids.has(String(id)))
  );
  const requireWhenAvailable = (index, ids, message) => {
    if (ids.size && !usesAny(index, ids)) errors.push(message);
  };

  requireWhenAvailable(0, policy.business, "企业与业务概览必须优先引用企业工商数据库");
  requireWhenAvailable(1, policy.market, "经营与业务动态必须优先引用语义匹配的专业数据库");
  requireWhenAvailable(2, policy.web, "近期公开动态必须引用豆包搜索的可追溯公开来源");
  if (policy.risk.size) {
    requireWhenAvailable(3, policy.risk, "风险与关注事项必须优先引用企业风险数据库");
  }
  return errors;
}

function normalizeLegalEntityName(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s·•()（）\[\]【】_-]+/gu, "");
}

function escapeRegularExpression(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function dossierBusinessEntityRecord(citation) {
  if (citation?.source_kind !== "专业数据集") return null;
  const summary = String(citation?.summary || "");
  const name = summary.match(/(?:^|[;；])\s*公司名称\s*[:：]\s*([^;；]+)/u)?.[1]?.trim() || "";
  const registryFieldCount = [
    /(?:^|[;；])\s*统一社会信用代码\s*[:：]/u,
    /(?:^|[;；])\s*注册号\s*[:：]/u,
    /(?:^|[;；])\s*(?:公司组织类型|企业类型)\s*[:：]/u,
    /(?:^|[;；])\s*(?:注册地址|住所)\s*[:：]/u,
    /(?:^|[;；])\s*成立日期\s*[:：]/u,
    /(?:^|[;；])\s*(?:经营范围|法人姓名|法定代表人)\s*[:：]/u,
  ].filter((pattern) => pattern.test(summary)).length;
  // DataPro can return a registry row from a query labelled as finance,
  // research, sales or risk data. Entity isolation must therefore be based on
  // the structured fields in the payload instead of trusting the query label.
  if (!name || registryFieldCount < 1) return null;
  return name ? { id: String(citation.id || ""), name, summary } : null;
}

function normalizeDossierCitationSemantics(citations) {
  const registryKeeperByFingerprint = new Map();
  const registryFingerprint = (citation, record) => `${normalizeLegalEntityName(record.name)}:${String(
    citation.summary || "",
  )
    .normalize("NFKC")
    .replace(/\s+/gu, "")
    .replace(/[；;]/gu, ";")
    .replace(/[：:]/gu, ":")}`;

  firstJsonArray(citations).forEach((citation) => {
    const record = dossierBusinessEntityRecord(citation);
    if (!record) return;
    const fingerprint = registryFingerprint(citation, record);
    const current = registryKeeperByFingerprint.get(fingerprint);
    if (
      !current
      || (
        /企业工商数据库/u.test(String(citation.label || ""))
        && !/企业工商数据库/u.test(String(current.label || ""))
      )
    ) {
      registryKeeperByFingerprint.set(fingerprint, citation);
    }
  });

  return firstJsonArray(citations).flatMap((citation) => {
    const record = dossierBusinessEntityRecord(citation);
    if (!record) return [citation];
    const fingerprint = registryFingerprint(citation, record);
    if (registryKeeperByFingerprint.get(fingerprint) !== citation) return [];
    if (/企业工商数据库/u.test(String(citation.label || ""))) return [citation];
    const recordSuffix = String(citation.label || "").match(/\s*·\s*记录\s*\d+/u)?.[0] || "";
    return [{
      ...citation,
      label: `企业工商数据库${recordSuffix || " · 自动识别记录"}`,
    }];
  });
}

function isExplicitTargetBranchRecord(record, targetName) {
  const recordKey = normalizeLegalEntityName(record?.name || "");
  const targetKey = normalizeLegalEntityName(targetName || "");
  return Boolean(
    recordKey
    && targetKey
    && recordKey !== targetKey
    && recordKey.startsWith(targetKey)
    && /分公司$/u.test(String(record?.name || "").trim())
  );
}

function businessEntityAnchorErrors(body, citations, company) {
  const targetName = String(company?.name || company?.legal_name || "").trim();
  const targetKey = normalizeLegalEntityName(targetName);
  if (!targetKey) return [];
  const records = citations.map(dossierBusinessEntityRecord).filter(Boolean);
  const selectedIds = new Set(firstJsonArray(body[0]?.citation_ids).map(String));
  const selectedRecords = records.filter((record) => selectedIds.has(record.id));
  const targetRecords = records.filter((record) => normalizeLegalEntityName(record.name) === targetKey);
  const selectedTargetRecords = selectedRecords.filter((record) => normalizeLegalEntityName(record.name) === targetKey);
  if (!targetRecords.length) return [];
  const errors = [];
  if (!selectedTargetRecords.length) {
    errors.push(`企业与业务概览必须引用公司名称完全等于“${targetName}”的工商记录`);
    return errors;
  }
  const branchPattern = new RegExp(
    `${escapeRegularExpression(targetName)}[\\p{Script=Han}A-Za-z0-9（）()·]{1,24}(?:分公司|子公司)`,
    "gu",
  );
  for (const match of String(body[0]?.text || "").matchAll(branchPattern)) {
    const referencedName = match[0];
    if (!selectedRecords.some((record) => (
      normalizeLegalEntityName(record.name) === normalizeLegalEntityName(referencedName)
    ))) {
      errors.push(`企业与业务概览提到“${referencedName}”，但本章没有引用该分支机构自己的工商记录`);
    }
  }
  const sentences = dossierSentenceUnits(body[0]?.text || "");
  const sameAnchor = (anchor, recordAnchors) => recordAnchors.some((candidate) => (
    String(candidate).replace(/[,，]/gu, "") === String(anchor).replace(/[,，]/gu, "")
  ));
  sentences.forEach((sentence, sentenceIndex) => {
    const explicitOtherRecords = selectedRecords.filter((record) => (
      normalizeLegalEntityName(record.name) !== targetKey
      && sentence.includes(record.name)
    ));
    const allowedRecords = explicitOtherRecords.length ? explicitOtherRecords : selectedTargetRecords;
    const allowedSummaries = allowedRecords.map((record) => record.summary);
    for (const date of extractGroundingDates(sentence)) {
      if (!allowedSummaries.some((summary) => extractGroundingDates(summary).includes(date))) {
        errors.push(`企业与业务概览第 ${sentenceIndex + 1} 条把日期 ${date} 归属给“${explicitOtherRecords[0]?.name || targetName}”，但对应工商记录不支持该归属`);
      }
    }
    for (const number of extractGroundingNumbers(sentence)) {
      if (!allowedSummaries.some((summary) => sameAnchor(number, extractGroundingNumbers(summary)))) {
        errors.push(`企业与业务概览第 ${sentenceIndex + 1} 条把数值 ${number} 归属给“${explicitOtherRecords[0]?.name || targetName}”，但对应工商记录不支持该归属`);
      }
    }
    const identifiers = sentence.match(/\b[0-9A-Z]{12,24}\b/gu) || [];
    for (const identifier of identifiers) {
      if (!allowedSummaries.some((summary) => summary.includes(identifier))) {
        errors.push(`企业与业务概览第 ${sentenceIndex + 1} 条把登记标识 ${identifier} 归属给“${explicitOtherRecords[0]?.name || targetName}”，但对应工商记录不支持该归属`);
      }
    }
  });
  return [...new Set(errors)];
}

function unrelatedBusinessEntityCitationErrors(body, citations, company) {
  const targetName = String(company?.name || company?.legal_name || "").trim();
  const targetKey = normalizeLegalEntityName(targetName);
  if (!targetKey) return [];
  const recordById = new Map(
    citations
      .map(dossierBusinessEntityRecord)
      .filter(Boolean)
      .map((record) => [record.id, record]),
  );
  const errors = [];
  firstJsonArray(body).slice(1).forEach((paragraph, offset) => {
    const sectionIndex = offset + 1;
    const paragraphText = String(paragraph?.text || "");
    const unrelated = firstJsonArray(paragraph?.citation_ids)
      .map((id) => recordById.get(String(id)))
      .filter((record) => {
        if (!record || normalizeLegalEntityName(record.name) === targetKey) return false;
        return !(
          isExplicitTargetBranchRecord(record, targetName)
          && paragraphText.includes(record.name)
        );
      });
    for (const record of unrelated) {
      errors.push(
        `${DOSSIER_SECTION_TITLES[sectionIndex]}不得把未明确点名或未经关系核验的其他主体工商记录归属到目标企业：${record.name}`,
      );
    }
  });
  return [...new Set(errors)];
}

function staticRegistryInferenceErrors(body, citations) {
  const citationById = new Map(citations.map((item) => [String(item.id), item]));
  const registryOnly = (sectionIndex) => {
    const selected = firstJsonArray(body[sectionIndex]?.citation_ids)
      .map((id) => citationById.get(String(id)))
      .filter(Boolean);
    return Boolean(
      selected.length
      && selected.every((citation) => dossierBusinessEntityRecord(citation)),
    );
  };
  const errors = [];
  const dynamicsText = String(body[1]?.text || "");
  if (
    registryOnly(1)
    && (
      /业务动作(?:主要)?聚焦/u.test(dynamicsText)
      || /构成[^。！？]{0,40}(?:独立产品线|业务增长|业务变化)/u.test(dynamicsText)
      || /具备直接开展[^。！？]{0,40}(?:经营条件|业务条件)/u.test(dynamicsText)
    )
  ) {
    errors.push("经营与业务动态不能把静态工商登记范围提升为当前业务动作、独立产品线或现实经营能力");
  }
  const overviewText = String(body[0]?.text || "");
  if (
    registryOnly(0)
    && /(?:同时承担|形成[^。！？]{0,30}业务定位|制造基地[^。！？]{0,20}法定主体|实际从事|主营)/u.test(overviewText)
  ) {
    errors.push("企业与业务概览只能把工商信息表述为登记范围，不能提升为实际主营、制造主体或现实业务定位");
  }
  const opportunityText = String(body[4]?.text || "");
  if (
    registryOnly(4)
    && /(?:同时承担|已具备|具备直接|已形成|现实业务能力)/u.test(opportunityText)
  ) {
    errors.push("销售机会判断可以把登记范围作为对接方向，但不能写成企业已承担该业务或已具备现实能力");
  }
  return errors;
}

function dossierSectionSemanticErrors(body, citations, company) {
  const errors = [
    ...businessEntityAnchorErrors(body, citations, company),
    ...unrelatedBusinessEntityCitationErrors(body, citations, company),
    ...staticRegistryInferenceErrors(body, citations),
  ];
  const citationById = new Map(citations.map((item) => [String(item.id), item]));
  const sectionEvidenceText = (index) => firstJsonArray(body[index]?.citation_ids)
    .map((id) => citationById.get(String(id)))
    .filter(Boolean)
    .map((item) => `${item.label || ""} ${item.summary || ""}`)
    .join(" ");
  body.slice(0, 4).forEach((paragraph, index) => {
    const paragraphCitations = firstJsonArray(paragraph?.citation_ids)
      .map((id) => citationById.get(String(id)))
      .filter(Boolean);
    if (
      paragraphCitations.some((item) => item.entity_match === "alias_scoped")
      && !paragraphCitations.some((item) => item.entity_match === "verified")
      && !/(?:品牌|集团|相关业务|在华业务|中国业务|公开信息显示)/u.test(String(paragraph?.text || ""))
    ) {
      errors.push(`${DOSSIER_SECTION_TITLES[index]}使用品牌或简称来源时必须明确主体边界`);
    }
  });
  const recentCitations = firstJsonArray(body[2]?.citation_ids)
    .map((id) => citationById.get(String(id)))
    .filter((item) => item?.source_kind === "联网搜索");
  if (
    recentCitations.length
    && recentCitations.some((item) => (
      !isRecentPublicDossierCitation(item, concisePublicPoint(item), company)
    ))
  ) {
    errors.push("近期公开动态引用了不具备明确业务事件的网页或低价值营销页面");
  }
  [0, 1].forEach((sectionIndex) => {
    const trajectoryText = stripDossierSectionTitle(body[sectionIndex]?.text || "");
    if (
      DOSSIER_BUSINESS_TRAJECTORY_INFERENCE.test(trajectoryText)
      && !DOSSIER_BUSINESS_TRAJECTORY_INFERENCE.test(sectionEvidenceText(sectionIndex))
    ) {
      errors.push("企业概览或经营动态不能把静态经营范围或少量项目外推为业务转型或能力扩展");
    }
  });
  const recentText = stripDossierSectionTitle(body[2]?.text || "");
  if (
    DOSSIER_RECENT_DEMAND_INFERENCE.test(recentText)
    && !/(?:采购|配套|交付|项目|资源)[^。！？\n]{0,12}(?:需求|意向)/u.test(sectionEvidenceText(2))
  ) {
    errors.push("近期公开动态不能把中标或公告节奏写成来源未披露的采购需求或采购意向");
  }
  const riskText = stripDossierSectionTitle(body[3]?.text || "");
  if (DOSSIER_COMPANY_WIDE_INFERENCE.test(riskText)) {
    errors.push("风险与关注事项不能把个别项目或单条公开信息外推为企业整体结构性结论");
  }
  if (!DOSSIER_SPECIFIC_RISK_TERMS.test(riskText)) return errors;
  const riskCitations = firstJsonArray(body[3]?.citation_ids)
    .map((id) => citationById.get(String(id)))
    .filter(Boolean);
  const hasProfessionalRisk = riskCitations.some((item) => (
    item.source_kind === "专业数据集"
    && /企业风险数据库/.test(String(item.label || ""))
    && isUsableProfessionalDossierCitation(item)
  ));
  const hasTargetSpecificPublicRisk = riskCitations.some((item) => (
    item.source_kind === "联网搜索"
    && isPublicRiskEvidenceForCompany(item, concisePublicPoint(item), company)
  ));
  if (!hasProfessionalRisk && !hasTargetSpecificPublicRisk) {
    errors.push("风险与关注事项包含未明确归属于目标企业的风险事实");
  }
  return errors;
}

function dossierSectionEvidenceGroundingErrors(body, citations) {
  const citationById = new Map(citations.map((item) => [String(item?.id || ""), item]));
  const errors = [];
  firstJsonArray(body).forEach((paragraph, sectionIndex) => {
    const title = DOSSIER_SECTION_TITLES[sectionIndex] || `第 ${sectionIndex + 1} 章`;
    const segments = firstJsonArray(paragraph?.segments).length
      ? firstJsonArray(paragraph.segments)
      : [{
        text: stripDossierSectionTitle(paragraph?.text || ""),
        citation_ids: firstJsonArray(paragraph?.citation_ids),
      }];
    segments.forEach((segment, segmentIndex) => {
      const evidenceTexts = firstJsonArray(segment?.citation_ids)
        .map((id) => citationById.get(String(id)))
        .filter(Boolean)
        .flatMap((citation) => [citation.summary, citation.excerpt].filter(Boolean));
      errors.push(...groundedTextErrors({
        text: segment?.text || "",
        evidenceTexts,
        path: `${title}第 ${segmentIndex + 1} 段`,
        requireEventFamily: false,
        checkOrganizations: false,
      }));
    });
  });
  return [...new Set(errors)];
}

const JOB_STAGE_LABELS = Object.freeze({
  queued: "等待执行",
  retry_wait: "正在等待自动重试",
  starting: "正在准备",
  collecting_evidence: "正在收集可信资料",
  collecting_professional: "正在核验专业资料",
  collecting_public: "正在检索公开资料",
  building_evidence: "正在整理可信资料",
  retrieving_memory: "正在检索历史资料",
  validating_evidence: "正在校验资料",
  generating_dossier: "正在生成档案",
  validating_dossier: "正在核验档案",
  storing_memory: "正在保存长期资料",
  persisting_result: "正在保存结果",
  syncing_materials: "正在同步历史资料",
  cancelling: "正在取消",
  succeeded: "已完成",
  failed: "执行失败",
  cancelled: "已取消",
});

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeJobProgressDetail(value) {
  const detail = objectValue(value);
  const current = Number(detail.current);
  const total = Number(detail.total);
  const nextRetryAt = String(detail.next_retry_at || "");
  return {
    ...(detail.message ? { message: String(detail.message).replace(/\s+/g, " ").trim().slice(0, 100) } : {}),
    ...(Number.isInteger(current) && current >= 0 ? { current } : {}),
    ...(Number.isInteger(total) && total > 0 ? { total } : {}),
    ...(nextRetryAt && Number.isFinite(new Date(nextRetryAt).getTime())
      ? { next_retry_at: new Date(nextRetryAt).toISOString() }
      : {}),
  };
}

async function mapWithConcurrency(items, limit, operation) {
  const values = [...items];
  const results = new Array(values.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, Number(limit) || 1), Math.max(1, values.length)) },
    async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await operation(values[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function workflowQueryKey(provider, query) {
  return `${provider}:${createHash("sha256").update(String(query || "")).digest("hex").slice(0, 24)}`;
}

function reusableDossierCheckpoint(checkpoint, companyId, ttlMs) {
  const value = objectValue(checkpoint);
  if (
    Number(value.schema_version) !== 1
    || String(value.company_id || "") !== String(companyId || "")
  ) return null;
  const savedAt = new Date(value.updated_at || value.collected_at || "").getTime();
  if (!Number.isFinite(savedAt) || Date.now() - savedAt > ttlMs) return null;
  return value;
}

function emptySalesData() {
  return {
    goals: [],
    companies: {},
    dossiers: {},
    materials: {},
    qa_messages: {},
    sync_sources: {},
    sync_checkpoints: {},
    jobs: {},
  };
}

function compactText(value, maxLength = 900) {
  return normalizeImportedText(value).replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function compactCompleteSentences(value, maxLength = 300) {
  const text = normalizeImportedText(value).replace(/\s+/g, " ").trim();
  if (!text || text.length <= maxLength) return text;
  const sentences = text.match(/[^。！？!?]+[。！？!?]/gu) || [];
  let result = "";
  for (const sentence of sentences) {
    const normalized = sentence.trim();
    const candidate = result ? `${result} ${normalized}` : normalized;
    if (candidate.length > maxLength) break;
    result = candidate;
  }
  if (result) return result;
  const bounded = text.slice(0, maxLength);
  const boundary = Math.max(
    bounded.lastIndexOf("；"),
    bounded.lastIndexOf(";"),
    bounded.lastIndexOf("，"),
    bounded.lastIndexOf(","),
  );
  const completeClause = boundary >= 40 ? bounded.slice(0, boundary) : bounded;
  return ensureDossierLinePunctuation(completeClause);
}

function qaConversationHistory(messages, { maxMessages = 10, maxCharacters = 6000 } = {}) {
  const history = [];
  let remaining = maxCharacters;
  for (const message of firstJsonArray(messages).slice(-maxMessages).reverse()) {
    if (!message || !["user", "assistant"].includes(message.role) || remaining <= 0) continue;
    const text = compactText(message.text || "", Math.min(1200, remaining));
    if (!text) continue;
    history.push({ role: message.role, text });
    remaining -= text.length;
  }
  return history.reverse();
}

function encodeQaSessionMessage(message) {
  const snapshot = {
    id: String(message?.id || ""),
    role: ["assistant", "user"].includes(message?.role) ? message.role : "user",
    text: String(message?.text || "").trim(),
    paragraphs: firstJsonArray(message?.paragraphs),
    citation_ids: firstJsonArray(message?.citation_ids).map(String),
    citations: firstJsonArray(message?.citations),
    insufficient: Boolean(message?.insufficient),
    created_at: message?.created_at || null,
  };
  const encoded = Buffer.from(JSON.stringify(snapshot), "utf8").toString("base64");
  return `${snapshot.text}\n<!-- sales-workbench-qa-v1:${encoded} -->`;
}

function decodeQaSessionMessage(message, index = 0) {
  const sourceText = String(message?.text || message?.content || "").trim();
  const match = sourceText.match(QA_SESSION_MESSAGE_PATTERN);
  let snapshot = null;
  if (match?.[1]) {
    try {
      snapshot = JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
    } catch {
      snapshot = null;
    }
  }
  const plainText = sourceText.replace(QA_SESSION_MESSAGE_PATTERN, "").trim();
  return {
    id: String(snapshot?.id || message?.id || `openviking-qa-${index + 1}`),
    role: ["assistant", "user"].includes(snapshot?.role)
      ? snapshot.role
      : ["assistant", "user"].includes(message?.role) ? message.role : "user",
    text: String(snapshot?.text || plainText).trim(),
    paragraphs: firstJsonArray(snapshot?.paragraphs),
    citation_ids: firstJsonArray(snapshot?.citation_ids).map(String),
    citations: firstJsonArray(snapshot?.citations),
    insufficient: Boolean(snapshot?.insufficient),
    created_at: snapshot?.created_at || message?.created_at || null,
  };
}

function openVikingNotFound(result) {
  const code = String(result?.error?.code || "").toLowerCase();
  const message = String(result?.error?.message || "").toLowerCase();
  return Number(result?.http_status || 0) === 404
    || ["404", "not_found", "session_not_found"].includes(code)
    || /not found|does not exist|不存在|未找到/.test(message);
}

function legacyMaterialText(content) {
  const text = String(content || "");
  const body = text.match(/资料正文：([\s\S]*?)(?:\n使用边界：|$)/)?.[1];
  return cleanMaterialText(body || "");
}

function normalizeImportedText(value) {
  return String(value || "")
    .replace(/<!--\s*sales-workbench-material-v1:[A-Za-z0-9+/=]+\s*-->/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ");
}

function normalizeInitial(name) {
  const trimmed = String(name || "").trim();
  return trimmed ? trimmed.slice(0, 1) : "企";
}

const dataProCompanyFields = Object.freeze({
  name: ["公司名称", "企业名称", "企业全称", "company_name", "companyName", "ent_name", "entName", "name"],
  unified_social_credit_code: ["统一社会信用代码", "社会信用代码", "信用代码", "unified_social_credit_code", "credit_code", "creditCode"],
  legal_representative: ["法定代表人", "法人姓名", "法人", "legal_representative", "legalRepresentative", "legal_person", "legalPerson"],
  registered_capital: ["注册资本", "注册资金", "registered_capital", "registeredCapital", "reg_capital", "regCapital"],
  business_status: ["经营状态", "企业状态", "登记状态", "business_status", "businessStatus", "ent_status", "entStatus", "status"],
  industry: ["所属行业", "行业分类", "行业", "industry_name", "industryName", "industry"],
  address: ["注册地址", "住所", "企业地址", "address", "registered_address", "registeredAddress"],
  province: ["省", "省份", "province", "province_name", "provinceName"],
  city: ["市", "城市", "city", "city_name", "cityName"],
  district: ["区县", "区/县", "区", "县", "district", "district_name", "districtName"],
  established_at: ["成立日期", "成立时间", "established_at", "establishedAt", "establish_date", "establishDate"],
  business_scope: ["经营范围", "business_scope", "businessScope"],
});

function normalizeDataFieldName(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[\s_.\-/（）()]/g, "");
}

function scalarDataValue(value, maxLength = 500) {
  if (!["string", "number", "boolean"].includes(typeof value)) return "";
  return String(value).replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function dataProField(item, aliases, maxLength = 500) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return "";
  const byNormalizedKey = new Map(Object.entries(item).map(([key, value]) => [normalizeDataFieldName(key), value]));
  for (const alias of aliases) {
    const value = byNormalizedKey.get(normalizeDataFieldName(alias));
    const text = scalarDataValue(value, maxLength);
    if (text) return text;
  }
  return "";
}

function dataProItemLooksLikeCompany(item) {
  const name = dataProField(item, dataProCompanyFields.name, 180);
  if (!name) return false;
  return [
    "unified_social_credit_code",
    "legal_representative",
    "registered_capital",
    "business_status",
    "address",
    "established_at",
    "business_scope",
  ].some((field) => dataProField(item, dataProCompanyFields[field], 500));
}

function collectDataProCompanyItems(parsed, limit = 8) {
  if (!parsed || typeof parsed !== "object") return [];
  const queue = [parsed];
  const visited = new Set();
  const items = [];
  while (queue.length && visited.size < 300 && items.length < limit) {
    const current = queue.shift();
    if (!current || typeof current !== "object" || visited.has(current)) continue;
    visited.add(current);
    if (!Array.isArray(current) && dataProItemLooksLikeCompany(current)) items.push(current);
    const children = Array.isArray(current) ? current : Object.values(current);
    for (const child of children) {
      if (child && typeof child === "object") queue.push(child);
    }
  }
  return items;
}

function companyItemFromDataProSummary(summary) {
  const text = String(summary || "");
  const item = {};
  for (const aliases of Object.values(dataProCompanyFields)) {
    for (const alias of aliases.filter((value) => /[\u4e00-\u9fff]/.test(value))) {
      const match = text.match(new RegExp(`(?:^|[；;|])\\s*${alias}\\s*[：:]\\s*([^；;|]+)`));
      if (match?.[1]) {
        item[alias] = match[1].trim();
        break;
      }
    }
  }
  return dataProItemLooksLikeCompany(item) ? item : null;
}

function compactCompanyLocation(item, address) {
  const explicit = [
    dataProField(item, dataProCompanyFields.province, 40),
    dataProField(item, dataProCompanyFields.city, 40),
    dataProField(item, dataProCompanyFields.district, 40),
  ].filter((value, index, values) => value && values.indexOf(value) === index).join("");
  if (explicit) return explicit.slice(0, 80);
  const text = String(address || "").trim();
  const municipality = text.match(/^(北京市|上海市|天津市|重庆市)/)?.[1];
  if (municipality) return municipality;
  const provinceAndCity = text.match(/^(.{2,10}?(?:省|自治区))(.{2,10}?市)/);
  if (provinceAndCity) return `${provinceAndCity[1]}${provinceAndCity[2]}`.slice(0, 80);
  return text.match(/^(.{2,10}?市)/)?.[1] || "";
}

function normalizedCompanyIdentity(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[\s·_.\-/（）()]/g, "");
}

function parentheticalBrandAlias(value) {
  const match = String(value || "").trim().match(/^([^（）()]{2,16})\s*[（(]\s*(?:中国|China)\s*[）)]/iu);
  return String(match?.[1] || "").trim();
}

const GENERIC_COMPANY_SEARCH_TERMS = new Set([
  "公司",
  "企业",
  "集团",
  "车企",
  "汽车",
  "新能源",
  "科技",
  "制造业",
  "供应商",
]);

function companyIdentityAliases(company = {}) {
  const canonicalName = normalizedCompanyIdentity(company.name);
  const names = [
    company.name,
    ...firstJsonArray(company.aliases),
    parentheticalBrandAlias(company.name),
  ].map(normalizedCompanyIdentity).filter(Boolean);
  const safeNames = names.filter((name) => (
    name.length >= 4
    || (
      name.length >= 2
      && canonicalName.includes(name)
      && !GENERIC_COMPANY_SEARCH_TERMS.has(name)
    )
  ));
  const derived = safeNames.flatMap((name) => {
    const withoutLegalSuffix = name.replace(/(?:股份有限公司|有限责任公司|有限公司|股份公司|集团公司|集团)$/u, "");
    const withoutIndustrySuffix = withoutLegalSuffix.replace(/(?:新能源科技|汽车工业|汽车科技|信息技术|网络科技)$/u, "");
    return [name, withoutLegalSuffix, withoutIndustrySuffix];
  });
  return [...new Set(derived)]
    .filter((item) => (
      item.length >= 4
      || (
        item.length >= 2
        && canonicalName.includes(item)
        && !GENERIC_COMPANY_SEARCH_TERMS.has(item)
      )
    ))
    .sort((left, right) => right.length - left.length);
}

function dossierTextMentionsCompany(value, company) {
  const text = normalizedCompanyIdentity(value);
  return companyIdentityAliases(company).some((alias) => text.includes(alias));
}

function dossierTextHasCompetingCompany(value, company) {
  let text = normalizedCompanyIdentity(value);
  for (const alias of companyIdentityAliases(company)) {
    text = text.split(alias).join("");
  }
  return /[\p{Script=Han}a-z0-9]{2,24}(?:有限责任公司|股份有限公司|有限公司|集团|股份|科技|汽车|新能源|能源|银行|证券|电建)/iu.test(text);
}

function isPublicCitationRelevantToCompany(source, point, company) {
  const label = String(source?.label || "");
  if (dossierTextMentionsCompany(point, company)) return true;
  if (!dossierTextMentionsCompany(label, company)) return false;
  return !dossierTextHasCompetingCompany(point, company);
}

function isPublicRiskEvidenceForCompany(source, point, company) {
  return Boolean(
    point
    && DOSSIER_SPECIFIC_RISK_TERMS.test(point)
    && isPublicCitationRelevantToCompany(source, point, company)
    && !dossierTextHasCompetingCompany(source?.label, company)
    && !dossierTextHasCompetingCompany(point, company)
  );
}

function companySearchAlias(query, companyName) {
  const rawQuery = String(query || "").trim().slice(0, 80);
  const normalizedQuery = normalizedCompanyIdentity(rawQuery);
  const normalizedName = normalizedCompanyIdentity(companyName);
  if (
    normalizedQuery.length < 2
    || normalizedQuery.length > 24
    || GENERIC_COMPANY_SEARCH_TERMS.has(normalizedQuery)
    || !normalizedName.includes(normalizedQuery)
  ) {
    return "";
  }
  return rawQuery;
}

function preferredCompanySearchName(company) {
  const aliases = [
    ...firstJsonArray(company?.aliases),
    parentheticalBrandAlias(company?.name),
  ]
    .map((value) => companySearchAlias(value, company?.name))
    .filter(Boolean)
    .sort((left, right) => normalizedCompanyIdentity(left).length - normalizedCompanyIdentity(right).length);
  return aliases[0] || company?.name || "";
}

function stableProfessionalCompanyId(identity) {
  return `company_dp_${createHash("sha256").update(identity).digest("hex").slice(0, 24)}`;
}

function formatCitationText(paragraph) {
  const ids = paragraph.citation_ids || [];
  const marks = ids.map((id) => `[${id}]`).join("");
  return `${paragraph.text}${marks}`;
}

function citationRank(citation) {
  const text = `${citation?.source_kind || ""} ${citation?.label || ""}`;
  if (/专业数据|专业数据库|工商|招投标/.test(text)) return 0;
  if (/联网搜索|公开|新闻|公告|媒体|官网/.test(text)) return 1;
  return 2;
}

function isPlaceholderUrl(value) {
  return /(^https?:\/\/)?(www\.)?example\.(com|test)\b/i.test(String(value || ""));
}

function publicSourceUrl(value) {
  const text = compactText(value, 500);
  if (!text || isPlaceholderUrl(text)) return "";
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function publicSourceHostname(value) {
  try {
    return new URL(publicSourceUrl(value)).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function publicCitationView(citation, id = citation?.id) {
  const sourceKind = compactText(citation?.source_kind || "资料来源", 40);
  const rawLabel = compactText(normalizeSalesText(citation?.label || ""), 160);
  const sanitizedRawLabel = sourceKind === "联网搜索"
    ? cleanPublicEvidenceLabel(rawLabel)
    : rawLabel;
  const label = /^(?:viking|openviking|datapro|model|fixture|demo-[^:]*):\/\//i.test(sanitizedRawLabel)
    || /^(?:viking|openviking|datapro|model|fixture|demo-[^:]*):/i.test(rawLabel)
    ? sourceKind
    : sanitizedRawLabel || sourceKind;
  const entityMatch = String(citation?.entity_match || "");
  const cleanedPublicSummary = sourceKind === "联网搜索"
    ? cleanPublicEvidenceText(citation?.summary || citation?.excerpt || "", 2400)
    : "";
  const summary = sourceKind === "联网搜索"
    ? (cleanedPublicSummary || label)
    : businessText(citation?.summary || citation?.excerpt || "", "", 2400);
  return {
    id: String(id || ""),
    label,
    source_kind: sourceKind,
    url: publicSourceUrl(citation?.url),
    summary,
    site_name: sourceKind === "联网搜索"
      ? compactText(citation?.site_name || "", 160)
      : "",
    published_at: citation?.published_at || null,
    source_updated_at: citation?.source_updated_at || null,
    source_quality_label: compactText(citation?.source_quality_label || "", 80),
    freshness_label: compactText(citation?.freshness_label || "", 80),
    verification_label: entityMatch === "alias_scoped"
      ? "品牌或简称相关，需核验法定主体归属"
      : /^(verified|query_bound|company_scoped)$/.test(entityMatch)
        ? "企业主体已核验"
        : "",
  };
}

function firstJsonArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasTechnicalErrorText(value) {
  const text = String(value || "");
  return /APIKey|鉴权失败|Unauthorized|provider_error|fetch failed/.test(text)
    || /"code"\s*:\s*(?:4\d{3}|5\d{3})/.test(text)
    || /(?:错误码|error_code|code)\s*[:：]\s*(?:4\d{3}|5\d{3})/i.test(text)
    || /企业ID\s*[\(（]\s*关联主键\s*[\)）]\s*[:：]/i.test(text)
    || /(?:trace|request|record|relation)[ _-]?id\s*[:：]/i.test(text);
}

function businessText(value, fallback, maxLength = 900) {
  const text = compactText(value, maxLength);
  if (!text || hasTechnicalErrorText(text)) return fallback;
  return text;
}

function providerUnavailable(provider, message, details = {}) {
  const error = new HttpError(503, `${provider}_unavailable`, message, {
    provider,
    ...details,
  });
  error.retryable = Boolean(details.retryable);
  if (details.category) error.category = details.category;
  return error;
}

function providerFailureDetails(failures = []) {
  const lastFailure = failures[failures.length - 1] || {};
  return {
    reason: lastFailure.code || "provider_error",
    category: lastFailure.category || "upstream",
    retryable: failures.some((failure) => (
      Boolean(failure?.retryable)
      || Number(failure?.status || failure?.http_status || 0) >= 500
    )),
  };
}

function hasBadDisplayText(value) {
  const text = String(value || "");
  return hasTechnicalErrorText(text) || /�|\\u[0-9a-fA-F]{4}|undefined|null/.test(text);
}

function cleanEvidenceSummary(value, fallback = "", maxLength = 420) {
  const text = compactText(normalizeSalesText(value), maxLength);
  if (!text || hasBadDisplayText(text)) return fallback;
  return text;
}

function dataProEvidenceSummaries(result) {
  const itemSummaries = firstJsonArray(result?.item_summaries)
    .map((item) => cleanEvidenceSummary(item, "", 1600))
    .filter(Boolean);
  if (itemSummaries.length) return itemSummaries;
  const summary = cleanEvidenceSummary(result?.summary, "", 2400);
  return summary ? [summary] : [];
}

function qaRetrievalQueries(company, question, conversationHistory = []) {
  const plan = analyzeQaQuestion(question, conversationHistory);
  const intentTerms = {
    risk: "风险 合规 处罚 诉讼 顾虑",
    timeline: "时间 节点 计划 进度",
    people: "负责人 联系人 决策部门 对接人",
    requirement: "需求 痛点 关注 场景 预算",
    action: "下一步 建议 跟进 推进",
    overview: "业务概览 当前情况",
    fact: "",
  };
  const expansion = plan.intents.map((intent) => intentTerms[intent] || "").filter(Boolean).join(" ");
  return [...new Set([
    `${company.name} ${plan.resolved_question}`,
    ...plan.subqueries.map((query) => `${company.name} ${query} ${expansion}`),
  ].map((query) => compactText(query, 1800)).filter(Boolean))].slice(0, 3);
}

function shortSourcePoint(source, maxLength = 120) {
  const label = cleanEvidenceSummary(source?.label, "", 80);
  const summary = cleanEvidenceSummary(source?.summary, "", maxLength);
  const sentence = summary.split(/[。.!！?？]/).find(Boolean) || summary;
  return compactText(sentence || label || "来源返回可引用信息", maxLength);
}

function cleanPublicEvidenceText(value, maxLength = 900) {
  return cleanEvidenceSummary(value, "", maxLength)
    .replace(/^雷递网\s+\S+\s+\d{1,2}月\d{1,2}日\s*/u, "")
    .replace(/^[^。；]{0,28}\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?\s*/u, "")
    .replace(/\b20\d{2}年\d{1,2}月\d{1,2}日\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:(?:市场|行业|公司|商业)?资讯)?\s*(?:[（(]来源[：:][^）)]{1,80}[）)])?\s*/gu, "")
    .replace(/(?:市场|行业|公司|商业)?资讯\s*[（(]来源[：:][^）)]{1,80}[）)]\s*/gu, "")
    .replace(/[（(]来源[：:][^）)]{1,80}[）)]\s*/gu, "")
    .replace(/查看更多(?:相关)?[\s\S]*$/u, "")
    .replace(/(?:立即注册|免费查看|点击查看|登录后查看)[\s\S]*$/u, "")
    .trim();
}

function cleanPublicEvidenceLabel(value) {
  return cleanPublicEvidenceText(value, 260)
    .replace(/_(?:新浪财经|新浪网|财经头条|雷递|百科|搜狐|腾讯新闻).*$/u, "")
    .replace(/_[^_]{2,24}$/u, "")
    .replace(/[\s_-]+(?:首页|Untitled)$/iu, "")
    .trim();
}

function dossierEvidencePointScore(value, { fromSummary = false } = {}) {
  const text = String(value || "");
  let score = fromSummary ? 2 : 0;
  if (DOSSIER_ACTION_TERMS.test(text)) score += 6;
  if (/(?:20\d{2}年|\d{1,2}月\d{1,2}日)/.test(text)) score += 2;
  if (text.length >= 28 && text.length <= 220) score += 2;
  if (/[。！？!?]$/.test(text)) score += 1;
  if (/如何|为什么|为何|怎样|是否|吗[？?]?$|[？?]$/.test(text)) score -= 8;
  if (/^(?:公司简介|企业信息|招标信息|最新消息|新闻资讯)$/.test(text)) score -= 10;
  return score;
}

function isSubstantiveDossierEvidencePoint(value) {
  const text = compactText(value, 500);
  return text.length >= 18
    && !hasBadDisplayText(text)
    && !hasDossierInternalMetaText(text)
    && !/(?:^|[-—：:])(?:招标信息|公司简介|企业信息|最新消息|新闻资讯)$/.test(text)
    && dossierPointQualityErrors(text).length === 0;
}

function concisePublicPoint(source, maxLength = 220) {
  const label = cleanPublicEvidenceLabel(source?.label);
  const rawSummary = cleanPublicEvidenceText(source?.summary, 1200);
  const comparableLabel = normalizeChineseDossierPunctuation(label).replace(/[。！？；\s]+$/u, "");
  const summary = comparableLabel && normalizeChineseDossierPunctuation(rawSummary).startsWith(comparableLabel)
    ? normalizeChineseDossierPunctuation(rawSummary)
      .slice(comparableLabel.length)
      .replace(/^[\s，。；：！？!?:、-]+/u, "")
      .trim()
    : rawSummary;
  const summarySegments = summary
    .split(/(?<=[。！？!?])\s*/u)
    .map((item) => item.trim())
    .filter(Boolean);
  const candidates = [
    ...summarySegments.map((text) => ({ text, fromSummary: true })),
    { text: label, fromSummary: false },
  ]
    .filter((item) => isSubstantiveDossierEvidencePoint(item.text))
    .filter((item) => item.text.length <= maxLength)
    .sort((a, b) => (
      dossierEvidencePointScore(b.text, b)
      - dossierEvidencePointScore(a.text, a)
    ));
  return String(candidates[0]?.text || "").replace(/[。；\s]+$/u, "");
}

function publicDossierSourceText(source, point = "") {
  return [
    source?.label,
    source?.site_name,
    source?.auth_description,
    source?.summary,
    point,
    source?.url,
  ].map((value) => String(value || "")).join(" ");
}

function isLowValuePublicDossierSource(source, point = "") {
  const text = publicDossierSourceText(source, point);
  return DOSSIER_LOW_VALUE_PUBLIC_SOURCE_PATTERNS.some((pattern) => pattern.test(text));
}

function isDisplayableDossierCitation(citation, company) {
  if (!/专业数据集|联网搜索/.test(String(citation?.source_kind || ""))) return false;
  if (hasDossierEvidenceDebris(citation?.label || "")) return false;
  if (!businessText(citation?.summary || citation?.excerpt, "", 600)) return false;
  if (citation.source_kind !== "联网搜索") {
    const point = safeDeterministicDossierPoint(conciseProfessionalPoint(citation));
    return Boolean(
      point
      && !isLowValueProfessionalPoint(point)
      && isSubstantiveDossierEvidencePoint(point)
    );
  }
  const point = concisePublicPoint(citation);
  if (!point || isLowValuePublicDossierSource(citation, point)) return false;
  if (!isPublicCitationRelevantToCompany(citation, point, company)) return false;
  const hasSpecificRisk = DOSSIER_SPECIFIC_RISK_TERMS.test(`${citation.label || ""} ${point}`);
  return !hasSpecificRisk || isPublicRiskEvidenceForCompany(citation, point, company);
}

function dossierCitationAnchorsLegalEntity(citation, company = {}) {
  if (citation?.source_kind !== "专业数据集") return false;
  const sourceText = normalizedCompanyIdentity(`${citation.label || ""} ${citation.summary || citation.excerpt || ""}`);
  const canonicalName = normalizedCompanyIdentity(company.name);
  const creditCode = normalizedCompanyIdentity(
    company.unified_social_credit_code || company.credit_code || "",
  );
  return Boolean(
    (canonicalName && sourceText.includes(canonicalName))
    || (creditCode && sourceText.includes(creditCode))
  );
}

function dossierGroundingErrors(citations = [], body = null, company = {}) {
  const citedIds = Array.isArray(body)
    ? new Set(body.flatMap((paragraph) => firstJsonArray(paragraph?.citation_ids).map(String)))
    : null;
  const used = citations.filter((citation) => !citedIds || citedIds.has(String(citation.id)));
  const errors = [];
  if (!used.length) errors.push("档案没有引用可展示的外部来源");
  if (!used.some((citation) => dossierCitationAnchorsLegalEntity(citation, company))) {
    errors.push("档案没有实际引用能够确认目标法定主体的专业来源");
  }
  return errors;
}

function isGenericCompanyLandingPage(source, point, company) {
  const label = normalizedCompanyIdentity(cleanPublicEvidenceLabel(source?.label));
  if (!label) return false;
  const genericLabel = companyIdentityAliases(company).some((alias) => {
    const remainder = label
      .split(alias).join("")
      .replace(/(?:官方网站|官网|首页|officialsite|official|website)/giu, "")
      .replace(/[a-z]{2,12}\d{0,6}/giu, "")
      .replace(/\d{2,8}/gu, "");
    return remainder.length === 0;
  });
  if (!genericLabel) return false;
  let rootPage = false;
  try {
    const url = new URL(String(source?.url || ""));
    rootPage = /^\/(?:index\.(?:html?|shtml))?$/iu.test(url.pathname || "/");
  } catch {
    rootPage = false;
  }
  return rootPage || !DOSSIER_ACTION_TERMS.test(`${point || ""} ${source?.label || ""}`);
}

function isRecentPublicDossierCitation(source, point, company) {
  const text = `${point || ""} ${source?.label || ""}`;
  return Boolean(
    point
    && isSubstantiveDossierEvidencePoint(point)
    && !isLowValuePublicDossierSource(source, point)
    && !isGenericCompanyLandingPage(source, point, company)
    && DOSSIER_ACTION_TERMS.test(text)
    && isPublicCitationRelevantToCompany(source, point, company)
  );
}

export function assessDossierEvidenceCoverage(company, collected = {}) {
  const professional = firstJsonArray(collected.professional)
    .map((source) => ({ ...source, source_kind: "专业数据集" }))
    .filter((source) => isDisplayableDossierCitation(source, company));
  const publicSources = firstJsonArray(collected.public_sources)
    .map((source) => ({ ...source, source_kind: "联网搜索" }))
    .filter((source) => isDisplayableDossierCitation(source, company));
  const recentPublic = publicSources.filter((source) => (
    isRecentPublicDossierCitation(source, concisePublicPoint(source), company)
  ));
  const riskSources = [
    ...professional.filter((source) => (
      /企业风险数据库/.test(String(source.label || ""))
      && !dossierBusinessEntityRecord(source)
    )),
    ...publicSources.filter((source) => (
      isPublicRiskEvidenceForCompany(source, concisePublicPoint(source), company)
    )),
  ];
  const operationsSources = [
    ...professional.filter((source) => (
      /金融数据库|汽车销量数据库|科研学术数据搜索服务/.test(String(source.label || ""))
      && !dossierBusinessEntityRecord(source)
    )),
    ...recentPublic.filter((source) => (
      DOSSIER_ACTION_TERMS.test(`${source.label || ""} ${concisePublicPoint(source)}`)
      && !DOSSIER_SPECIFIC_RISK_TERMS.test(`${source.label || ""} ${concisePublicPoint(source)}`)
    )),
  ];
  const procurementSources = recentPublic.filter((source) => (
    /招标|采购|中标|供应商|框架协议|项目/.test(`${source.label || ""} ${concisePublicPoint(source)}`)
  ));
  const publicHosts = new Set(
    publicSources.map((source) => publicSourceHostname(source.url)).filter(Boolean),
  );
  const coverage = {
    legal_entity: professional.some((source) => (
      /企业工商数据库/.test(String(source.label || ""))
      || dossierTextMentionsCompany(`${source.label || ""} ${source.summary || ""}`, company)
    )),
    operations: operationsSources.length > 0,
    recent_public: recentPublic.length > 0,
    risk: riskSources.length > 0,
    procurement_or_project: procurementSources.length > 0,
    public_host_count: publicHosts.size,
    usable_professional_count: professional.length,
    usable_public_count: publicSources.length,
  };
  coverage.missing_topics = [
    ...(!coverage.recent_public ? ["recent_public"] : []),
    ...(!coverage.operations ? ["operations"] : []),
    ...(!coverage.risk ? ["risk"] : []),
    ...(!coverage.procurement_or_project ? ["procurement_or_project"] : []),
    ...(coverage.public_host_count < Math.min(3, coverage.usable_public_count + 1)
      ? ["source_diversity"]
      : []),
  ];
  return coverage;
}

function publicDossierEvidenceScore(source, point, company) {
  if (isLowValuePublicDossierSource(source, point)) return -100;
  let score = dossierEvidencePointScore(point, { fromSummary: true });
  if (source?.published_at) score += 3;
  const authLevel = Number(source?.auth_level);
  if (Number.isFinite(authLevel) && authLevel > 0) score += Math.min(authLevel, 4);
  const sourceText = publicDossierSourceText(source, point);
  if (/(?:gov\.cn|cninfo\.com\.cn|sse\.com\.cn|szse\.cn)\b/iu.test(sourceText)) score += 5;
  if (/官方公告|投资者关系|证券交易所|政府网站|监管机构|官网新闻/iu.test(sourceText)) score += 3;
  if (isRecentPublicDossierCitation(source, point, company)) score += 4;
  return score;
}

function sourcePointList(sources, limit = 3) {
  return sources
    .slice(0, limit)
    .map((source) => shortSourcePoint(source))
    .filter(Boolean);
}

function isWeakCompanySituationText(value) {
  const text = String(value || "");
  return /专业数据库(?:返回|显示|依据|来源).*专业数据库/.test(text)
    || /专业数据集(?:返回|显示|依据|来源).*专业数据库/.test(text)
    || /只.*返回.*数据库/.test(text);
}

function isLowValueProfessionalPoint(value) {
  return /^企业ID\s*[\(（]\s*关联主键\s*[\)）]/.test(String(value || "").trim());
}

function isOverlongLatestText(value) {
  const text = String(value || "");
  return text.length > 420 || (/来源：|发布时间：|NYSE|HK/.test(text) && /联网搜索|公开来源/.test(text));
}

function extractSourceField(summary, key) {
  const match = String(summary || "").match(new RegExp(`${key}\\s*[：:]\\s*([^；;|。]+)`));
  return match ? match[1].trim() : "";
}

function conciseProfessionalPoint(source, targetCompanyName = "") {
  const summary = String(source?.summary || "");
  if (/公司名称|统一社会信用代码|法人姓名|法定代表人/.test(summary)) {
    const leadingCompanyName = summary.match(/^([^；;|。]{4,80})[；;]/)?.[1]?.trim() || "";
    const companyName = extractSourceField(summary, "公司名称")
      || extractSourceField(summary, "企业名称")
      || (
        targetCompanyName
        && normalizedCompanyIdentity(leadingCompanyName) === normalizedCompanyIdentity(targetCompanyName)
          ? leadingCompanyName
          : ""
      );
    if (
      targetCompanyName
      && companyName
      && normalizedCompanyIdentity(companyName) !== normalizedCompanyIdentity(targetCompanyName)
    ) {
      return "";
    }
    const creditCode = extractSourceField(summary, "统一社会信用代码");
    const legalPerson = extractSourceField(summary, "法人姓名") || extractSourceField(summary, "法定代表人");
    const address = extractSourceField(summary, "注册地址");
    const startedAt = extractSourceField(summary, "成立日期").slice(0, 10);
    const businessScope = extractSourceField(summary, "经营范围");
    return [
      companyName ? `公司名称：${companyName}` : "",
      creditCode ? `统一社会信用代码：${creditCode}` : "",
      legalPerson ? `法定代表人：${legalPerson}` : "",
      address ? `注册地址：${address}` : "",
      startedAt ? `成立日期：${startedAt}` : "",
      businessScope ? `经营范围：${businessScope}` : "",
    ].filter(Boolean).join("；");
  }
  return shortSourcePoint(source, 120);
}

function safeDeterministicDossierPoint(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const unsafeNumericClaim = /(?:注册资本|营业收入|营收|净利润|利润|融资|估值|回购|市值|市占率)[^。；\n]{0,48}\d/;
  const unsafeRiskClaim = /(?:(?:行政处罚|司法诉讼|失信被执行|限制高消费|经营异常|重大风险).{0,24}(?:存在|涉及|新增|发生|受到|列入|被执行|\d))|(?:(?:存在|涉及|新增|发生|受到|列入|被执行|\d).{0,24}(?:行政处罚|司法诉讼|失信被执行|限制高消费|经营异常|重大风险))/;
  return text
    .split(/(?<=[。！？])\s*|(?<=；)\s*/u)
    .map((item) => item.trim())
    .filter((item) => item && !unsafeNumericClaim.test(item) && !unsafeRiskClaim.test(item))
    .join("")
    .replace(/[。；\s]+$/u, "");
}

function dossierSalesThemes(values = [], company = {}) {
  const text = values.filter(Boolean).join(" ");
  const candidates = [
    [/知识库|知识管理|内容检索|智能问答/, "知识库与智能问答"],
    [/数据安全|隐私|合规|私有化|权限/, "数据安全与合规部署"],
    [/人工智能|大模型|智能化|算法/, "AI 应用与智能化升级"],
    [/储能|电池|电芯|锂电|光伏/, "储能与电池供应链"],
    [/汽车|车企|座舱|车主服务|新能源车/, "汽车智能化与车主服务"],
    [/供应链|采购|招标|中标|供应商/, "供应链与采购协同"],
    [/软件|系统|平台|SaaS/, "企业软件与系统集成"],
    [/产线|制造|工厂|设备|量产/, "生产制造与设备交付"],
  ]
    .filter(([pattern]) => pattern.test(text))
    .map(([, label]) => label);
  const industry = compactText(company?.industry || "", 40);
  if (industry && !candidates.includes(industry)) candidates.push(industry);
  return [...new Set(candidates)].slice(0, 3).length
    ? [...new Set(candidates)].slice(0, 3)
    : ["主营业务相关产品与服务"];
}

function dossierDisplayText(dossier) {
  return [
    dossier?.title,
    dossier?.summary,
    dossier?.memory_summary,
    ...firstJsonArray(dossier?.body).map((paragraph) => paragraph?.text),
  ].filter(Boolean).join(" ");
}

function isDisplayableDossier(dossier) {
  const text = dossierDisplayText(dossier);
  if (!compactText(dossier?.summary || firstJsonArray(dossier?.body)[0]?.text || dossier?.memory_summary, 80)) return false;
  if (hasTechnicalErrorText(text) || /这份档案需要重新获取|provider_error|fetch failed|鉴权失败|Unauthorized/.test(text)) {
    return false;
  }
  const body = firstJsonArray(dossier?.body);
  if (body.length !== DOSSIER_SECTION_TITLES.length) return false;
  const citationIds = new Set(firstJsonArray(dossier?.citations).map((item) => String(item?.id || "")));
  if (!citationIds.size) return false;
  if (dossierSectionContentErrors(body).length) return false;
  if (body.some((paragraph) => (
    !firstJsonArray(paragraph?.citation_ids).some((id) => citationIds.has(String(id)))
  ))) {
    return false;
  }
  return true;
}

function cleanMaterialText(value) {
  return normalizeImportedText(value)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 12000);
}

function isFeishuMaterial(material) {
  const identity = [
    material?.source_type,
    material?.title,
    material?.source_url,
  ].filter(Boolean).join(" ");
  return /(?:^|\b)feishu[_-]|lark|飞书|云文档|会议纪要|会话/i.test(identity);
}

function feishuMaterialSourceKind(material) {
  const sourceType = String(material?.source_type || "").toLowerCase();
  if (/feishu_(?:chat|p2p|search)|会话|群聊|单聊|消息/.test(sourceType)) return "飞书会话";
  if (/feishu_doc|云文档|会议纪要|文档/.test(sourceType)) return "云文档";
  return "飞书资料";
}

function canonicalOpenVikingResourceUri(value) {
  return String(value || "")
    .trim()
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .replace(/\.(?:md|markdown|txt)$/i, "")
    .toLowerCase();
}

function isOpenVikingOverviewItem(item) {
  const uri = String(item?.uri || "").replace(/[?#].*$/, "").replace(/\/+$/, "");
  const leaf = uri.split("/").pop() || "";
  const title = compactText(item?.title || item?.name || "", 80);
  return /^overview(?:\.(?:md|markdown|txt))?$/i.test(leaf)
    || /^overview$/i.test(title);
}

function sanitizeQaDisplayText(value) {
  const normalized = normalizeSalesText(value);
  const containsInternalImplementation = /(?:viking|openviking):\/\//i.test(normalized)
    || /\/materials(?:\/|\b)/i.test(normalized)
    || /\b(?:company|mat|sync)_[a-z0-9_-]{8,}\b/i.test(normalized)
    || /(?:内部|资源)?(?:目录|路径).{0,80}\bmaterials\b/i.test(normalized);
  if (containsInternalImplementation) {
    return "该历史回答包含内部实现信息，已隐藏；请重新提问以获取仅基于业务资料的回答。";
  }
  return normalized;
}

function qaDisplayCitationIdentity(citation, index = 0) {
  const materialId = compactText(citation?.material_id || "", 240);
  if (materialId) return `material:${materialId}`;
  const sourceKind = compactText(citation?.source_kind || "资料来源", 80);
  const label = compactText(citation?.label || "", 240);
  if (sourceKind === "企业档案") {
    return `dossier-section:${label || index}`;
  }
  const uri = canonicalOpenVikingResourceUri(citation?.uri || "");
  if (uri) return `uri:${uri}`;
  const url = publicSourceUrl(citation?.url);
  if (url) return `url:${url}`;
  return `source:${sourceKind}:${label || index}`;
}

function mergeQaDisplayCitations(message) {
  const groups = [];
  const groupByIdentity = new Map();
  const citationIdMap = new Map();
  firstJsonArray(message?.citations).forEach((citation, index) => {
    const originalId = String(citation?.id || index + 1);
    const identity = qaDisplayCitationIdentity(citation, index);
    let group = groupByIdentity.get(identity);
    if (!group) {
      group = {
        citation: {
          ...citation,
          id: String(groups.length + 1),
        },
        original_ids: [],
      };
      groups.push(group);
      groupByIdentity.set(identity, group);
    }
    group.original_ids.push(originalId);
    citationIdMap.set(originalId, String(group.citation.id));
  });
  const remapIds = (ids) => [...new Set(
    firstJsonArray(ids)
      .map((id) => citationIdMap.get(String(id)))
      .filter(Boolean),
  )];
  return {
    citations: groups.map((group) => group.citation),
    citation_ids: remapIds(message?.citation_ids),
    paragraphs: firstJsonArray(message?.paragraphs).map((paragraph) => ({
      ...paragraph,
      citation_ids: remapIds(paragraph?.citation_ids),
    })),
  };
}

function hasLegacyGenericQaCitations(message) {
  return firstJsonArray(message?.citations).some((citation) => {
    const sourceKind = compactText(citation?.source_kind || "", 80);
    const label = compactText(citation?.label || "", 240);
    return sourceKind === "内部资料" || label === "内部资料";
  });
}

function progressLevel(label) {
  const text = String(label || "");
  if (/签约|成交|已确认|方案|推进/.test(text)) return 78;
  if (/需求确认/.test(text)) return 58;
  if (/初步|接触/.test(text)) return 34;
  if (/暂无|不足/.test(text)) return 12;
  if (/新商机/.test(text)) return 22;
  return 42;
}

function normalizedSalesStatus(label) {
  const text = String(label || "");
  if (/签约|成交|归档|已成交/.test(text)) return "成交归档";
  if (/方案|报价|商务|推进/.test(text)) return "商务推进";
  if (/需求确认|需求/.test(text)) return "需求确认中";
  if (/初步|接触/.test(text)) return "初步接触";
  if (/暂无|不足/.test(text)) return "暂无有效信号";
  return "新商机";
}

function conciseProgressSummary(label, summary = "") {
  const status = normalizedSalesStatus(label);
  const text = compactText(summary, 220);
  if (text && text.length <= 28 && !/最近档案|企业情况|近期动态|销售判断|下一步建议|专业数据库|联网搜索|但|需要/.test(text)) {
    return text;
  }
  const fallback = {
    新商机: "已加入目标企业池，当前无历史资料，待生成最新档案。",
    初步接触: "已完成基础信息了解，尚未形成明确采购计划。",
    需求确认中: "已识别数据安全与私有化部署需求，待确认预算和排期。",
    商务推进: "已进入方案沟通阶段，待确认商务条件和决策流程。",
    成交归档: "已完成合作归档，后续关注续约和扩展机会。",
    暂无有效信号: "当前资料不足，需先补充有效企业信息。",
  };
  return fallback[status] || "当前进度待补充。";
}

function normalizeSalesText(value) {
  return String(value || "");
}

export class SalesService {
  constructor(options = {}) {
    this.env = options.env || createEnvReader();
    this.runtimePolicy = options.runtimePolicy || createRuntimePolicy({ env: this.env });
    const initialData = options.seed !== undefined ? options.seed : emptySalesData();
    this.data = clone(initialData);
    this.data.jobs = this.data.jobs || {};
    this.dataProProvider = options.dataProProvider || null;
    this.webSearchProvider = options.webSearchProvider || null;
    this.modelProvider = options.modelProvider || null;
    this.openVikingProvider = options.openVikingProvider || null;
    this.repository = options.repository || null;
    this.workspaceId = String(this.env.value("APP_WORKSPACE_ID", "local-workspace") || "local-workspace").trim();
    this.qaAutoCommitEvery = Math.max(0, Math.min(
      20,
      Number(this.env.value("OPENVIKING_QA_AUTO_COMMIT_EVERY", "4")) || 0,
    ));
    this.qaKeepRecentMessages = Math.max(0, Math.min(
      40,
      Number(this.env.value("OPENVIKING_QA_KEEP_RECENT_MESSAGES", "6")) || 0,
    ));
    this.asyncJobsEnabled = enabled(this.env.value(
      "ASYNC_JOBS_ENABLED",
      "true",
    ));
    this.dossierCheckpointTtlMs = Math.max(
      5 * 60_000,
      Math.min(
        2 * 60 * 60_000,
        Number(this.env.value("DOSSIER_CHECKPOINT_TTL_MS", "1800000")) || 1_800_000,
      ),
    );
    this.dossierDataProConcurrency = Math.max(
      1,
      Math.min(3, Number(this.env.value("DOSSIER_DATAPRO_CONCURRENCY", "2")) || 2),
    );
    this.dossierWebConcurrency = Math.max(
      1,
      Math.min(4, Number(this.env.value("DOSSIER_WEB_CONCURRENCY", "3")) || 3),
    );
    this.providerRuns = options.providerRunStore || new ProviderRunStore({
      repository: this.repository,
      failOnPersistenceError: this.runtimePolicy.fail_closed,
      circuitBreaker: options.providerCircuitBreaker || new ProviderCircuitBreaker({
        enabled: enabled(this.env.value(
          "PROVIDER_CIRCUIT_BREAKER_ENABLED",
          "true",
        )),
        failureThreshold: Number(this.env.value("PROVIDER_CIRCUIT_BREAKER_FAILURE_THRESHOLD", "5")),
        cooldownSeconds: Number(this.env.value("PROVIDER_CIRCUIT_BREAKER_COOLDOWN_SECONDS", "60")),
      }),
    });
    this.paidWorkflowGuard = options.paidWorkflowGuard || new PaidWorkflowGuard({
      env: this.env,
      repository: this.repository,
      failClosed: this.runtimePolicy.fail_closed,
      listLocalJobs: () => Object.values(this.data.jobs || {}),
    });
    this.persistence = { enabled: false, last_error: null };
    this.lastPersistedRefreshAt = 0;
    this.persistedRefreshPromise = null;
    this.initialization = this.loadPersistedState();
  }

  async loadPersistedState() {
    if (typeof this.repository?.getSalesState !== "function") return;
    try {
      const state = await this.repository.getSalesState(this.data);
      if (state && Array.isArray(state.goals)) {
        this.data = {
          goals: state.goals,
          companies: state.companies || {},
          dossiers: state.dossiers || {},
          materials: state.materials || {},
          qa_messages: state.qa_messages || {},
          sync_sources: state.sync_sources || {},
          sync_checkpoints: state.sync_checkpoints || {},
          jobs: state.jobs || {},
        };
      }
      this.persistence = { enabled: true, last_error: null };
      this.lastPersistedRefreshAt = Date.now();
    } catch (error) {
      this.persistence = { enabled: false, last_error: error.message };
    }
  }

  async refreshPersistedState(options = {}) {
    await this.initialization;
    if (typeof this.repository?.getSalesState !== "function") return false;
    const minIntervalMs = Math.max(0, Number(options.minIntervalMs ?? 250) || 0);
    if (!options.force && Date.now() - this.lastPersistedRefreshAt < minIntervalMs) return false;
    if (this.persistedRefreshPromise) return this.persistedRefreshPromise;

    const refresh = this.loadPersistedState().then(() => {
      if (this.runtimePolicy.fail_closed && !this.persistence.enabled) {
        throw providerUnavailable("supabase", "Persistent storage refresh failed.", {
          reason: this.persistence.last_error || "repository_refresh_failed",
        });
      }
      return true;
    });
    this.persistedRefreshPromise = refresh.finally(() => {
      this.persistedRefreshPromise = null;
    });
    return this.persistedRefreshPromise;
  }

  async assertRuntimeReady() {
    await this.initialization;
    if (this.runtimePolicy.fail_closed && !this.persistence.enabled) {
      throw providerUnavailable("supabase", "Persistent storage is unavailable.", {
        reason: this.persistence.last_error || "repository_not_ready",
      });
    }
  }

  async persist(operation) {
    await this.initialization;
    if (!this.persistence.enabled || !this.repository) return null;
    try {
      const result = await operation();
      this.persistence.last_error = null;
      return result;
    } catch (error) {
      this.persistence.last_error = error.message;
      if (this.runtimePolicy.fail_closed) {
        throw providerUnavailable("supabase", "Persistent storage write failed.", {
          reason: error.message || "repository_write_failed",
        });
      }
      return null;
    }
  }

  async listProviderRuns(filters = {}) {
    return (await this.providerRuns.list(filters)).map((run) => this.publicProviderRun(run));
  }

  async getProviderRun(runId) {
    const run = await this.providerRuns.get(runId);
    if (!run) {
      throw new HttpError(404, "provider_run_not_found", "Provider 运行记录不存在。", {
        provider_run_id: runId,
      });
    }
    return this.publicProviderRun(run);
  }

  publicProviderRun(run) {
    return {
      id: run.id,
      operation: run.operation,
      status: run.status,
      entity_type: run.entity_type || "",
      entity_id: run.entity_id || "",
      job_id: run.job_id || null,
      started_at: run.started_at || null,
      finished_at: run.finished_at || null,
      duration_ms: run.duration_ms ?? null,
      error: run.error ? clone(run.error) : null,
      steps: firstJsonArray(run.steps).map((step) => ({
        id: step.id,
        sequence: step.sequence,
        provider: step.provider,
        operation: step.operation,
        status: step.status,
        input_summary: step.input_summary || "",
        output_summary: step.output_summary || "",
        usage: step.usage ? clone(step.usage) : null,
        attempts: step.attempts,
        started_at: step.started_at || null,
        finished_at: step.finished_at || null,
        latency_ms: step.latency_ms ?? null,
        error: step.error ? clone(step.error) : null,
      })),
    };
  }

  async requireJob(jobId, options = {}) {
    await this.assertRuntimeReady();
    let job = this.data.jobs?.[jobId] || null;
    if ((options.refresh || !job) && typeof this.repository?.getJob === "function" && this.persistence.enabled) {
      const persisted = await this.repository.getJob(jobId);
      if (persisted) {
        job = persisted;
        this.data.jobs[job.id] = job;
      }
    }
    if (!job) throw new HttpError(404, "job_not_found", "任务记录不存在。", { job_id: jobId });
    return job;
  }

  async startJob(input = {}) {
    if (input.retry_job_id) {
      const existing = await this.requireJob(input.retry_job_id, { refresh: true });
      if (!["failed", "cancelled"].includes(existing.status)) {
        throw new HttpError(409, "job_not_retryable", "只有失败或已取消的任务可以重试。", {
          job_id: existing.id,
          status: existing.status,
        });
      }
      if (Number(existing.attempt_count || 0) >= Number(existing.max_attempts || 1)) {
        throw new HttpError(409, "job_attempts_exhausted", "任务已达到最大执行次数。", {
          job_id: existing.id,
          attempt_count: Number(existing.attempt_count || 0),
          max_attempts: Number(existing.max_attempts || 1),
        });
      }
      if (input.job_type && input.job_type !== existing.job_type) {
        throw new HttpError(409, "job_type_mismatch", "重试任务类型与原任务不一致。", { job_id: existing.id });
      }
      existing.status = "running";
      existing.attempt_count = Number(existing.attempt_count || 0) + 1;
      existing.started_at = nowIso();
      existing.finished_at = null;
      existing.error = null;
      existing.result_ref = null;
      existing.result = null;
      existing.cancel_requested_at = null;
      existing.updated_at = existing.started_at;
      existing.is_paid = input.is_paid !== false;
      return this.reserveJob(existing);
    }

    const createdAt = nowIso();
    const job = {
      id: makeId("job"),
      job_type: String(input.job_type || "workflow"),
      status: "running",
      entity_type: String(input.entity_type || ""),
      entity_id: String(input.entity_id || ""),
      idempotency_key: input.idempotency_key || null,
      request: clone(input.request || {}),
      attempt_count: 1,
      max_attempts: Math.max(1, Number(input.max_attempts || 1)),
      scheduled_at: createdAt,
      started_at: createdAt,
      finished_at: null,
      error: null,
      result_ref: null,
      result: null,
      is_paid: input.is_paid !== false,
      created_at: createdAt,
      updated_at: createdAt,
    };
    return this.reserveJob(job);
  }

  publicJob(job) {
    if (!job) return null;
    const status = String(job.status || "queued");
    const stage = String(job.stage || status || "queued");
    const retryable = ["failed", "cancelled"].includes(status)
      && Number(job.attempt_count || 0) < Number(job.max_attempts || 1);
    const safeResult = job.result && typeof job.result === "object"
      ? Object.fromEntries(Object.entries(job.result).filter(([key]) => [
        "action",
        "dossier_id",
        "version_no",
        "status",
        "material_count",
        "failed_count",
      ].includes(key)))
      : null;
    return {
      id: job.id,
      job_type: job.job_type,
      status,
      stage,
      stage_label: JOB_STAGE_LABELS[stage] || JOB_STAGE_LABELS[status] || "正在处理",
      stage_detail: safeJobProgressDetail(job.progress_detail),
      progress: Math.max(0, Math.min(Number(job.progress ?? (status === "succeeded" ? 100 : 0)), 100)),
      entity_type: job.entity_type || "",
      entity_id: job.entity_id || "",
      attempt_count: Number(job.attempt_count || 0),
      max_attempts: Number(job.max_attempts || 1),
      retryable,
      error: job.error ? {
        code: String(job.error.code || "workflow_failed"),
        message: status === "failed" ? "任务执行失败，请重试或联系管理员。" : "",
      } : null,
      result: safeResult && Object.keys(safeResult).length ? safeResult : null,
      scheduled_at: job.scheduled_at || null,
      started_at: job.started_at || null,
      finished_at: job.finished_at || null,
      created_at: job.created_at || null,
      updated_at: job.updated_at || null,
    };
  }

  async enqueueJob(input = {}) {
    await this.assertRuntimeReady();
    const createdAt = nowIso();
    const job = {
      id: makeId("job"),
      job_type: String(input.job_type || "workflow"),
      status: "queued",
      stage: "queued",
      progress: 0,
      checkpoint: {},
      progress_detail: {},
      entity_type: String(input.entity_type || ""),
      entity_id: String(input.entity_id || ""),
      idempotency_key: input.idempotency_key || null,
      request: clone(input.request || {}),
      attempt_count: 0,
      max_attempts: Math.max(1, Number(input.max_attempts || 3)),
      scheduled_at: input.scheduled_at || createdAt,
      started_at: null,
      finished_at: null,
      error: null,
      result_ref: null,
      result: null,
      is_paid: input.is_paid !== false,
      created_by: input.created_by || null,
      created_at: createdAt,
      updated_at: createdAt,
    };

    let queued = job;
    if (typeof this.repository?.enqueueJob === "function" && this.persistence.enabled) {
      queued = await this.persist(() => this.repository.enqueueJob(job));
      if (!queued) {
        throw new HttpError(503, "job_queue_unavailable", "后台任务队列暂不可用，任务未执行。");
      }
    } else {
      if (this.runtimePolicy.fail_closed) {
        throw new HttpError(503, "job_queue_unavailable", "后台任务队列暂不可用，任务未执行。");
      }
      this.data.jobs[job.id] = job;
      await this.persist(() => this.repository.persistJob(job));
    }
    this.data.jobs[queued.id] = queued;
    return clone(queued);
  }

  async enqueueDossier(companyId, body = {}, options = {}) {
    const company = this.requireCompany(companyId);
    return this.publicJob(await this.enqueueJob({
      job_type: "sales_dossier_generation",
      entity_type: "target_enterprise",
      entity_id: company.id,
      max_attempts: 3,
      idempotency_key: body.idempotency_key || null,
      request: { ...body, idempotency_key: undefined },
      created_by: options.created_by || null,
    }));
  }

  async enqueueMaterialsToOpenViking(companyId, options = {}) {
    const company = this.requireCompany(companyId);
    const materials = (company.material_ids || []).map((id) => this.data.materials[id]).filter(Boolean);
    if (!materials.length) {
      return {
        status: "skipped",
        summary: "当前企业还没有可同步的历史资料。",
        records: [],
      };
    }
    return this.publicJob(await this.enqueueJob({
      job_type: "sales_material_openviking_sync",
      entity_type: "target_enterprise",
      entity_id: company.id,
      max_attempts: 3,
      idempotency_key: options.idempotency_key || null,
      request: { material_count: materials.length },
      created_by: options.created_by || null,
    }));
  }

  async activateClaimedJob(input, expectedType) {
    const job = clone(input || {});
    if (!job.id || job.status !== "running" || job.job_type !== expectedType || !job.worker_id) {
      throw new HttpError(409, "job_claim_invalid", "后台任务领取状态无效，未执行外部调用。");
    }
    const reserved = await this.reserveJob(job);
    return this.assertJobActive(reserved.id);
  }

  async executeQueuedJob(input, options = {}) {
    await this.loadPersistedState();
    await this.assertRuntimeReady();
    const job = await this.requireJob(input.id, { refresh: true });
    if (job.status !== "running" || job.worker_id !== options.worker_id) {
      throw new HttpError(409, "job_claim_lost", "后台任务领取权已失效。");
    }
    await this.assertJobActive(job.id);
    const workflowOptions = {
      claimed_job: job,
      report_progress: options.report_progress,
      save_checkpoint: options.save_checkpoint,
    };
    if (job.job_type === "sales_dossier_generation") {
      return this.createDossier(job.entity_id, job.request || {}, workflowOptions);
    }
    if (job.job_type === "sales_material_openviking_sync") {
      return this.syncMaterialsToOpenViking(job.entity_id, workflowOptions);
    }
    throw new HttpError(422, "job_type_unsupported", "后台任务类型暂不支持执行。", {
      job_type: job.job_type,
    });
  }

  async reserveJob(job) {
    const reservation = await this.paidWorkflowGuard.reserve(job);
    const reservedJob = {
      ...reservation.job,
      usage_budget: reservation.budget || null,
    };
    this.data.jobs[reservedJob.id] = reservedJob;
    if (typeof this.repository?.reservePaidWorkflow !== "function") {
      await this.persist(() => this.repository.persistJob(reservedJob));
    }
    return clone(reservedJob);
  }

  async persistTerminalJob(job) {
    if (job.is_paid && job.reservation_id) {
      await this.paidWorkflowGuard.finish(job);
      if (typeof this.repository?.finishPaidWorkflow === "function") return clone(job);
    }
    await this.persist(() => this.repository.persistJob(job));
    return clone(job);
  }

  async completeJob(jobId, input = {}) {
    const job = await this.requireJob(jobId, { refresh: true });
    if (["cancelled", "failed"].includes(job.status)) return clone(job);
    if (job.cancel_requested_at && this.asyncJobsEnabled && ASYNC_JOB_TYPES.has(job.job_type)) {
      await this.acknowledgeJobCancellation(job);
      throw new HttpError(409, "job_cancelled", "任务已取消，结果不会继续提交。", {
        job_id: job.id,
      });
    }
    job.status = "succeeded";
    job.finished_at = nowIso();
    job.updated_at = job.finished_at;
    job.result_ref = input.result_ref || null;
    job.result = input.result || null;
    return this.persistTerminalJob(job);
  }

  async failJob(jobId, error = {}) {
    const job = await this.requireJob(jobId, { refresh: true });
    if (["cancelled", "failed"].includes(job.status)) return clone(job);
    if (job.cancel_requested_at && this.asyncJobsEnabled && ASYNC_JOB_TYPES.has(job.job_type)) {
      return this.acknowledgeJobCancellation(job);
    }
    job.status = "failed";
    job.finished_at = nowIso();
    job.updated_at = job.finished_at;
    job.error = {
      code: String(error.code || "workflow_failed"),
      message: String(error.message || "Workflow failed."),
      retryable: Boolean(error.retryable),
      validation_errors: safeValidationErrors(
        error.details?.validation_errors || error.validation_errors,
      ),
    };
    return this.persistTerminalJob(job);
  }

  async assertJobActive(jobId) {
    const job = await this.requireJob(jobId, { refresh: true });
    if (job.status === "cancelled" || job.cancel_requested_at) {
      if (job.status !== "cancelled") await this.acknowledgeJobCancellation(job);
      throw new HttpError(409, "job_cancelled", "任务已取消，后续步骤不会继续执行。", {
        job_id: job.id,
      });
    }
    return job;
  }

  async acknowledgeJobCancellation(input) {
    const job = typeof input === "string"
      ? await this.requireJob(input, { refresh: true })
      : clone(input);
    if (job.status === "cancelled") return job;

    if (typeof this.repository?.acknowledgeJobCancellation === "function"
      && this.persistence.enabled
      && job.worker_id) {
      const cancelled = await this.persist(
        () => this.repository.acknowledgeJobCancellation(job.id, job.worker_id),
      );
      if (cancelled) {
        this.data.jobs[cancelled.id] = cancelled;
        return clone(cancelled);
      }
    }

    const cancelledAt = job.cancel_requested_at || nowIso();
    job.status = "cancelled";
    job.stage = "cancelled";
    job.cancel_requested_at = cancelledAt;
    job.finished_at = cancelledAt;
    job.updated_at = cancelledAt;
    job.worker_id = null;
    job.lease_expires_at = null;
    job.error = null;
    this.data.jobs[job.id] = job;
    return this.persistTerminalJob(job);
  }

  async cancelJob(jobId) {
    const job = await this.requireJob(jobId, { refresh: true });
    if (job.status === "cancelled") return clone(job);
    if (!["queued", "running"].includes(job.status)) {
      throw new HttpError(409, "job_not_cancellable", "只有等待中或执行中的任务可以取消。", {
        job_id: job.id,
        status: job.status,
      });
    }
    if (this.asyncJobsEnabled
      && ASYNC_JOB_TYPES.has(job.job_type)
      && typeof this.repository?.requestJobCancellation === "function"
      && this.persistence.enabled) {
      const requested = await this.persist(() => this.repository.requestJobCancellation(job.id));
      if (requested) {
        this.data.jobs[requested.id] = requested;
        return clone(requested);
      }
    }
    const cancelledAt = nowIso();
    job.status = "cancelled";
    job.cancel_requested_at = cancelledAt;
    job.finished_at = cancelledAt;
    job.updated_at = cancelledAt;
    job.error = null;
    return this.persistTerminalJob(job);
  }

  async retryJob(jobId) {
    const job = await this.requireJob(jobId, { refresh: true });
    if (!["failed", "cancelled"].includes(job.status)) {
      throw new HttpError(409, "job_not_retryable", "只有失败或已取消的任务可以重试。", {
        job_id: job.id,
        status: job.status,
      });
    }
    if (this.asyncJobsEnabled && ASYNC_JOB_TYPES.has(job.job_type)) {
      if (Number(job.attempt_count || 0) >= Number(job.max_attempts || 1)) {
        throw new HttpError(409, "job_attempts_exhausted", "任务已达到最大执行次数。", {
          job_id: job.id,
          attempt_count: Number(job.attempt_count || 0),
          max_attempts: Number(job.max_attempts || 1),
        });
      }
      if (typeof this.repository?.retryQueuedJob !== "function") {
        throw new HttpError(503, "job_queue_unavailable", "后台任务队列暂不可用，无法重试。");
      }
      const queued = await this.persist(() => this.repository.retryQueuedJob(job.id));
      this.data.jobs[queued.id] = queued;
      return this.publicJob(queued);
    }
    if (job.job_type === "sales_dossier_generation") {
      return this.createDossier(job.entity_id, job.request || {}, { retry_job_id: job.id });
    }
    if (job.job_type === "sales_qa") {
      return this.askQuestion(job.entity_id, job.request || {}, { retry_job_id: job.id });
    }
    if (job.job_type === "sales_company_search") {
      return this.searchCompanies(job.entity_id, job.request || {}, { retry_job_id: job.id });
    }
    throw new HttpError(422, "job_retry_unsupported", "该任务类型暂不支持手动重试。", {
      job_id: job.id,
      job_type: job.job_type,
    });
  }

  async listJobs(filters = {}) {
    await this.assertRuntimeReady();
    if (typeof this.repository?.listJobs === "function" && this.persistence.enabled) {
      return this.repository.listJobs(filters);
    }
    const requestedLimit = Number(filters.limit || 20);
    const limit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 20, 100));
    return Object.values(this.data.jobs || {})
      .filter((job) => !filters.job_type || job.job_type === filters.job_type)
      .filter((job) => !filters.status || job.status === filters.status)
      .filter((job) => !filters.entity_id || job.entity_id === filters.entity_id)
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
      .slice(0, limit)
      .map(clone);
  }

  async getJob(jobId) {
    return clone(await this.requireJob(jobId, { refresh: true }));
  }

  async listPublicJobs(filters = {}) {
    return (await this.listJobs(filters)).map((job) => this.publicJob(job));
  }

  async getPublicJob(jobId) {
    return this.publicJob(await this.requireJob(jobId, { refresh: true }));
  }

  async getPaidWorkflowUsage() {
    await this.assertRuntimeReady();
    return this.paidWorkflowGuard.snapshot();
  }

  trackProviderStep(runId, input, operation) {
    if (!runId) return operation();
    return this.providerRuns.executeStep(runId, input, operation);
  }

  async skipProviderStep(runId, input) {
    if (!runId) return null;
    return this.providerRuns.skipStep(runId, input);
  }

  listGoals() {
    return this.data.goals.map((goal) => this.goalView(goal));
  }

  exportWorkspaceData() {
    const goals = this.data.goals.map((goal) => ({
      ...this.goalView(goal),
      target_enterprise_ids: [...new Set(goal.company_ids || [])],
      candidate_company_ids: [...new Set(goal.candidate_ids || [])],
    }));
    const goalIdsByCompany = new Map();
    for (const goal of this.data.goals) {
      for (const companyId of goal.company_ids || []) {
        const goalIds = goalIdsByCompany.get(companyId) || [];
        goalIds.push(goal.id);
        goalIdsByCompany.set(companyId, goalIds);
      }
    }

    const enterprises = Object.values(this.data.companies)
      .filter(Boolean)
      .sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "zh-CN"))
      .map((company) => {
        const materials = (company.material_ids || [])
          .map((id) => this.data.materials[id])
          .filter(Boolean)
          .map((material) => ({
            id: material.id,
            company_id: company.id,
            title: String(material.title || ""),
            summary: String(material.summary || ""),
            source_type: String(material.source_type || ""),
            source_url: publicSourceUrl(material.source_url),
            source_id: material.source_id || null,
            source_external_id: material.source_external_id || "",
            source_version: material.source_version || "",
            content_hash: material.content_hash || null,
            raw_text: normalizeImportedText(material.text || ""),
            source_items: normalizeSourceItems(material.source_items || []),
            occurred_at: material.occurred_at || null,
            last_synced_at: material.last_synced_at || null,
            created_at: material.created_at || null,
            updated_at: material.updated_at || material.created_at || null,
          }));
        const materialSources = this.listMaterialSyncSources(company.id).map((source) => ({
          id: source.id,
          source_type: source.source_type,
          external_id: source.external_id,
          display_name: source.display_name,
          status: source.status,
          material_ids: source.material_ids,
          last_synced_at: source.last_synced_at,
          updated_at: source.updated_at,
          checkpoint: source.checkpoint ? {
            checkpoint_key: source.checkpoint.checkpoint_key,
            checkpoint_value: source.checkpoint.checkpoint_value,
            last_success_at: source.checkpoint.last_success_at,
            updated_at: source.checkpoint.updated_at,
          } : null,
        }));
        return {
          ...this.companyView(company, { in_pool: (goalIdsByCompany.get(company.id) || []).length > 0 }),
          goal_ids: goalIdsByCompany.get(company.id) || [],
          progress_detail: this.progressView(company),
          dossiers: (company.dossier_ids || [])
            .map((id) => this.data.dossiers[id])
            .filter(Boolean)
            .map((dossier) => this.publicDossier(dossier)),
          materials,
          material_sources: materialSources,
          qa: this.cachedQa(company.id),
        };
      });

    return {
      format: "sales-intelligence-workbench-workspace-export",
      format_version: 1,
      exported_at: nowIso(),
      scope: "single_workspace",
      contains_private_business_data: true,
      goals,
      enterprises,
    };
  }

  async createGoal(body = {}) {
    const name = String(body.name || "").trim();
    if (!name) throw new HttpError(400, "bad_request", "销售目标名称不能为空。");
    const now = nowIso();
    const goal = {
      id: makeId("sales_goal"),
      name,
      description: String(body.description || "新的销售目标，等待查找并加入目标企业。").trim(),
      keywords: Array.isArray(body.keywords) ? body.keywords.map((item) => String(item).trim()).filter(Boolean) : [],
      company_ids: [],
      candidate_ids: [],
      created_at: now,
      updated_at: now,
    };
    this.data.goals.unshift(goal);
    await this.persist(() => this.repository.persistSalesGoal(goal));
    return this.goalView(goal);
  }

  getGoal(goalId) {
    const goal = this.data.goals.find((item) => item.id === goalId);
    if (!goal) throw new HttpError(404, "sales_goal_not_found", "销售目标不存在。", { goal_id: goalId });
    return goal;
  }

  goalView(goal) {
    const companies = (goal.company_ids || []).map((id) => this.data.companies[id]).filter(Boolean);
    return {
      id: goal.id,
      name: goal.name,
      description: String(goal.description || "").replace(/^新建/, "新的"),
      stats: `${companies.length} 家企业`,
      keywords: goal.keywords || [],
      created_at: goal.created_at,
      updated_at: goal.updated_at,
    };
  }

  companyView(company, options = {}) {
    if (!company) return null;
    const progress = company.progress || {};
    const progressFallback = "当前资料不足，需要补充最新档案或历史沟通资料。";
    const status = progress.label || options.status || "新商机";
    return {
      id: company.id,
      name: company.name,
      initial: company.initial || normalizeInitial(company.name),
      industry: company.industry || "企业",
      location: company.location || "",
      tags: company.tags || [company.industry, company.location].filter(Boolean),
      status,
      progress: conciseProgressSummary(status, businessText(progress.summary, progressFallback)),
      evidence: businessText(progress.evidence, "依据：当前企业档案", 180),
      progress_level: progressLevel(status),
      updated_at: progress.updated_at || company.updated_at || null,
      identity_status: company.identity_status || "unverified",
      unified_social_credit_code: company.unified_social_credit_code || "",
      legal_representative: company.legal_representative || "",
      registered_capital: company.registered_capital || "",
      business_status: company.business_status || "",
      registered_address: company.registered_address || "",
      established_at: company.established_at || "",
      professional_verified_at: company.professional_verified_at || null,
      in_pool: Boolean(options.in_pool),
      reason: options.reason || "",
    };
  }

  listTargetEnterprises(goalId) {
    const goal = this.getGoal(goalId);
    return (goal.company_ids || []).map((id) => this.companyView(this.data.companies[id], { in_pool: true })).filter(Boolean);
  }

  async searchCompanies(goalId, body = {}, options = {}) {
    const goal = this.getGoal(goalId);
    const query = String(body.query || "").trim();
    if (!query) return [];
    const job = await this.startJob({
      job_type: "sales_company_search",
      entity_type: "sales_goal",
      entity_id: goal.id,
      max_attempts: 3,
      request: { query },
      retry_job_id: options.retry_job_id || "",
    });
    let run = null;
    try {
      run = await this.providerRuns.startRun({
        operation: "sales_company_search",
        entity_type: "sales_goal",
        entity_id: goal.id,
        job_id: job.id,
      });
      const searchText = query;
      const localCandidates = this.localCompanySearch(goal, searchText);
      const realEvidence = await this.collectSearchEvidence(searchText, run.id);
      await this.assertJobActive(job.id);
      const professionalCandidates = await this.professionalCompaniesFromEvidence(realEvidence);
      const candidates = [...new Map(
        [...professionalCandidates, ...localCandidates].map((company) => [company.id, company]),
      ).values()].slice(0, 8);

      if (!candidates.length && query) {
        if (this.runtimePolicy.fail_closed) {
          throw providerUnavailable("datapro", "Professional data did not return an identifiable company entity.", {
            reason: "company_identity_unavailable",
            raw_ref: realEvidence.professional?.raw_ref || null,
          });
        }
        const company = await this.createCompanyFromQuery(query, realEvidence);
        goal.candidate_ids = [company.id, ...(goal.candidate_ids || []).filter((id) => id !== company.id)];
        const results = [this.companyView(company, {
          reason: "未识别到可核验企业主体，已保留为待确认候选。",
          in_pool: goal.company_ids.includes(company.id),
          provider_run_id: run.id,
          job_id: job.id,
        })];
        results[0].provider_run_id = run.id;
        results[0].job_id = job.id;
        await this.persist(() => this.repository.persistSalesGoal(goal));
        await this.persist(() => this.repository.persistSalesSearchResults(goal.id, query, results));
        await this.providerRuns.completeRun(run.id, { result_ref: `sales_search:${goal.id}:${results.length}` });
        await this.completeJob(job.id, {
          result_ref: `sales_search:${goal.id}:${results.length}`,
          result: { candidate_ids: results.map((item) => item.id) },
        });
        return results;
      }

      goal.candidate_ids = [...new Set(candidates.map((item) => item.id))];
      const results = candidates.map((company) => ({
        ...this.companyView(company, {
          reason: company.identity_status === "verified"
            ? realEvidence.public_sources.length
              ? "专业数据集已核验该企业主体，并已补充公开来源。"
              : "专业数据集已核验该企业主体；联网公开信息暂不可用，可先加入企业池。"
            : realEvidence.summary || "与当前销售目标关键词匹配。",
          in_pool: goal.company_ids.includes(company.id),
        }),
        warnings: [...realEvidence.issues],
        provider_run_id: run.id,
        job_id: job.id,
      }));
      await this.persist(() => this.repository.persistSalesGoal(goal));
      await this.persist(() => this.repository.persistSalesSearchResults(goal.id, query, results));
      await this.providerRuns.completeRun(run.id, { result_ref: `sales_search:${goal.id}:${results.length}` });
      await this.completeJob(job.id, {
        result_ref: `sales_search:${goal.id}:${results.length}`,
        result: { candidate_ids: results.map((item) => item.id) },
      });
      return results;
    } catch (error) {
      if (run) {
        try {
          if (error.code === "job_cancelled") {
            await this.providerRuns.cancelRun(run.id, { summary: "企业搜索任务已由用户取消。" });
          } else {
            await this.providerRuns.failRun(run.id, {
              code: error.code || "company_search_failed",
              message: error.message || "Company search failed.",
              category: error.category || "workflow",
              retryable: error.retryable,
            });
          }
        } catch (persistenceError) {
          if (this.runtimePolicy.fail_closed) throw persistenceError;
        }
      }
      await this.failJob(job.id, error);
      throw error;
    }
  }

  defaultCandidateIds(goal) {
    return [...(goal.candidate_ids || [])];
  }

  defaultCandidateCompanies(goal) {
    return this.defaultCandidateIds(goal).map((id) => this.data.companies[id]).filter(Boolean);
  }

  localCompanySearch(goal, query) {
    const text = String(query || "").toLowerCase();
    const ids = goal.candidate_ids || [];
    const fromGoal = ids.map((id) => this.data.companies[id]).filter(Boolean);
    const allCompanies = Object.values(this.data.companies);
    const searched = allCompanies.filter((company) => {
      const haystack = [company.name, company.industry, company.location, ...(company.tags || [])].join(" ").toLowerCase();
      return text ? haystack.includes(text) || text.split(/\s+/).some((part) => part && haystack.includes(part)) : ids.includes(company.id);
    });
    if (text && searched.length) return searched.slice(0, 8);
    return [...new Map([...searched, ...fromGoal].map((company) => [company.id, company])).values()].slice(0, 8);
  }

  async professionalCompaniesFromEvidence(evidence = {}) {
    const source = evidence.professional;
    if (!source || source.ok === false) return [];
    const parsedItems = collectDataProCompanyItems(source.parsed);
    const summaryItem = parsedItems.length ? null : companyItemFromDataProSummary(source.summary || source.text);
    const items = summaryItem ? [summaryItem] : parsedItems;
    const companies = [];
    for (const item of items.slice(0, 5)) {
      const company = await this.upsertProfessionalCompany(item, source, {
        search_alias: evidence.search_query || "",
      });
      if (company) companies.push(company);
    }
    return [...new Map(companies.map((company) => [company.id, company])).values()];
  }

  async upsertProfessionalCompany(item, source = {}, options = {}) {
    const name = dataProField(item, dataProCompanyFields.name, 180);
    if (!name) return null;
    const unifiedSocialCreditCode = dataProField(item, dataProCompanyFields.unified_social_credit_code, 80);
    const normalizedName = normalizedCompanyIdentity(name);
    const existing = Object.values(this.data.companies).find((company) => {
      if (unifiedSocialCreditCode && company.unified_social_credit_code === unifiedSocialCreditCode) return true;
      return normalizedCompanyIdentity(company.name) === normalizedName;
    });
    const identity = unifiedSocialCreditCode || normalizedName;
    if (!identity) return null;

    const now = nowIso();
    const address = dataProField(item, dataProCompanyFields.address, 500);
    const industry = dataProField(item, dataProCompanyFields.industry, 120) || existing?.industry || "待确认行业";
    const location = compactCompanyLocation(item, address) || existing?.location || "";
    const tags = [...new Set([
      ...(existing?.tags || []),
      industry === "待确认行业" ? "" : industry,
      location,
      "专业数据集已核验",
    ].filter(Boolean))].slice(0, 8);
    const id = existing?.id || stableProfessionalCompanyId(identity);
    const searchAlias = companySearchAlias(options.search_alias, name);
    const company = {
      ...(existing || {}),
      id,
      name,
      initial: normalizeInitial(name),
      industry,
      location,
      tags,
      aliases: [...new Set([
        ...(existing?.aliases || []),
        existing?.name,
        name,
        searchAlias,
        parentheticalBrandAlias(name),
      ].filter(Boolean))],
      unified_social_credit_code: unifiedSocialCreditCode || existing?.unified_social_credit_code || "",
      legal_representative: dataProField(item, dataProCompanyFields.legal_representative, 120) || existing?.legal_representative || "",
      registered_capital: dataProField(item, dataProCompanyFields.registered_capital, 120) || existing?.registered_capital || "",
      business_status: dataProField(item, dataProCompanyFields.business_status, 120) || existing?.business_status || "",
      registered_address: address || existing?.registered_address || "",
      established_at: dataProField(item, dataProCompanyFields.established_at, 80) || existing?.established_at || "",
      business_scope: dataProField(item, dataProCompanyFields.business_scope, 1200) || existing?.business_scope || "",
      identity_status: "verified",
      data_origin: "datapro",
      professional_source_ref: source.raw_ref || source.request_id || existing?.professional_source_ref || null,
      professional_verified_at: now,
      progress: existing?.progress || {
        label: "新商机",
        summary: "企业主体已通过专业数据集核验，待生成最新档案。",
        evidence: "依据：专业数据集",
        updated_at: now,
      },
      dossier_ids: existing?.dossier_ids || [],
      material_ids: existing?.material_ids || [],
      qa_session_id: existing?.qa_session_id || `sales-${id}`,
      created_at: existing?.created_at || now,
      updated_at: now,
    };
    this.data.companies[id] = company;
    this.data.qa_messages[id] = this.data.qa_messages[id] || [];
    await this.persist(() => this.repository.persistSalesCompany(company));
    return company;
  }

  async createCompanyFromQuery(query, evidence = {}) {
    const normalizedQuery = normalizedCompanyIdentity(query);
    const existing = Object.values(this.data.companies)
      .find((company) => normalizedCompanyIdentity(company.name) === normalizedQuery);
    if (existing) return existing;
    const now = nowIso();
    const id = makeId("company");
    const company = {
      id,
      name: query,
      initial: normalizeInitial(query),
      industry: "待确认行业",
      location: "",
      tags: ["待确认"],
      identity_status: "unverified",
      data_origin: "user_input",
      progress: {
        label: "新商机",
        summary: evidence.summary || "已创建目标企业，等待获取最新档案和历史资料。",
        evidence: "依据：用户输入",
        updated_at: now,
      },
      dossier_ids: [],
      material_ids: [],
      qa_session_id: `sales-${id}`,
      created_at: now,
      updated_at: now,
    };
    this.data.companies[id] = company;
    this.data.qa_messages[id] = [];
    await this.persist(() => this.repository.persistSalesCompany(company));
    return company;
  }

  async collectSearchEvidence(query, providerRunId = "") {
    const result = {
      search_query: String(query || "").trim(),
      summary: "",
      professional: null,
      public_sources: [],
      issues: [],
    };
    if (!query) return result;

    if (this.dataProProvider?.isRunEnabled?.()) {
      try {
        const dataPro = await this.trackProviderStep(providerRunId, {
          provider: "datapro",
          operation: "search_company_professional_data",
          input_summary: `查询 ${query} 的企业主体信息`,
          output_summary: "已完成企业主体查询。",
        }, () => this.dataProProvider.callTool(`${query} 企业工商信息 招投标 公告`));
        if (dataPro.ok) {
          result.professional = dataPro;
          result.summary = "已调用专业数据集补充企业候选依据。";
        } else {
          result.issues.push(`专业数据集暂时不可用：${dataPro.error?.code || "provider_error"}`);
        }
      } catch (error) {
        result.issues.push(`专业数据集暂时不可用：${error.message}`);
      }
    } else {
      await this.skipProviderStep(providerRunId, {
        provider: "datapro",
        operation: "search_company_professional_data",
        input_summary: `查询 ${query} 的企业主体信息`,
        output_summary: "DataPro 未启用。",
        error: { code: "provider_disabled", message: "DataPro is not enabled." },
      });
    }

    if (this.webSearchProvider?.isRunEnabled?.()) {
      try {
        const web = await this.trackProviderStep(providerRunId, {
          provider: "web_search",
          operation: "search_company_public_sources",
          input_summary: `检索 ${query} 的公开信息`,
          output_summary: "已完成候选企业公开信息检索。",
        }, () => this.webSearchProvider.search({ query: `${query} 公司 公告 新闻`.slice(0, 100), count: 3, need_summary: true }));
        if (web.ok) {
          result.public_sources = web.results || [];
          result.summary = result.summary || "已调用联网搜索补充公开信息。";
        } else {
          result.issues.push(`联网搜索暂时不可用：${web.error?.code || "provider_error"}`);
        }
      } catch (error) {
        result.issues.push(`联网搜索暂时不可用：${error.message}`);
      }
    } else {
      await this.skipProviderStep(providerRunId, {
        provider: "web_search",
        operation: "search_company_public_sources",
        input_summary: `检索 ${query} 的公开信息`,
        output_summary: "联网搜索未启用。",
        error: { code: "provider_disabled", message: "Web search is not enabled." },
      });
    }

    if (this.runtimePolicy.fail_closed && !result.professional) {
      throw providerUnavailable("datapro", "No verified professional-data result was returned.", {
        issues: result.issues,
      });
    }
    return result;
  }

  async addTargetEnterprise(goalId, body = {}) {
    const goal = this.getGoal(goalId);
    let companyId = String(body.company_id || "").trim();
    if (!companyId && body.company?.name) {
      companyId = (await this.createCompanyFromQuery(body.company.name)).id;
    }
    if (!companyId) throw new HttpError(400, "bad_request", "company_id 不能为空。");
    const company = this.data.companies[companyId];
    if (!company) throw new HttpError(404, "company_not_found", "企业不存在。", { company_id: companyId });
    if (!goal.company_ids.includes(companyId)) goal.company_ids.push(companyId);
    goal.updated_at = nowIso();
    await this.persist(() => this.repository.persistSalesGoal(goal));
    await this.persist(() => this.repository.persistSalesTargetEnterprise(goal.id, company));
    return this.enterpriseDetail(companyId, { goal_id: goalId });
  }

  requireCompany(companyId) {
    const company = this.data.companies[companyId];
    if (!company) throw new HttpError(404, "company_not_found", "企业不存在。", { company_id: companyId });
    return company;
  }

  async enterpriseDetail(companyId, options = {}) {
    const company = this.requireCompany(companyId);
    return {
      ...this.companyView(company, { in_pool: true }),
      goal_id: options.goal_id || null,
      progress_detail: this.progressView(company),
      dossiers: this.listDossiers(companyId),
      materials: this.listMaterials(companyId),
      qa: await this.getQa(companyId),
    };
  }

  progressView(companyOrId) {
    const company = typeof companyOrId === "string" ? this.requireCompany(companyOrId) : companyOrId;
    const progress = company.progress || {};
    const label = progress.label || "新商机";
    return {
      label,
      summary: conciseProgressSummary(label, businessText(progress.summary, "暂未形成明确进展。")),
      evidence: businessText(progress.evidence, "依据：当前企业档案", 180),
      updated_at: progress.updated_at || null,
    };
  }

  listDossiers(companyId) {
    const company = this.requireCompany(companyId);
    return (company.dossier_ids || [])
      .map((id) => this.data.dossiers[id])
      .filter(Boolean)
      .filter(isDisplayableDossier)
      .map((dossier) => ({
        dossier,
        publicView: this.publicDossier(dossier),
      }))
      .filter(({ publicView }) => (
        !this.runtimePolicy.fail_closed
        || !this.publicDossierQualityErrors(publicView, company).length
      ))
      .sort((a, b) => String(b.dossier.created_at).localeCompare(String(a.dossier.created_at)))
      .map(({ dossier, publicView }) => ({
        id: publicView.id,
        company_id: publicView.company_id,
        title: publicView.title,
        summary: publicView.summary,
        version_no: Number(publicView.version_no || 1),
        previous_dossier_id: publicView.previous_dossier_id || null,
        change_status: publicView.change_status || "initial",
        data_as_of: publicView.data_as_of ?? null,
        generated_at: publicView.generated_at || dossier.created_at,
        created_at: publicView.created_at,
      }));
  }

  dossierDetail(dossierId) {
    const dossier = this.data.dossiers[dossierId];
    if (!dossier) throw new HttpError(404, "dossier_not_found", "档案不存在。", { dossier_id: dossierId });
    const publicView = this.publicDossier(dossier);
    const company = this.data.companies[dossier.company_id] || {
      name: String(dossier.title || "").replace(/\s*(?:最近档案|销售情报报告).*/, ""),
      aliases: [],
    };
    if (
      this.runtimePolicy.fail_closed
      && this.publicDossierQualityErrors(publicView, company).length
    ) {
      throw new HttpError(404, "dossier_not_found", "档案不存在。", { dossier_id: dossierId });
    }
    return publicView;
  }

  publicDossier(dossier) {
    const summary = normalizeSalesText(
      businessText(dossier.summary, "这份档案需要重新获取最新资料后再展示。", 300),
    );
    const storedCompany = this.data.companies[dossier.company_id];
    const companyName = cleanEvidenceSummary(
      storedCompany?.name
        || String(dossier.title || "").replace(/\s*(?:最近档案|销售情报报告).*/, ""),
      "目标企业",
      80,
    );
    const company = storedCompany || { name: companyName, aliases: [] };
    const storedCitations = firstJsonArray(dossier.citations);
    const storedCitationIds = new Set(storedCitations.map((citation) => String(citation.id)));
    const evidencePackCitationCandidates = evidencePackCitations({
      items: firstJsonArray(dossier.evidence_pack),
    }).filter((citation) => !storedCitationIds.has(String(citation.id)));
    const keptCitations = [...storedCitations, ...evidencePackCitationCandidates]
      .filter((citation) => isDisplayableDossierCitation(citation, company))
      .sort((a, b) => citationRank(a) - citationRank(b));
    const citationIdMap = new Map();
    const keptCitationIds = new Set(keptCitations.map((citation) => String(citation.id)));
    const bodySectionsWithRemovedCitation = new Set(
      firstJsonArray(dossier.body)
        .map((paragraph, index) => (
          firstJsonArray(paragraph.citation_ids).some((id) => !keptCitationIds.has(String(id)))
            ? index
            : -1
        ))
        .filter((index) => index >= 0),
    );
    const citations = keptCitations.map((citation, index) => {
      const id = String(index + 1);
      citationIdMap.set(String(citation.id), id);
      return publicCitationView(citation, id);
    });
    const validationCitations = keptCitations.map((citation, index) => ({
      ...citation,
      id: String(index + 1),
    }));
    const body = firstJsonArray(dossier.body).map((paragraph) => ({
      text: normalizeSalesText(compactCompleteSentences(
        businessText(paragraph.text, summary, 1400),
        1400,
      )),
      citation_ids: firstJsonArray(paragraph.citation_ids)
        .map((id) => citationIdMap.get(String(id)))
        .filter(Boolean),
      segments: firstJsonArray(paragraph.segments).map((segment) => ({
        text: normalizeSalesText(compactCompleteSentences(
          businessText(segment.text, "", 1400),
          1200,
        )),
        citation_ids: firstJsonArray(segment.citation_ids)
          .map((id) => citationIdMap.get(String(id)))
          .filter(Boolean),
      })).filter((segment) => segment.text),
    }));
    const publicView = {
      id: dossier.id,
      company_id: dossier.company_id,
      title: `${companyName} 销售情报报告`,
      summary,
      body: [],
      citations,
      version_no: Number(dossier.version_no || 1),
      previous_dossier_id: dossier.previous_dossier_id || null,
      change_status: dossier.change_status || "initial",
      data_as_of: dossier.data_as_of ?? null,
      generated_at: dossier.generated_at || dossier.created_at || null,
      created_at: dossier.created_at || null,
      updated_at: dossier.updated_at || dossier.created_at || null,
    };
    publicView.body = bodySectionsWithRemovedCitation.size
      ? []
      : this.fixedPublicDossierBody(publicView, body, company, validationCitations);
    if (!publicView.body.length) {
      publicView.summary = "";
      publicView.citations = [];
      return publicView;
    }
    const usedCitationIds = new Set(
      publicView.body.flatMap((paragraph) => firstJsonArray(paragraph.citation_ids).map(String)),
    );
    const usedCitations = citations.filter((citation) => usedCitationIds.has(String(citation.id)));
    const finalCitationIdMap = new Map(
      usedCitations.map((citation, index) => [String(citation.id), String(index + 1)]),
    );
    publicView.citations = usedCitations.map((citation, index) => ({
      ...citation,
      id: String(index + 1),
    }));
    Object.defineProperty(publicView, "_validation_citations", {
      configurable: false,
      enumerable: false,
      writable: false,
      value: usedCitations.map((citation, index) => ({
        ...citation,
        id: String(index + 1),
      })),
    });
    publicView.body = publicView.body.map((paragraph) => ({
      ...paragraph,
      citation_ids: [...new Set(
        firstJsonArray(paragraph.citation_ids)
          .map((id) => finalCitationIdMap.get(String(id)))
        .filter(Boolean),
      )],
      segments: firstJsonArray(paragraph.segments).map((segment) => ({
        ...segment,
        citation_ids: [...new Set(
          firstJsonArray(segment.citation_ids)
            .map((id) => finalCitationIdMap.get(String(id)))
            .filter(Boolean),
        )],
      })).filter((segment) => segment.text && segment.citation_ids.length),
    }));
    publicView.data_as_of = deriveEvidenceDataAsOf(
      publicView.citations,
      publicView.generated_at || new Date().toISOString(),
    );
    const groundedSummary = [
      publicView.body.find((item) => item.text.startsWith("近期公开动态："))?.text.replace(/^近期公开动态：/, ""),
      publicView.body.find((item) => item.text.startsWith("销售机会判断："))?.text.replace(/^销售机会判断：/, ""),
    ].filter(Boolean).join(" ");
    publicView.summary = compactCompleteSentences(
      isSubstantiveDossierSummary(groundedSummary) ? groundedSummary : publicView.summary,
      300,
    );
    return publicView;
  }

  publicDossierQualityErrors(publicView, company) {
    const validationCitations = publicView?._validation_citations || publicView?.citations || [];
    const validated = validateDossierModelAnswer(publicView, validationCitations);
    return [
      ...validated.errors,
      ...(this.runtimePolicy.fail_closed
        ? dossierGroundingErrors(validationCitations, validated.body, company)
        : []),
      ...dossierSectionSourceErrors(validated.body, validationCitations, company),
      ...dossierSectionContentErrors(validated.body),
      ...dossierSectionSemanticErrors(validated.body, validationCitations, company),
      ...dossierSectionEvidenceGroundingErrors(validated.body, validationCitations),
    ];
  }

  async createDossier(companyId, body = {}, options = {}) {
    const company = this.requireCompany(companyId);
    const reportProgress = typeof options.report_progress === "function"
      ? options.report_progress
      : async () => {};
    const saveCheckpoint = typeof options.save_checkpoint === "function"
      ? options.save_checkpoint
      : async () => null;
    const job = options.claimed_job
      ? await this.activateClaimedJob(options.claimed_job, "sales_dossier_generation")
      : await this.startJob({
        job_type: "sales_dossier_generation",
        entity_type: "target_enterprise",
        entity_id: company.id,
        max_attempts: 3,
        request: body,
        retry_job_id: options.retry_job_id || "",
      });
    let dossierCheckpoint = reusableDossierCheckpoint(
      job.checkpoint?.dossier,
      company.id,
      this.dossierCheckpointTtlMs,
    ) || {
      schema_version: 1,
      company_id: company.id,
      created_at: nowIso(),
    };
    const persistDossierCheckpoint = async (patch = {}, progressOptions = {}) => {
      dossierCheckpoint = {
        ...dossierCheckpoint,
        ...clone(patch),
        schema_version: 1,
        company_id: company.id,
        updated_at: nowIso(),
      };
      await saveCheckpoint(
        { dossier: dossierCheckpoint },
        progressOptions,
      );
      return dossierCheckpoint;
    };
    let run = null;

    try {
      run = await this.providerRuns.startRun({
        operation: "sales_dossier_generation",
        entity_type: "target_enterprise",
        entity_id: company.id,
        job_id: job.id,
      });
      const generatedAt = nowIso();
      let evidencePack = objectValue(dossierCheckpoint.evidence_pack);
      if (Array.isArray(evidencePack.items) && evidencePack.evidence_hash) {
        await reportProgress("building_evidence", 50);
        await this.skipProviderStep(run.id, {
          provider: "rule",
          operation: "resume_evidence_checkpoint",
          input_summary: `恢复 ${company.name} 当前任务中已经完成的资料采集`,
          output_summary: `已从任务检查点恢复 ${evidencePack.items.length} 条资料，未重复调用上游服务。`,
        });
        evidencePack = clone(evidencePack);
      } else {
        const collected = await this.collectDossierEvidence(company, run.id, {
          checkpoint: dossierCheckpoint.evidence_collection,
          report_progress: reportProgress,
          save_checkpoint: async (collection, progressOptions = {}) => persistDossierCheckpoint(
            { evidence_collection: collection },
            progressOptions,
          ),
        });
        await this.assertJobActive(job.id);
        await reportProgress("building_evidence", 50);
        const packed = await this.trackProviderStep(run.id, {
          provider: "rule",
          operation: "build_evidence_pack",
          input_summary: `校验 ${company.name} 的专业数据集与豆包搜索来源，并计算稳定证据哈希`,
        }, async () => {
          const builtEvidencePack = buildDossierEvidencePack({
            company,
            collected,
            memoryContexts: [],
            generatedAt,
          });
          return {
            ok: true,
            provider: "rule",
            provider_mode: "local",
            evidence_pack: builtEvidencePack,
            summary: `证据包保留 ${builtEvidencePack.items.length} 条，拒绝 ${builtEvidencePack.rejected.length} 条不满足主体或内容质量门禁的来源。`,
          };
        });
        evidencePack = packed.evidence_pack;
        await persistDossierCheckpoint(
          {
            collected_at: evidencePack.collected_at,
            evidence_pack: evidencePack,
          },
          {
            stage: "validating_evidence",
            progress: 56,
            detail: { message: "正在校验资料与企业主体" },
          },
        );
      }
      await this.assertJobActive(job.id);
      await reportProgress("validating_evidence", 56);
      if (this.runtimePolicy.fail_closed) {
        const evidenceValidation = validateProductionEvidencePack(evidencePack);
        if (!evidenceValidation.ok) {
          throw new HttpError(422, "evidence_quality_insufficient", "现有来源不足以生成可对外使用的最新档案。", {
            validation_errors: evidenceValidation.errors,
            evidence_policy: evidenceValidation.policy,
          });
        }
      }
      await this.assertJobActive(job.id);
      const storedDossiers = (company.dossier_ids || [])
        .map((id) => this.data.dossiers[id])
        .filter(Boolean)
        .sort((a, b) => Number(b.version_no || 1) - Number(a.version_no || 1)
          || String(b.created_at || "").localeCompare(String(a.created_at || "")));
      const latestDossier = storedDossiers
        .filter(isDisplayableDossier)
        .find((item) => (
          !this.runtimePolicy.fail_closed
          || !this.publicDossierQualityErrors(this.publicDossier(item), company).length
        )) || null;
      const nextVersionNo = Math.max(
        0,
        ...storedDossiers.map((item) => Number(item.version_no || 0)).filter(Number.isFinite),
      ) + 1;

      const currentCitationInputs = this.buildCitationInputs(evidencePack, []);
      const currentSourcePolicy = dossierSectionSourcePolicy(currentCitationInputs, company);
      const currentTargetName = String(company.name || company.legal_name || "").trim();
      const currentTargetEntityKey = normalizeLegalEntityName(currentTargetName);
      const currentAgentContext = buildDossierAgentContext({
        citations: currentCitationInputs,
        evidencePolicy: evidencePack.policy || null,
        evidenceConflicts: evidencePack.conflicts || [],
        sourceSelectionPolicy: {
          business_database_ids: [...currentSourcePolicy.business],
          business_dynamics_ids: [...currentSourcePolicy.businessDynamics],
          risk_database_ids: [...currentSourcePolicy.risk],
          market_database_ids: [...currentSourcePolicy.market],
          professional_dataset_ids: [...currentSourcePolicy.professional],
          web_search_ids: [...currentSourcePolicy.web],
          excluded_entity_citation_ids: currentCitationInputs
            .map((citation) => ({ citation, record: dossierBusinessEntityRecord(citation) }))
            .filter(({ record }) => (
              record
              && normalizeLegalEntityName(record.name) !== currentTargetEntityKey
            ))
            .map(({ citation }) => String(citation.id)),
        },
      });
      const latestDossierValidation = latestDossier
        ? validateDossierModelAnswer(latestDossier, currentCitationInputs)
        : { body: [], errors: ["没有可复用的历史档案"] };
      const latestDossierQualityErrors = latestDossier
        ? [
          ...latestDossierValidation.errors,
          ...dossierSectionSourceErrors(latestDossierValidation.body, currentCitationInputs, company),
          ...dossierSourceUsageErrors(
            latestDossierValidation.body.flatMap((paragraph) => paragraph.citation_ids || []),
            currentAgentContext.citations,
            currentAgentContext.sourceUsageRequirements,
            "现有档案",
          ),
        ]
        : latestDossierValidation.errors;
      if (
        latestDossier?.evidence_hash
        && latestDossier.evidence_hash === evidencePack.evidence_hash
        && latestDossierQualityErrors.length === 0
      ) {
        await this.skipProviderStep(run.id, {
          provider: "model",
          operation: "generate_sales_dossier",
          input_summary: `检查 ${company.name} 是否需要生成新版本`,
          output_summary: "证据内容未变化，未重复调用模型。",
        });
        await this.providerRuns.completeRun(run.id, { result_ref: `dossier:${latestDossier.id}:unchanged` });
        await reportProgress("persisting_result", 95);
        await this.completeJob(job.id, {
          result_ref: `dossier:${latestDossier.id}:unchanged`,
          result: { action: "no_material_change", dossier_id: latestDossier.id },
        });
        return {
          action: "no_material_change",
          checked_at: generatedAt,
          record: this.listDossiers(companyId).find((item) => item.id === latestDossier.id),
          detail: this.dossierDetail(latestDossier.id),
          progress: this.progressView(company),
          memory_record: null,
          provider_run_id: run.id,
          job_id: job.id,
        };
      }

      await reportProgress("generating_dossier", 68);
      const modelDossier = await this.generateDossierWithModel(company, evidencePack, [], run.id);
      await this.assertJobActive(job.id);
      await reportProgress("validating_dossier", 86);
      let dossier = modelDossier;
      if (!dossier) {
        if (this.runtimePolicy.fail_closed) {
          throw providerUnavailable("model", "The model did not return a publishable dossier.", {
            reason: "dossier_quality_gate_failed",
            validation_errors: ["模型结果未通过正文、引用或展示质量门禁，未保存规则兜底档案。"],
          });
        }
        const ruleResult = await this.trackProviderStep(run.id, {
          provider: "rule",
          operation: "build_dossier_fallback",
          input_summary: `为 ${company.name} 生成证据不足时的明确说明`,
          output_summary: "已生成不冒充模型结果的规则档案。",
        }, async () => ({
          ok: true,
          provider: "rule",
          provider_mode: "mixed",
          dossier: this.buildRuleDossier(company, evidencePack, []),
        }));
        dossier = ruleResult.dossier;
      }

      dossier.provider_run_id = run.id;
      dossier.version_no = nextVersionNo;
      dossier.previous_dossier_id = latestDossier?.id || null;
      dossier.evidence_hash = evidencePack.evidence_hash;
      dossier.change_status = latestDossier ? "changed" : "initial";
      dossier.data_as_of = evidencePack.data_as_of;
      dossier.generated_at = generatedAt;
      dossier.evidence_pack = evidencePack.items;
      const usedCitationIds = new Set(
        firstJsonArray(dossier.body)
          .flatMap((paragraph) => firstJsonArray(paragraph?.citation_ids).map(String)),
      );
      dossier.citations = firstJsonArray(dossier.citations)
        .filter((citation) => usedCitationIds.has(String(citation?.id || "")));
      dossier.data_as_of = deriveEvidenceDataAsOf(dossier.citations, generatedAt);
      const dossierGroundingValidationErrors = dossierGroundingErrors(
        dossier.citations,
        dossier.body,
        company,
      );
      if (this.runtimePolicy.fail_closed && dossierGroundingValidationErrors.length) {
        throw providerUnavailable("model", "The dossier did not cite a verified legal-entity anchor.", {
          reason: "public_dossier_quality_gate_failed",
          validation_errors: dossierGroundingValidationErrors,
        });
      }
      const finalPublicView = this.publicDossier(dossier);
      const finalPublicViewErrors = this.publicDossierQualityErrors(finalPublicView, company);
      if (this.runtimePolicy.fail_closed && finalPublicViewErrors.length) {
        throw providerUnavailable("model", "The dossier failed the final pre-persistence public-view quality gate.", {
          reason: "public_dossier_quality_gate_failed",
          validation_errors: finalPublicViewErrors,
        });
      }
      dossier.dossier_fingerprint = makeDossierFingerprint(dossier);
      if (
        latestDossier
        && makeDossierFingerprint(latestDossier) === dossier.dossier_fingerprint
      ) {
        await this.providerRuns.completeRun(run.id, {
          result_ref: `dossier:${latestDossier.id}:same_report`,
        });
        await reportProgress("persisting_result", 95);
        await this.completeJob(job.id, {
          result_ref: `dossier:${latestDossier.id}:same_report`,
          result: { action: "no_report_change", dossier_id: latestDossier.id },
        });
        return {
          action: "no_report_change",
          checked_at: generatedAt,
          record: this.listDossiers(companyId).find((item) => item.id === latestDossier.id),
          detail: this.dossierDetail(latestDossier.id),
          progress: this.progressView(company),
          memory_record: null,
          provider_run_id: run.id,
          job_id: job.id,
        };
      }

      const nextCompany = {
        ...company,
        dossier_ids: [dossier.id, ...(company.dossier_ids || []).filter((id) => id !== dossier.id)],
        progress: this.progressFromDossier(company, dossier),
        updated_at: nowIso(),
      };
      await this.skipProviderStep(run.id, {
        provider: "openviking",
        operation: "store_dossier_memory",
        input_summary: `判断 ${company.name} 的档案应由哪一层保存`,
        output_summary: "档案属于结构化业务记录，由 Supabase 保存，不重复写入 OpenViking。",
      });
      const memoryRecord = null;

      if (this.persistence.enabled && this.repository) {
        await reportProgress("persisting_result", 90);
        await this.trackProviderStep(run.id, {
          provider: "supabase",
          operation: "persist_dossier",
          input_summary: `保存 ${company.name} 的档案、进度和外部引用`,
          output_summary: "档案及关联状态已持久化。",
        }, async () => {
          await this.persist(() => this.repository.persistSalesCompany(nextCompany));
          await this.persist(() => this.repository.persistSalesDossier(dossier));
          return { ok: true, provider: "supabase", provider_mode: "real" };
        });
      } else {
        await this.skipProviderStep(run.id, {
          provider: "supabase",
          operation: "persist_dossier",
          input_summary: `保存 ${company.name} 的档案和进度`,
          output_summary: "当前配置未启用持久化仓库。",
          error: { code: "repository_disabled", message: "Persistent repository is not enabled." },
        });
      }

      this.data.dossiers[dossier.id] = dossier;
      this.data.companies[company.id] = nextCompany;
      await this.providerRuns.completeRun(run.id, { result_ref: `dossier:${dossier.id}` });
      await this.completeJob(job.id, {
        result_ref: `dossier:${dossier.id}`,
        result: { action: "created", dossier_id: dossier.id, version_no: dossier.version_no },
      });
      return {
        action: "created",
        record: this.listDossiers(companyId)[0],
        detail: this.dossierDetail(dossier.id),
        progress: this.progressView(nextCompany),
        memory_record: memoryRecord,
        provider_run_id: run.id,
        job_id: job.id,
      };
    } catch (error) {
      if (run) {
        try {
          if (error.code === "job_cancelled") {
            await this.providerRuns.cancelRun(run.id, { summary: "档案生成任务已由用户取消。" });
          } else {
            await this.providerRuns.failRun(run.id, {
              code: error.code || "dossier_generation_failed",
              message: error.message || "Dossier generation failed.",
              category: error.category || "workflow",
              retryable: error.retryable,
              details: {
                validation_errors: safeValidationErrors(error.details?.validation_errors),
              },
            });
          }
        } catch (persistenceError) {
          if (this.runtimePolicy.fail_closed) throw persistenceError;
        }
      }
      if (!options.claimed_job) await this.failJob(job.id, error);
      throw error;
    }
  }

  async collectDossierEvidence(company, providerRunId = "", options = {}) {
    const checkpoint = objectValue(options.checkpoint);
    const professional = firstJsonArray(checkpoint.professional).map(clone);
    const publicSources = firstJsonArray(checkpoint.public_sources).map(clone);
    const issues = firstJsonArray(checkpoint.issues).map((item) => String(item)).filter(Boolean);
    const completedQueryKeys = new Set(
      firstJsonArray(checkpoint.completed_query_keys).map(String).filter(Boolean),
    );
    const professionalFailures = [];
    const publicFailures = [];
    const reportProgress = typeof options.report_progress === "function"
      ? options.report_progress
      : async () => {};
    const saveCheckpoint = typeof options.save_checkpoint === "function"
      ? options.save_checkpoint
      : async () => {};
    let checkpointWrite = Promise.resolve();
    const persistCollection = (progressOptions = {}) => {
      const snapshot = {
        schema_version: 1,
        company_id: company.id,
        professional: clone(professional),
        public_sources: clone(publicSources),
        issues: [...new Set(issues)].slice(-40),
        completed_query_keys: [...completedQueryKeys].sort(),
        updated_at: nowIso(),
      };
      checkpointWrite = checkpointWrite.then(() => saveCheckpoint(snapshot, progressOptions));
      return checkpointWrite;
    };

    if (this.dataProProvider?.isRunEnabled?.()) {
      const maxProfessionalSources = Math.max(1, Math.min(Number(this.dataProProvider.maxSources || 3), 5));
      const dataProQueries = this.dataProProvider.planDossierQueries?.(company, {
        maxSources: maxProfessionalSources,
      }) || [
        {
          label: "企业风险数据库",
          purpose: "风险与关注事项核验",
          query: `${company.name} 企业风险数据 司法诉讼 行政处罚 失信被执行 经营异常`,
        },
        {
          label: "企业工商数据库",
          purpose: "主体与经营信息核验",
          query: `${company.name} 企业工商数据 经营状况 经营范围 知识产权`,
        },
      ].slice(0, maxProfessionalSources);

      const dataProQueryKeys = dataProQueries.map((item) => workflowQueryKey("datapro", item.query));
      const dataProCompletedCount = () => dataProQueryKeys
        .filter((key) => completedQueryKeys.has(key)).length;
      await reportProgress("collecting_professional", 10);
      await mapWithConcurrency(dataProQueries, this.dossierDataProConcurrency, async (item) => {
        const queryKey = workflowQueryKey("datapro", item.query);
        if (completedQueryKeys.has(queryKey)) return;
        try {
          const result = await this.trackProviderStep(providerRunId, {
            provider: "datapro",
            operation: "company_evidence_query",
            input_summary: `${item.label}：${item.purpose || company.name}`,
            output_summary: `已完成 ${item.label} 查询。`,
          }, () => this.dataProProvider.callTool(item.query));
          const summaries = dataProEvidenceSummaries(result);
          if (result.ok && summaries.length) {
            summaries.forEach((summary, index) => {
              professional.push({
                label: summaries.length > 1 ? `${item.label} · 记录 ${index + 1}` : item.label,
                source_group: item.label,
                source_key: `${item.label}:${result.raw_ref || item.query}:${index + 1}`,
                summary,
                raw_ref: result.raw_ref || "",
                query: item.query,
                purpose: item.purpose || "",
              });
            });
            completedQueryKeys.add(queryKey);
          } else if (!result.ok) {
            professionalFailures.push(result.error || {});
            issues.push(`专业数据集暂时不可用：${result.error?.message || result.error?.code || "provider_error"}`);
          } else {
            issues.push(`${item.label}调用成功，但没有返回可展示的业务字段。`);
            completedQueryKeys.add(queryKey);
          }
        } catch (error) {
          professionalFailures.push(error);
          issues.push(`专业数据集暂时不可用：${error.message}`);
        }
        const current = dataProCompletedCount();
        await persistCollection({
          stage: "collecting_professional",
          progress: Math.round(10 + (current / Math.max(1, dataProQueries.length)) * 18),
          detail: {
            current,
            total: dataProQueries.length,
            message: `正在核验专业资料 ${current}/${dataProQueries.length}`,
          },
        });
      });
      await checkpointWrite;
    } else {
      await this.skipProviderStep(providerRunId, {
        provider: "datapro",
        operation: "collect_professional_evidence",
        input_summary: `为 ${company.name} 获取专业资料`,
        output_summary: "DataPro 未启用。",
        error: { code: "provider_disabled", message: "DataPro is not enabled." },
      });
    }

    if (this.webSearchProvider?.isRunEnabled?.()) {
      const seenPublicSources = new Set(
        publicSources.map((source) => source.url || source.label).filter(Boolean),
      );
      const authoritativeHosts = new Map();
      const publicQueryKeys = new Set(
        [...completedQueryKeys].filter((key) => key.startsWith("web_search:")),
      );
      const searchName = preferredCompanySearchName(company);
      const currentYear = new Date().getFullYear();
      const webQueries = [...new Map([
        {
          purpose: "法定主体近期公告与招采事项",
          query: `${company.name} ${currentYear} 招标 采购 中标 公告`,
        },
        {
          purpose: "法定主体监管、司法与经营风险补充核验",
          query: `${company.name} ${currentYear} 行政处罚 司法诉讼 失信被执行 经营异常 监管 召回 官方`,
        },
        {
          purpose: "法定主体官方公告与投资者信息",
          query: `${company.name} ${currentYear} 官网 公告 年报 投资者关系`,
        },
        {
          purpose: "品牌或简称相关的最新项目与合作",
          query: `${searchName} ${currentYear} 最新公告 项目 合作`,
        },
        {
          purpose: "品牌或简称相关的产能、供应链与业务变化",
          query: `${searchName} ${currentYear} 产能 供应链 业务动态`,
        },
      ].map((item) => [item.query, item])).values()];
      const maxPublicSources = 18;
      const rememberAuthoritativeHost = (candidate) => {
        const host = publicSourceHostname(candidate.url);
        const authorityLevel = Number(candidate.auth_level);
        if (
          !host
          || !Number.isFinite(authorityLevel)
          || authorityLevel < 2
          || !dossierTextMentionsCompany(
            `${candidate.site_name} ${candidate.label} ${candidate.summary}`,
            company,
          )
        ) return;
        const score = authorityLevel * 10
          + (dossierTextMentionsCompany(candidate.site_name, company) ? 12 : 0)
          + (/\.cn$/i.test(host) ? 4 : 0)
          + (/\/(?:news|press|stories|company)\b/i.test(candidate.url) ? 3 : 0);
        authoritativeHosts.set(host, Math.max(score, authoritativeHosts.get(host) || 0));
      };
      publicSources.forEach(rememberAuthoritativeHost);
      const registerPublicQueries = (queries) => {
        queries.forEach((queryItem) => {
          publicQueryKeys.add(workflowQueryKey("web_search", queryItem.query));
        });
      };
      const publicCompletedCount = () => [...publicQueryKeys]
        .filter((key) => completedQueryKeys.has(key)).length;

      const runPublicQuery = async (queryItem) => {
        const queryKey = workflowQueryKey("web_search", queryItem.query);
        if (completedQueryKeys.has(queryKey)) return;
        try {
          const result = await this.trackProviderStep(providerRunId, {
            provider: "web_search",
            operation: "public_evidence_query",
            input_summary: `检索 ${company.name} 的${queryItem.purpose}`,
            output_summary: "已完成公开信息检索。",
          }, () => this.webSearchProvider.search({
            query: queryItem.query.slice(0, 100),
            count: 3,
            need_summary: true,
            query_rewrite: true,
            auth_level: 1,
          }));
          if (!result.ok) {
            publicFailures.push(result.error || {});
            issues.push(`联网搜索暂时不可用：${result.error?.code || "provider_error"}`);
            return;
          }
          for (const searchResult of result.results || []) {
            const key = searchResult.url || searchResult.title;
            const summary = cleanEvidenceSummary(searchResult.summary || searchResult.snippet, "", 1600);
            if (!key || seenPublicSources.has(key) || !summary) continue;
            const candidate = {
              label: searchResult.title || searchResult.url || `${company.name} 公开来源`,
              summary,
              url: searchResult.url || "",
              published_at: searchResult.publish_time || null,
              site_name: searchResult.site_name || "",
              auth_description: searchResult.auth_description || "",
              auth_level: searchResult.auth_level ?? null,
              rank_score: searchResult.rank_score ?? null,
              query: queryItem.query,
              purpose: queryItem.purpose,
            };
            rememberAuthoritativeHost(candidate);
            if (isLowValuePublicDossierSource(candidate, concisePublicPoint(candidate))) continue;
            if (!isDisplayableDossierCitation({ ...candidate, source_kind: "联网搜索" }, company)) {
              continue;
            }
            seenPublicSources.add(key);
            publicSources.push(candidate);
            if (publicSources.length >= maxPublicSources) break;
          }
          completedQueryKeys.add(queryKey);
        } catch (error) {
          publicFailures.push(error);
          issues.push(`联网搜索暂时不可用：${error.message}`);
        }
        const current = publicCompletedCount();
        const total = Math.max(1, publicQueryKeys.size);
        await persistCollection({
          stage: "collecting_public",
          progress: Math.round(30 + (current / total) * 18),
          detail: {
            current,
            total,
            message: `正在检索公开资料 ${current}/${total}`,
          },
        });
      };
      const runPublicBatch = async (queries) => {
        const unique = [...new Map(queries.map((item) => [item.query, item])).values()];
        registerPublicQueries(unique);
        await mapWithConcurrency(unique, this.dossierWebConcurrency, runPublicQuery);
        await checkpointWrite;
      };

      await reportProgress("collecting_public", 30);
      await runPublicBatch(webQueries);

      const hasRecentPublicEvidence = () => publicSources.some((source) => {
        const citation = { ...source, source_kind: "联网搜索" };
        const point = concisePublicPoint(citation);
        return isDisplayableDossierCitation(citation, company)
          && isRecentPublicDossierCitation(citation, point, company);
      });
      if (!hasRecentPublicEvidence() && authoritativeHosts.size) {
        const officialHosts = [...authoritativeHosts.entries()]
          .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
          .slice(0, 2)
          .map(([host]) => host);
        const officialFollowups = officialHosts.flatMap((host) => [
          {
            purpose: `权威站点 ${host} 的新闻、公告与合作`,
            query: `site:${host} ${searchName} ${currentYear} 新闻 公告 合作 项目`,
          },
          {
            purpose: `权威站点 ${host} 的投资、产能与供应链变化`,
            query: `site:${host} ${searchName} 投资 产能 供应链 业务`,
          },
        ]).slice(0, 3);
        if (publicSources.length < maxPublicSources && !hasRecentPublicEvidence()) {
          await runPublicBatch(officialFollowups.slice(0, 2));
        }
      }

      const coverage = assessDossierEvidenceCoverage(company, {
        professional,
        public_sources: publicSources,
      });
      const coverageFollowups = [];
      const addCoverageFollowup = (topic, purpose, query) => {
        if (coverage.missing_topics.includes(topic)) {
          coverageFollowups.push({ purpose, query });
        }
      };
      addCoverageFollowup(
        "recent_public",
        "近期官方公告、项目与合作事件",
        `${company.name} ${currentYear} 官方公告 项目 合作 投资`,
      );
      addCoverageFollowup(
        "operations",
        "经营、产品、产能与供应链变化",
        `${searchName} ${currentYear} 产品 产能 交付 供应链 业务`,
      );
      addCoverageFollowup(
        "risk",
        "监管、司法、召回与经营风险",
        `${company.name} ${currentYear} 监管 处罚 诉讼 召回 经营异常`,
      );
      addCoverageFollowup(
        "procurement_or_project",
        "招采、中标与项目落地信号",
        `${company.name} ${currentYear} 招标 采购 中标 项目 供应商`,
      );
      addCoverageFollowup(
        "source_diversity",
        "不同权威公开渠道的企业动态",
        `${searchName} ${currentYear} 政府 公告 行业协会 项目 新闻`,
      );
      const boundedCoverageFollowups = [...new Map(
        coverageFollowups.map((item) => [item.query, item]),
      ).values()].slice(0, 4);
      if (publicSources.length < maxPublicSources && boundedCoverageFollowups.length) {
        await runPublicBatch(boundedCoverageFollowups);
      }
    } else {
      await this.skipProviderStep(providerRunId, {
        provider: "web_search",
        operation: "collect_public_evidence",
        input_summary: `为 ${company.name} 获取最新公开信息`,
        output_summary: "联网搜索未启用。",
        error: { code: "provider_disabled", message: "Web search is not enabled." },
      });
    }

    if (this.runtimePolicy.fail_closed && !professional.length) {
      throw providerUnavailable("datapro", "No verified professional evidence was returned for the dossier.", {
        issues,
        ...providerFailureDetails(professionalFailures),
      });
    }
    if (this.runtimePolicy.fail_closed && !publicSources.length && publicFailures.length) {
      throw providerUnavailable("web_search", "No verified public evidence was returned for the dossier.", {
        issues,
        ...providerFailureDetails(publicFailures),
      });
    }

    await persistCollection({
      stage: "building_evidence",
      progress: 48,
      detail: { message: "正在整理可信资料" },
    });
    await checkpointWrite;
    return {
      professional: professional.slice(0, 30),
      public_sources: publicSources.slice(0, 18),
      issues,
      coverage: assessDossierEvidenceCoverage(company, {
        professional,
        public_sources: publicSources,
      }),
    };
  }

  async searchOpenViking(company, query) {
    if (!this.openVikingProvider?.isConfigured?.()) {
      if (this.runtimePolicy.fail_closed) {
        throw providerUnavailable("openviking", "OpenViking is not configured for retrieval.");
      }
      return [];
    }
    try {
      const result = await this.openVikingProvider.findMemories(query, {
        limit: 8,
        uri: this.openVikingMaterialsUri(company),
      });
      if (!result.ok) {
        if (this.runtimePolicy.fail_closed) {
          throw providerUnavailable("openviking", "OpenViking retrieval failed.", {
            reason: result.error?.code || "provider_error",
          });
        }
        return [];
      }
      const contexts = this.normalizeOpenVikingContexts(result.result, company);
      return contexts;
    } catch (error) {
      if (this.runtimePolicy.fail_closed) {
        if (error instanceof HttpError) throw error;
        throw providerUnavailable("openviking", "OpenViking retrieval failed.", {
          reason: error.message || "provider_error",
        });
      }
      return [];
    }
  }

  normalizeOpenVikingContexts(result, company) {
    const items = [
      ...firstJsonArray(result?.memories),
      ...firstJsonArray(result?.resources),
      ...firstJsonArray(result?.skills),
    ];
    const materials = (company.material_ids || [])
      .map((id) => this.data.materials[id])
      .filter(Boolean)
      .filter(isFeishuMaterial);
    return items
      .filter((item) => String(item.uri || "").includes("/materials/"))
      .filter((item) => !isOpenVikingOverviewItem(item))
      .map((item) => {
        const uri = item.uri || "";
        const canonicalUri = canonicalOpenVikingResourceUri(uri);
        const material = materials.find((candidate) => {
          const materialUri = canonicalOpenVikingResourceUri(
            candidate.openviking_uri || candidate.openviking_ref,
          );
          return materialUri
            && (canonicalUri === materialUri || canonicalUri.startsWith(`${materialUri}/`));
        });
        if (!material) return null;
        return {
          uri,
          material_id: material.id,
          title: material.title || `${company.name} 飞书资料`,
          source_kind: feishuMaterialSourceKind(material),
          abstract: compactText(item.abstract || item.overview || item.text || "", 500),
          score: item.score ?? null,
        };
      })
      .filter((item) => item?.abstract)
      .filter((context, index, contexts) => (
        contexts.findIndex((candidate) => (
          canonicalOpenVikingResourceUri(candidate.uri)
            === canonicalOpenVikingResourceUri(context.uri)
        )) === index
      ))
      .slice(0, 8);
  }

  async hydrateOpenVikingContexts(company, contexts = []) {
    const materials = new Map(
      (company.material_ids || [])
        .map((id) => this.data.materials[id])
        .filter(Boolean)
        .map((material) => [material.id, material]),
    );
    return Promise.all((contexts || []).map(async (context) => {
      const material = materials.get(context.material_id);
      let content = "";
      if (context.uri && typeof this.openVikingProvider?.readTextResource === "function") {
        try {
          const result = await this.openVikingProvider.readTextResource(context.uri);
          if (result?.ok) content = normalizeImportedText(result.content).trim().slice(0, 30000);
        } catch {
          content = "";
        }
      }
      if (!content) {
        content = normalizeImportedText(
          material?.text
          || material?.content
          || material?.summary
          || context.abstract,
        ).trim().slice(0, 30000);
      }
      return {
        ...context,
        content,
        source_updated_at: material?.updated_at || null,
      };
    }));
  }

  materialContexts(company) {
    return (company.material_ids || [])
      .map((id) => this.data.materials[id])
      .filter(Boolean)
      .filter(isFeishuMaterial)
      .slice(0, 5)
      .map((material) => ({
        uri: material.openviking_uri || material.openviking_ref || "",
        material_id: material.id,
        title: material.title || `${company.name} 历史资料`,
        source_kind: feishuMaterialSourceKind(material),
        abstract: compactText(material.summary || material.text || `${material.title || "历史资料"} 已登记为 ${company.name} 的长期资料。`, 500),
        score: null,
      }));
  }

  openVikingCompanyUri(company) {
    if (typeof this.openVikingProvider?.salesCompanyUri !== "function") return "";
    return this.openVikingProvider.salesCompanyUri({
      workspaceId: this.workspaceId,
      companyId: company.id,
    });
  }

  openVikingMaterialsUri(company) {
    const companyUri = this.openVikingCompanyUri(company);
    return companyUri ? `${companyUri}/materials` : "";
  }

  async generateDossierWithModel(company, collected, memoryContexts, providerRunId = "") {
    const evidencePack = Array.isArray(collected?.items) && collected?.evidence_hash
      ? collected
      : buildDossierEvidencePack({
        company,
        collected,
        memoryContexts: [],
        generatedAt: nowIso(),
      });
    const evidenceCompilation = compileDossierEvidenceAtoms({
      evidencePack: evidencePack.entity
        ? evidencePack
        : {
          ...evidencePack,
          entity: resolveCompanyEntity(company),
        },
    });
    const citationInputs = this.buildCitationInputs(evidencePack, memoryContexts)
      .filter((citation) => isDisplayableDossierCitation(citation, company));
    if (!citationInputs.length) {
      await this.skipProviderStep(providerRunId, {
        provider: "model",
        operation: "generate_sales_dossier",
        input_summary: `为 ${company.name} 生成最近档案`,
        output_summary: "没有可引用证据，未调用模型。",
        error: { code: "missing_sources", message: "No verified citations were available." },
      });
      return null;
    }
    if (!this.modelProvider?.isRunEnabled?.()) {
      await this.skipProviderStep(providerRunId, {
        provider: "model",
        operation: "generate_sales_dossier",
        input_summary: `基于 ${citationInputs.length} 条证据生成 ${company.name} 最近档案`,
        output_summary: "模型 Provider 未启用。",
        error: { code: "provider_disabled", message: "Model provider is not enabled." },
      });
      if (this.runtimePolicy.fail_closed) {
        throw providerUnavailable("model", "The model provider is not enabled.");
      }
      return null;
    }
    const evidenceGroundingErrors = dossierGroundingErrors(citationInputs, null, company);
    if (evidenceGroundingErrors.length) {
      if (this.runtimePolicy.fail_closed) {
        throw new HttpError(422, "evidence_quality_insufficient", "可展示来源不足以生成正式销售档案。", {
          validation_errors: evidenceGroundingErrors,
        });
      }
    }
    const sourcePolicy = dossierSectionSourcePolicy(citationInputs, company);
    const targetName = String(company.name || company.legal_name || "").trim();
    const sourceSelectionPolicy = {
      business_database_ids: [...sourcePolicy.business],
      business_dynamics_ids: [...sourcePolicy.businessDynamics],
      risk_database_ids: [...sourcePolicy.risk],
      market_database_ids: [...sourcePolicy.market],
      professional_dataset_ids: [...sourcePolicy.professional],
      web_search_ids: [...sourcePolicy.web],
      excluded_entity_citation_ids: citationInputs
        .map((citation) => ({ citation, record: dossierBusinessEntityRecord(citation) }))
        .filter(({ record }) => (
          record
          && normalizeLegalEntityName(record.name)
            !== normalizeLegalEntityName(targetName)
        ))
        .map(({ citation }) => String(citation.id)),
    };
    const agentContext = buildDossierAgentContext({
      citations: citationInputs,
      evidencePolicy: evidencePack.policy || null,
      evidenceConflicts: evidencePack.conflicts || [],
      sourceSelectionPolicy,
      evidenceAtoms: evidenceCompilation.atoms,
      evidenceCoverage: evidenceCompilation.coverage,
    });
    const modelInstructions = [
      "你是销售情报平台中负责企业档案生成的受约束 Agent。",
      "只能基于每章 allowed_evidence 中的 Evidence Atom 生成，不要补编任何事实。",
      "本报告只能使用专业数据集和豆包搜索（联网搜索）两类外部来源；不得使用飞书资料、OpenViking 记忆或历史问答。",
      "专业数据集可能来自企业工商、企业风险、金融、汽车或科研学术等不同数据库；必须按章节选用语义匹配的来源，不得把所有专业数据都当作工商信息。",
      "专业数据集能够覆盖的主体、风险、财务、销量或科研事实，必须优先使用对应专业数据库；豆包搜索只补充近期公告、新闻、项目合作及专业库未覆盖的时效信息。",
      "风险与关注事项应优先使用本章 allowed_evidence 中的专业或官方 Atom；公开网页只用于交叉核验或补充公开动态。",
      "风险章节只能写来源直接披露的风险事实，或把明确事实改写为需要核验的具体事项；不得从单个项目、单笔金额或少量公告外推企业整体的订单结构、客户结构、收入结构、业务能力、回款状况或长期趋势。",
      ...((sourcePolicy.risk || new Set()).size ? [] : [
        "当前没有通过主体和内容门禁的专业风险数据库来源。风险与关注事项章不得写具体诉讼、处罚、失信、营收、利润、融资或估值结论；只能把 allowed_evidence 中已核验的主体或经营事实改写为具体的对接前核验事项，不得声称对方已存在该风险。",
      ]),
      "企业与业务概览应优先使用能够锚定法定主体的专业 Atom。",
      "经营与业务动态应优先使用本章 allowed_evidence 中语义匹配的专业经营、市场或科研 Atom。",
      "输出必须是固定六章节报告，且严格按顺序使用标题：企业与业务概览、经营与业务动态、近期公开动态、风险与关注事项、销售机会判断、建议行动。",
      "这是一份供销售人员使用的完整企业情报报告，不是接口执行摘要。每章固定生成一个完整段落，段落可以包含 1-3 个紧密相关的完整句子，并且必须包含有信息量的业务表述，不得只写“已返回数据”“可用于核验”“建议继续关注”等空泛模板句。",
      "正文只呈现企业事实、事件、影响、销售判断和行动，不得向用户解释检索过程、证据校验过程或数据源之间的差异。",
      "禁止在正文中出现“本次未检索到”“本次没有返回”“资料不足”“资料缺口”“来源冲突”“来源不一致”“来源存在差异”“关键字段存在来源差异”“冲突字段”“来源等级不足”等内部诊断话术。",
      "不得照抄搜索结果中的站点导航、作者日期前缀、注册引导、广告文字或被截断的摘要；每个事实句必须语义完整，括号和引号必须闭合，财务、产能和市占率数字必须带完整单位与上下文。",
      "某一章节的专业数据不足时，只能从该章 allowed_evidence 中选择语义匹配的公开事实补充；仍无可靠事实时不得编造或用检索状态、空泛模板凑成章节。",
      "Evidence Atom 的 entity_match=alias_scoped 表示来源只匹配品牌或简称。可以作为品牌、集团或相关业务动态写入，但必须明确主体边界，不得把它表述成输入法定主体已经发生的确定事实。",
      "企业与业务概览用于交代主体、主营方向、业务定位和来源能够直接支持的业务应用场景，不要罗列内部字段名，也不得在本章写采购场景、采购需求、采购计划或采购意向。",
      "静态的登记经营范围只能写成“经营范围包括”或“登记业务覆盖”，不得写成“延伸至”“扩展至”“布局扩展”等时序变化，也不得写成“主营”“同时承担”“形成业务定位”“已具备现实能力”或“制造基地法定主体”。",
      "销售机会判断可以把登记范围作为待确认的对接方向，但必须明确不代表现实业务、采购意向或预算。建议行动不得根据注册地址虚构已存在的厂区采购窗口或技术部门，应先确认负责相关业务的联系人。",
      "企业工商数据包含总公司、分公司或子公司记录时，成立日期、注册地址、注册号、统一社会信用代码和法定代表人必须绑定到公司名称完全一致的那条记录；不得把分支机构字段写成目标法定主体字段。只有正文逐字点名分支机构完整名称时，才允许引用该分支机构记录并描述其自身字段。",
      "正文提到任何分公司或子公司时，本章必须选择该分支机构自己的工商 Evidence Atom；如果本章没有该记录，就删除分支机构名称和相关断言，不得根据总公司记录补写分支布局、区域覆盖或市场承载能力。",
      "经营与业务动态只能写可由来源证明的经营变化、项目、合作、产能、供应链或业务动作；不得复制注册信息或描述检索结果来凑字数。",
      "若来源只是少量中标、成交或公告记录，只能逐项陈述这些项目，不得据此写企业整体已从某类业务扩展、转向或升级到另一类业务，也不得声称整体能力、市场或产品结构已经改变。",
      "近期公开动态应优先写清日期、事件、合作方或项目，以及该事件为何值得销售关注；不得只复述搜索标题。",
      "近期公开动态只陈述来源披露的事件与直接影响；不得把中标密度、公告节奏或框架入围写成对方采购需求、采购意向、预算或资源需求正在形成或活跃。此类内容只能在销售机会判断中作为明确标注的保守推断。",
      "同一个事实、事件或数字只能出现在一个最匹配的章节。经营与业务动态写业务变化，近期公开动态写有日期的公开事件，风险与关注事项写风险影响；不得在不同章节复制或轻微改写同一段来源内容。",
      "销售机会判断必须从已经引用的业务动作推导具体切入场景和时机，同时明确这只是机会判断，不能写成对方已有采购意向。",
      "建议行动必须具体到拟联系的部门或角色、需要核验的问题、可准备的材料和下一步动作，列出 1-2 项，信息量由证据决定，避免通用销售套话。",
      "每个自然段和每条编号行动都必须使用完整句子，并以句号、问号或感叹号结束；不得以逗号、冒号或分号收尾。",
      "不得展示企业内部主键、关联主键、trace id、request id、record id、接口名、Provider 名或原始响应字段。",
      "建议行动要具体到需要核验的对象、事项或销售动作；不得用内部客户沟通内容补齐外部事实。",
      "模型每章只提交 text 和 evidence_ids；quote、citation_id、URL、segment、citation_ids 与最终引用全部由服务端根据 Evidence Atom 确定性派生。",
      "只引用与正文事实直接相关的来源，不得为了增加引用数量而加入弱相关或重复来源；来源数量本身不是生成目标。",
      "source_usage_requirements 只描述当前可用来源，不设置整份报告引用数量门槛。证据充足时优先选择与各事实直接相关的独立来源；证据确实较少时应缩短报告，不得补编或凑引用。",
      "专业数据没有 URL 时也可以作为引用来源，但不能伪造链接。",
      "source_quality_label 表示来源等级，freshness_label 表示时效；过期资料和日期未知的公开来源不得表述为最新事实。",
      "注册资本、营收、净利润、融资、估值及明确的司法/处罚/失信事实属于高风险事实，至少引用两个独立外部来源，且至少一个必须是专业或官方来源。",
      "关键数字只有在两个独立来源返回同一数值时才可写成确定事实；若 evidence_conflicts 标记冲突，必须静默省略该数字，改写为其他有一致证据支持的实质事实，不得列出多个口径，也不得向前端解释冲突。",
    ];
    const validateGeneratedDossier = (answer) => {
      const normalizedAnswer = {
        ...(answer || {}),
        body: firstJsonArray(answer?.body).map((item, index) => {
          const title = DOSSIER_SECTION_TITLES[index];
          return {
            ...item,
            text: title
              ? cleanDossierBodyText(item?.text, title, "", 1400)
              : String(item?.text || ""),
          };
        }),
      };
      const validatedAnswer = validateDossierModelAnswer(normalizedAnswer, citationInputs);
      return {
        ...validatedAnswer,
        errors: [
          ...validatedAnswer.errors,
          ...dossierSectionSourceErrors(validatedAnswer.body, citationInputs, company),
          ...dossierSectionContentErrors(validatedAnswer.body),
          ...dossierSectionSemanticErrors(validatedAnswer.body, citationInputs, company),
          ...dossierSectionEvidenceGroundingErrors(validatedAnswer.body, citationInputs),
          ...dossierSourceUsageErrors(
            validatedAnswer.body.flatMap((paragraph) => paragraph.citation_ids || []),
            agentContext.citations,
            agentContext.sourceUsageRequirements,
          ),
          ...(String(answer?.summary || "").length > 160 ? ["档案摘要超过 160 个字符"] : []),
          ...(String(answer?.memory_summary || "").length > 200 ? ["记忆摘要超过 200 个字符"] : []),
        ],
      };
    };
    const agent = new DossierAgent({
      maxCalls: Number(this.env.value("DOSSIER_AGENT_MAX_CALLS", "3")) || 3,
      validate: validateGeneratedDossier,
      callModel: async (request) => {
        if (typeof this.modelProvider.callRequiredFunction !== "function") {
          throw new Error("The model provider does not implement strict Function Calling.");
        }
        return this.trackProviderStep(providerRunId, {
          provider: "model",
          operation: request.operation,
          input_summary: request.operation === "sales_dossier_agent_plan"
            ? `基于 ${citationInputs.length} 条已核验证据规划 ${company.name} 的六章节报告`
            : `根据质量门禁反馈修订 ${company.name} 的六章节报告规划`,
          output_summary: request.operation === "sales_dossier_agent_plan"
            ? "档案 Agent 已提交六章节事实、判断、行动与逐项引用规划。"
            : "档案 Agent 已提交修订后的六章节规划。",
        }, () => this.modelProvider.callRequiredFunction(request));
      },
    });
    try {
      const agentResult = await agent.run({
        company: {
          name: company.name,
          industry: company.industry,
          location: company.location,
        },
        citations: citationInputs,
        evidenceAtoms: evidenceCompilation.atoms,
        evidenceCoverage: evidenceCompilation.coverage,
        evidencePolicy: evidencePack.policy || null,
        evidenceConflicts: evidencePack.conflicts || [],
        sourceSelectionPolicy,
        instructions: modelInstructions,
      });
      if (!agentResult.ok) {
        if (this.runtimePolicy.fail_closed) {
          throw providerUnavailable("model", "The dossier Agent did not produce a valid result.", {
            reason: agentResult.result?.error?.code || "dossier_quality_gate_failed",
            validation_errors: agentResult.validation_errors,
          });
        }
        return null;
      }
      const normalizedDossier = this.normalizeModelDossier(
        company,
        agentResult.submission,
        citationInputs,
        agentResult.result?.raw_ref,
      );
      if (!normalizedDossier && this.runtimePolicy.fail_closed) {
        throw providerUnavailable("model", "The dossier Agent result failed final display validation.", {
          reason: "dossier_quality_gate_failed",
          validation_errors: ["档案在最终结构化与展示清洗后不再满足六章节、有效引用和正文质量要求。"],
        });
      }
      if (normalizedDossier) {
        const publicView = this.publicDossier(normalizedDossier);
        const publicViewErrors = this.publicDossierQualityErrors(publicView, company);
        if (publicViewErrors.length) {
          if (this.runtimePolicy.fail_closed) {
            throw providerUnavailable("model", "The dossier Agent result failed the final public-view quality gate.", {
              reason: "public_dossier_quality_gate_failed",
              validation_errors: publicViewErrors,
            });
          }
        }
      }
      return normalizedDossier;
    } catch (error) {
      if (this.runtimePolicy.fail_closed) {
        if (error instanceof HttpError) throw error;
        throw providerUnavailable("model", "Dossier generation failed.", {
          reason: error.message || "provider_error",
        });
      }
      return null;
    }
  }

  buildCitationInputs(collected, memoryContexts) {
    if (Array.isArray(collected?.items) && collected?.evidence_hash) {
      return normalizeDossierCitationSemantics(evidencePackCitations(collected)
        .filter((citation) => /专业数据集|联网搜索/.test(citation.source_kind))
        .filter((citation) => cleanEvidenceSummary(citation.summary)));
    }
    const citations = [];
    for (const source of collected.professional || []) {
      citations.push({
        id: String(citations.length + 1),
        label: source.label,
        source_kind: "专业数据集",
        url: "",
        summary: source.summary,
        provider_mode: source.provider_mode || "",
        raw_ref: source.raw_ref || "",
        query: source.query || "",
        purpose: source.purpose || "",
        published_at: source.published_at || null,
        site_name: source.site_name || "",
        auth_description: source.auth_description || "",
        auth_level: source.auth_level ?? null,
        rank_score: source.rank_score ?? null,
      });
    }
    for (const source of collected.public_sources || []) {
      citations.push({
        id: String(citations.length + 1),
        label: source.label,
        source_kind: "联网搜索",
        url: source.url || "",
        summary: source.summary,
        provider_mode: source.provider_mode || "",
        raw_ref: source.raw_ref || "",
        query: source.query || "",
        purpose: source.purpose || "",
      });
    }
    return normalizeDossierCitationSemantics(citations.filter((citation) => (
      /专业数据集|联网搜索/.test(citation.source_kind)
      && cleanEvidenceSummary(citation.summary)
    )));
  }

  normalizeModelDossier(company, parsed, citationInputs, rawRef) {
    const allowed = new Map(citationInputs.map((item) => [String(item.id), item]));
    const body = firstJsonArray(parsed?.body)
      .slice(0, DOSSIER_SECTION_TITLES.length)
      .map((item, index) => {
        const title = DOSSIER_SECTION_TITLES[index];
        const segments = firstJsonArray(item.segments)
          .map((segment) => ({
            text: ensureDossierLinePunctuation(
              normalizeImportedText(normalizeSalesText(segment.text))
                .replace(/\s+/g, " ")
                .trim(),
            ),
            citation_ids: firstJsonArray(segment.citation_ids)
              .map(String)
              .filter((id) => (
                allowed.has(id)
                && /专业数据集|联网搜索/.test(allowed.get(id)?.source_kind || "")
              )),
          }))
          .filter((segment) => (
            segment.text
            && segment.citation_ids.length
            && !hasBadDisplayText(segment.text)
            && !hasDossierInternalMetaText(segment.text)
          ));
        const text = cleanDossierBodyText(
          segments.length
            ? `${title}：${segments.map((segment) => segment.text).join("\n\n")}`
            : item.text,
          title,
          "",
          1400,
        );
        return {
          text,
          citation_ids: [...new Set(segments.length
            ? segments.flatMap((segment) => segment.citation_ids)
            : firstJsonArray(item.citation_ids).map(String).filter((id) => allowed.has(id)))],
          segments,
        };
      });
    if (body.length !== DOSSIER_SECTION_TITLES.length) return null;
    if (body.some((item) => (
      !item.text
      || !item.citation_ids.length
      || !item.segments.length
      || hasBadDisplayText(item.text)
      || hasDossierInternalMetaText(item.text)
    ))) return null;
    const validatedBody = validateDossierModelAnswer({ body }, citationInputs);
    const structuredBody = validatedBody.body;
    const finalErrors = [
      ...validatedBody.errors,
      ...dossierSectionSourceErrors(structuredBody, citationInputs, company),
      ...dossierSectionContentErrors(structuredBody),
      ...dossierSectionSemanticErrors(structuredBody, citationInputs, company),
      ...dossierSectionEvidenceGroundingErrors(structuredBody, citationInputs),
    ];
    if (finalErrors.length) return null;
    const structuredSummary = [
      structuredBody.find((item) => item.text.startsWith("近期公开动态："))?.text.replace(/^近期公开动态：/, ""),
      structuredBody.find((item) => item.text.startsWith("销售机会判断："))?.text.replace(/^销售机会判断：/, ""),
    ].filter(Boolean).join(" ");
    const parsedSummary = cleanEvidenceSummary(parsed.summary, "", 300);
    const now = nowIso();
    return {
      id: makeId("dossier"),
      company_id: company.id,
      title: `${company.name} 销售情报报告`,
      summary: compactCompleteSentences(
        isSubstantiveDossierSummary(structuredSummary) ? structuredSummary : parsedSummary,
        300,
      ),
      created_at: now,
      body: structuredBody,
      citations: citationInputs,
      memory_summary: cleanEvidenceSummary(parsed.memory_summary, structuredBody.map((item) => item.text).join(" "), 600),
      raw_ref: rawRef || null,
    };
  }

  buildRuleDossier(company, collected, memoryContexts) {
    const citations = this.buildCitationInputs(collected, memoryContexts);
    if (!citations.length) {
      const now = nowIso();
      const body = [
        { text: "企业与业务概览：暂未从专业数据集获取到可引用的企业信息。", citation_ids: [] },
        { text: "经营与业务动态：当前没有足够的专业数据支撑经营与业务变化判断。", citation_ids: [] },
        { text: "近期公开动态：暂未从豆包搜索获取到带日期和原始链接的近期公开信息。", citation_ids: [] },
        { text: "风险与关注事项：资料不足，当前不输出确定的风险结论。", citation_ids: [] },
        { text: "销售机会判断：资料不足，当前不推断采购意向、预算或销售阶段。", citation_ids: [] },
        { text: "建议行动：请稍后重新获取报告，并确认专业数据集和豆包搜索可正常返回来源。", citation_ids: [] },
      ];
      return {
        id: makeId("dossier"),
        company_id: company.id,
        title: `${company.name} 销售情报报告`,
        summary: "暂未获取到可引用的新变化。",
        created_at: now,
        body,
        citations: [],
        memory_summary: `${company.name} 销售情报报告暂未获取到可引用的新变化。`,
        raw_ref: null,
      };
    }
    const now = nowIso();
    const body = this.reportDossierBody(company, citations);
    return {
      id: makeId("dossier"),
      company_id: company.id,
      title: `${company.name} 销售情报报告`,
      summary: compactCompleteSentences(body.find((item) => item.text.startsWith("近期公开动态："))?.text.replace(/^近期公开动态：/, "") || body[0].text.replace(/^企业与业务概览：/, ""), 300),
      created_at: now,
      body,
      citations,
      memory_summary: compactText(`${company.name} 销售情报报告已更新：${body.map((item) => item.text).join(" ")}`, 600),
      raw_ref: null,
    };
  }

  reportDossierBody(company, citations, preferredBody = []) {
    const externalCitations = citations.filter((item) => /专业数据集|联网搜索/.test(item.source_kind || ""));
    const allowedIds = new Set(externalCitations.map((item) => String(item.id)));
    const preferred = preferredBody
      .slice(0, DOSSIER_SECTION_TITLES.length)
      .map((item, index) => ({
        text: cleanDossierBodyText(item.text, DOSSIER_SECTION_TITLES[index], "", 1400),
        citation_ids: firstJsonArray(item.citation_ids).map(String).filter((id) => allowedIds.has(id)),
      }))
      .filter((item) => (
        item.text
        && item.citation_ids.length
        && !hasBadDisplayText(item.text)
        && !hasDossierInternalMetaText(item.text)
      ));
    const completePreferred = DOSSIER_SECTION_TITLES.every((title, index) => (
      preferred[index]?.text.startsWith(`${title}：`)
    ))
      && dossierSectionSourceErrors(preferred, externalCitations, company).length === 0
      && dossierSectionContentErrors(preferred).length === 0
      && dossierSectionSemanticErrors(preferred, externalCitations, company).length === 0
      && dossierSectionEvidenceGroundingErrors(preferred, externalCitations).length === 0;
    if (completePreferred) return preferred.slice(0, DOSSIER_SECTION_TITLES.length);

    const professional = externalCitations.filter((item) => item.source_kind === "专业数据集");
    const publicSources = externalCitations.filter((item) => item.source_kind === "联网搜索");
    const uniqueEvidence = (items) => items.filter((item, index, values) => {
      const identity = String(item.point || "")
        .toLowerCase()
        .replace(/[\s，。；：！？、,.!?;:'"“”‘’（）()【】[\]《》<>-]/gu, "");
      return identity && values.findIndex((candidate) => (
        String(candidate.point || "")
          .toLowerCase()
          .replace(/[\s，。；：！？、,.!?;:'"“”‘’（）()【】[\]《》<>-]/gu, "")
        === identity
      )) === index;
    });
    const targetEntityKey = normalizeLegalEntityName(company.name || company.legal_name || "");
    const professionalEvidence = uniqueEvidence(professional
      .map((source) => ({
        source,
        point: safeDeterministicDossierPoint(conciseProfessionalPoint(source, company.name)),
      }))
      .filter((item) => (
        item.point
        && !isLowValueProfessionalPoint(item.point)
        && isSubstantiveDossierEvidencePoint(item.point)
        && (() => {
          const record = dossierBusinessEntityRecord(item.source);
          return !record || normalizeLegalEntityName(record.name) === targetEntityKey;
        })()
      )));
    const reportSourcePolicy = dossierSectionSourcePolicy(externalCitations, company);
    const companyEvidence = professionalEvidence.filter((item) => {
      const record = dossierBusinessEntityRecord(item.source);
      return Boolean(record && normalizeLegalEntityName(record.name) === targetEntityKey);
    });
    const marketEvidence = professionalEvidence.filter((item) => (
      !dossierBusinessEntityRecord(item.source)
      && (
        reportSourcePolicy.market.has(String(item.source.id))
        || /金融数据库|汽车销量数据库|科研学术数据搜索服务/.test(String(item.source.label || ""))
        || /经营|市场|技术|产能|销量|科研|专利/.test(`${item.source.purpose || ""} ${item.source.query || ""}`)
      )
    ));
    const selectedCompanyEvidence = (companyEvidence.length ? companyEvidence : professionalEvidence).slice(0, 2);
    const selectedMarketEvidence = marketEvidence
      .filter((item) => !selectedCompanyEvidence.some((candidate) => candidate.source.id === item.source.id))
      .slice(0, 2);
    const professionalIds = professionalEvidence.map((item) => String(item.source.id));
    const companyIds = selectedCompanyEvidence.map((item) => String(item.source.id));
    const companyPoints = selectedCompanyEvidence.map((item) => item.point);
    const publicEvidence = uniqueEvidence(publicSources
      .map((source) => ({
        source,
        point: safeDeterministicDossierPoint(concisePublicPoint(source)),
      }))
      .filter((item) => (
        item.point
        && !isLowValuePublicDossierSource(item.source, item.point)
        && isPublicCitationRelevantToCompany(item.source, item.point, company)
      ))
      .sort((a, b) => (
        publicDossierEvidenceScore(b.source, b.point, company)
        - publicDossierEvidenceScore(a.source, a.point, company)
      )));
    const publicIds = publicEvidence.map((item) => String(item.source.id));
    const allIds = [...new Set([...professionalIds, ...publicIds])];
    const professionalRiskEvidence = professionalEvidence
      .filter((item) => (
        item.point
        && !dossierBusinessEntityRecord(item.source)
        && (
          DOSSIER_RISK_TERMS.test(`${item.source.label || ""} ${item.source.purpose || ""} ${item.source.query || ""}`)
          || DOSSIER_RISK_TERMS.test(item.point)
        )
      ));
    const publicRiskEvidence = publicEvidence.filter((item) => (
      isPublicRiskEvidenceForCompany(item.source, item.point, company)
    ));
    const selectedRiskEvidence = (
      professionalRiskEvidence.length
        ? professionalRiskEvidence
        : publicRiskEvidence
    ).slice(0, 2);
    const selectedRiskSourceIds = new Set(
      selectedRiskEvidence.map((item) => String(item.source.id)),
    );
    const publicBusinessEvidence = publicEvidence
      .filter((item) => !selectedRiskSourceIds.has(String(item.source.id)))
      .filter((item) => DOSSIER_ACTION_TERMS.test(`${item.point} ${item.source.label || ""}`))
      .slice(0, 1);
    const selectedBusinessEvidence = selectedMarketEvidence.length
      ? selectedMarketEvidence
      : publicBusinessEvidence;
    const selectedBusinessSourceIds = new Set(
      selectedBusinessEvidence.map((item) => String(item.source.id)),
    );
    const recentEvidence = publicEvidence
      .filter((item) => !selectedRiskSourceIds.has(String(item.source.id)))
      .filter((item) => !selectedBusinessSourceIds.has(String(item.source.id)))
      .filter((item) => isRecentPublicDossierCitation(item.source, item.point, company))
      .slice(0, 3);
    const riskIds = selectedRiskEvidence.map((item) => String(item.source.id));
    const businessPoints = selectedBusinessEvidence.map((item) => item.point);
    const recentPoints = recentEvidence.map((item) => item.point);
    const evidencePoints = [
      ...companyPoints,
      ...businessPoints,
      ...recentPoints,
      ...selectedRiskEvidence.map((item) => item.point),
    ];
    const themes = dossierSalesThemes(evidencePoints, company);
    const themeText = themes.join("、");
    const professionalFallback = professionalEvidence.slice(0, 2).map((item) => item.point);
    const companyFactText = (companyPoints.length ? companyPoints : professionalFallback).join("；");
    const companyText = companyFactText
      ? (
        companyFactText.length >= 24
          ? companyFactText
          : `${companyFactText}。该主体的业务定位集中于${themeText}相关产品与服务。`
      )
      : `${company.name}的专业数据记录已完成主体匹配，业务跟进可从${themeText}展开。`;
    const businessTextValue = businessPoints.length
      ? `${businessPoints.join("；")}。上述业务动作指向${themeText}相关的经营与技术方向，销售团队可据此确认当前产品线、项目节奏和采购责任部门。`
      : publicEvidence.length
        ? `近期公开业务信息主要涉及${themeText}。经营跟进应进一步确认对应业务部门、实施阶段、合作对象和采购责任链。`
        : `专业数据所示业务范围集中在${themeText}。经营跟进应围绕当前产品线、重点项目、交付安排和采购组织核实实际变化。`;
    const timelineEvidence = publicEvidence.find((item) => (
      !selectedRiskSourceIds.has(String(item.source.id))
      && isRecentPublicDossierCitation(item.source, item.point, company)
    )) || publicEvidence[0];
    const timelineDate = String(timelineEvidence?.source?.published_at || "").slice(0, 10);
    const timelinePrefix = timelineDate ? `截至${timelineDate}，` : "根据近期公开信息，";
    const recentText = recentPoints.length
      ? recentPoints.join("；")
      : `${timelinePrefix}${company.name}的公开业务动向主要涉及${themeText}。后续应持续跟踪相关事项的正式公告、项目落地、合作方和采购进展。`;
    const riskText = selectedRiskEvidence.length
      ? `${selectedRiskEvidence.map((item) => item.point).join("；")}。商务推进应进一步确认相关事项对准入、合同责任、供应保障和交付排期的影响边界。`
      : `结合已核验的主体信息和近期公开事项，商务推进应把供应商准入、数据合规、合同责任、供应保障和交付排期作为前置核验项，避免在责任边界未确认前作出方案或时间承诺。`;
    const opportunityText = `基于现有专业数据和近期公开事项，可优先验证${themeText}相关的采购、技术协同或项目交付场景。首轮沟通应确认牵头部门、预算窗口和决策链，再判断线索优先级；这属于销售机会判断，不代表对方已经形成采购意向。`;
    const actionText = [
      `1. 围绕${themeText}确认牵头业务部门、采购负责人和最终决策角色。`,
      "2. 针对近期公开事项逐项核验项目阶段、时间表、采购范围和预算来源。",
      `3. 准备与${themeText}匹配的产品方案、客户案例、交付边界和验收指标。`,
      "4. 在进入商务报价前确认供应商准入、数据合规、合同责任和实施风险。",
    ].join("\n");
    const fallbackIds = allIds.length ? allIds : [...allowedIds];
    const companySectionIds = (companyIds.length ? companyIds : professionalIds.length ? professionalIds : fallbackIds).slice(0, 3);
    const businessSectionIds = (
      selectedBusinessEvidence.length
        ? [
          ...selectedBusinessEvidence.map((item) => String(item.source.id)),
          ...(selectedMarketEvidence.length ? [] : companySectionIds),
        ]
        : publicEvidence.length
          ? [String(publicEvidence[0].source.id), ...companySectionIds]
          : companySectionIds
    ).filter((id, index, values) => id && values.indexOf(id) === index).slice(0, 4);
    const recentSectionIds = (
      recentEvidence.length
        ? recentEvidence.map((item) => String(item.source.id))
        : timelineEvidence
          ? [String(timelineEvidence.source.id)]
          : publicIds.length
            ? publicIds
            : fallbackIds
    ).slice(0, 3);
    const riskSectionIds = [
      ...riskIds,
      ...companySectionIds,
    ].filter((id, index, values) => id && values.indexOf(id) === index).slice(0, 4);
    const decisionSectionIds = [
      ...(professionalIds.length ? professionalIds : companySectionIds),
      ...recentSectionIds,
    ].filter((id, index, values) => id && values.indexOf(id) === index).slice(0, 4);
    const report = [
      {
        text: `企业与业务概览：${companyText}`,
        citation_ids: companySectionIds,
      },
      {
        text: `经营与业务动态：${businessTextValue}`,
        citation_ids: businessSectionIds,
      },
      {
        text: `近期公开动态：${recentText}`,
        citation_ids: recentSectionIds,
      },
      {
        text: `风险与关注事项：${riskText}`,
        citation_ids: riskSectionIds,
      },
      {
        text: `销售机会判断：${opportunityText}`,
        citation_ids: decisionSectionIds,
      },
      {
        text: `建议行动：${actionText}`,
        citation_ids: decisionSectionIds,
      },
    ];
    return report.map((item, index) => ({
      text: cleanDossierBodyText(item.text, DOSSIER_SECTION_TITLES[index], item.text, 1400),
      citation_ids: item.citation_ids.filter((id) => allowedIds.has(id)),
    }));
  }

  fixedDossierBody(company, citations, preferredBody = []) {
    const professionalIds = citations.filter((item) => item.source_kind === "专业数据集").map((item) => item.id);
    const webIds = citations.filter((item) => item.source_kind === "联网搜索").map((item) => item.id);
    const internalIds = citations.filter((item) => item.source_kind === "内部资料").map((item) => item.id);
    const allIds = citations.map((item) => item.id);
    const professionalSources = citations.filter((item) => item.source_kind === "专业数据集");
    const webSources = citations.filter((item) => item.source_kind === "联网搜索");
    const firstProfessional = professionalSources[0];
    const webPoints = webSources
      .slice(0, 3)
      .map((source) => concisePublicPoint(source))
      .filter(Boolean);
    const professionalPoints = professionalSources
      .slice(0, 3)
      .map((source) => conciseProfessionalPoint(source))
      .filter((point) => point && !isLowValueProfessionalPoint(point));
    const preferredCompanyText = preferredBody.find((item) => /^企业情况：/.test(item.text))?.text;
    const preferredCompanyIds = firstJsonArray(preferredBody.find((item) => /^企业情况：/.test(item.text))?.citation_ids)
      .filter((id) => professionalIds.includes(id) || webIds.includes(id));
    const companyText = firstProfessional
      ? (preferredCompanyText && !isWeakCompanySituationText(preferredCompanyText)
        ? preferredCompanyText
        : `企业情况：专业数据库显示：${professionalPoints.join("；") || `${company.name} 的可引用企业信息`}。`)
      : `企业情况：本次专业数据库未返回可引用结果，当前档案不输出工商核验结论。`;
    const preferredLatestText = preferredBody.find((item) => /^近期动态：/.test(item.text))?.text;
    const preferredLatestIds = firstJsonArray(preferredBody.find((item) => /^近期动态：/.test(item.text))?.citation_ids)
      .filter((id) => professionalIds.includes(id) || webIds.includes(id));
    const latestText = (preferredLatestText && !isOverlongLatestText(preferredLatestText) ? preferredLatestText : "")
      || (webPoints.length
        ? `近期动态：联网搜索返回 ${webPoints.length} 条可引用公开来源，主要提到：${webPoints.join("；")}。`
        : "近期动态：联网搜索暂未返回可引用的新公告、新闻或招投标摘要。");
    const judgmentText = professionalIds.length
      ? (preferredBody.find((item) => /^销售判断：/.test(item.text))?.text
        || `销售判断：专业数据库可用于核验企业主体事实，联网搜索补充近期公开动态；当前信息适合作为下一轮销售沟通前的背景材料。`)
      : `销售判断：本次只能依据联网搜索判断公开动态，缺少专业数据库的工商/风险核验，销售推进判断应保持谨慎。`;
    const nextText = preferredBody.find((item) => /^下一步建议：/.test(item.text))?.text
      || (professionalIds.length
        ? `下一步建议：结合专业数据库核验结果和公开动态，继续确认预算窗口、采购节奏、供应商准入和数据合规要求。`
        : `下一步建议：优先补齐专业数据库权限，再围绕预算窗口、采购节奏、供应商准入和数据合规要求继续确认。`);
    const preferredJudgmentIds = firstJsonArray(preferredBody.find((item) => /^销售判断：/.test(item.text))?.citation_ids)
      .filter((id) => allIds.includes(id));
    const preferredNextIds = firstJsonArray(preferredBody.find((item) => /^下一步建议：/.test(item.text))?.citation_ids)
      .filter((id) => allIds.includes(id));
    return [
      {
        text: companyText.startsWith("企业情况：") ? companyText : `企业情况：${companyText}`,
        citation_ids: preferredCompanyIds.length ? preferredCompanyIds : professionalIds.slice(0, 2),
      },
      {
        text: latestText.startsWith("近期动态：") ? latestText : `近期动态：${latestText}`,
        citation_ids: preferredLatestIds.length
          ? preferredLatestIds
          : webIds.length ? webIds.slice(0, 3) : professionalIds.slice(0, 1),
      },
      {
        text: judgmentText.startsWith("销售判断：") ? judgmentText : `销售判断：${judgmentText}`,
        citation_ids: preferredJudgmentIds.length
          ? preferredJudgmentIds
          : [...new Set([...professionalIds.slice(0, 2), ...webIds.slice(0, 3), ...internalIds.slice(0, 2)])].slice(0, 5),
      },
      {
        text: nextText.startsWith("下一步建议：") ? nextText : `下一步建议：${nextText}`,
        citation_ids: preferredNextIds.length
          ? preferredNextIds
          : [...new Set([...internalIds.slice(0, 2), ...webIds.slice(0, 2), ...professionalIds.slice(-1)])].slice(0, 5),
      },
    ].map((item) => ({
      text: cleanEvidenceSummary(item.text, item.text, 520),
      citation_ids: item.citation_ids.filter((id) => allIds.includes(id)),
    }));
  }

  fixedPublicDossierBody(dossier, body, company = {}, validationCitations = null) {
    const citations = Array.isArray(validationCitations)
      ? validationCitations
      : firstJsonArray(dossier.citations);
    if (body.length !== DOSSIER_SECTION_TITLES.length) return [];
    const normalizedBody = body.slice(0, DOSSIER_SECTION_TITLES.length).map((item, index) => {
      const title = DOSSIER_SECTION_TITLES[index];
      const sourceSegments = firstJsonArray(item.segments);
      const segments = (sourceSegments.length
        ? sourceSegments
        : [{
          text: stripDossierSectionTitle(item.text),
          citation_ids: firstJsonArray(item.citation_ids),
        }])
        .map((segment) => ({
          text: ensureDossierLinePunctuation(
            normalizeImportedText(normalizeSalesText(segment.text))
              .replace(/\s+/g, " ")
              .trim(),
          ),
          citation_ids: [...new Set(firstJsonArray(segment.citation_ids).map(String))],
        }))
        .filter((segment) => segment.text && segment.citation_ids.length);
      return {
        ...item,
        text: normalizeDossierSectionText(item.text, title),
        citation_ids: [...new Set(firstJsonArray(item.citation_ids).map(String))],
        segments,
      };
    });
    const reportReady = DOSSIER_SECTION_TITLES.every((title, index) => (
      normalizedBody[index]?.text?.startsWith(`${title}：`)
      && normalizedBody[index]?.citation_ids?.length
      && normalizedBody[index]?.segments?.length
      && normalizedBody[index].segments.every((segment) => segment.citation_ids.length)
    ));
    if (!reportReady) return [];
    if (normalizedBody.some((item) => hasTechnicalErrorText(item.text))) return [];
    if (dossierSectionContentErrors(normalizedBody).length) return [];
    if (dossierSectionSemanticErrors(normalizedBody, citations, company).length) return [];
    if (dossierSectionEvidenceGroundingErrors(normalizedBody, citations).length) return [];
    return normalizedBody;
  }

  progressFromDossier(company, dossier) {
    const text = [dossier.summary, dossier.memory_summary].join(" ");
    let label = "需求确认中";
    if (/预算|排期/.test(text)) label = "需求确认中";
    if (/初步|公开资料|缺少内部/.test(text)) label = "初步接触";
    if (/暂无|不足/.test(text)) label = "暂无有效信号";
    return {
      label,
      summary: conciseProgressSummary(label, dossier.memory_summary || dossier.summary),
      evidence: "依据：最近档案和引用来源",
      updated_at: nowIso(),
    };
  }

  async storeDossierMemory(company, dossier, providerRunId = "") {
    if (!this.openVikingProvider?.isRunEnabled?.()) {
      await this.skipProviderStep(providerRunId, {
        provider: "openviking",
        operation: "store_dossier_memory",
        input_summary: `写入 ${company.name} 的档案摘要`,
        output_summary: "OpenViking 写入未启用。",
        error: { code: "provider_disabled", message: "OpenViking writes are not enabled." },
      });
      if (this.runtimePolicy.fail_closed) {
        throw providerUnavailable("openviking", "OpenViking writes are not enabled.");
      }
      return { status: "skipped", summary: "OpenViking 写入未启用。" };
    }
    try {
      const uri = this.openVikingProvider.salesDossierUri({
        workspaceId: this.workspaceId,
        companyId: company.id,
        dossierId: dossier.id,
      });
      const content = [
        `# ${dossier.title}`,
        "",
        `企业：${company.name}`,
        `档案 ID：${dossier.id}`,
        `生成时间：${dossier.generated_at || dossier.created_at || nowIso()}`,
        `摘要：${dossier.summary || ""}`,
        `长期资料：${dossier.memory_summary || dossier.summary || ""}`,
      ].join("\n");
      const result = await this.trackProviderStep(providerRunId, {
        provider: "openviking",
        operation: "store_dossier_memory",
        input_summary: `写入 ${company.name} 的档案摘要`,
        output_summary: "档案摘要已提交至 OpenViking。",
      }, () => this.openVikingProvider.upsertTextResource({
        uri,
        content,
        mode: "create",
      }));
      const record = {
        status: result.ok ? result.processing_status || "ready" : "failed",
        raw_ref: result.raw_ref || null,
        summary: result.ok
          ? result.processing_status === "queued"
            ? "最近档案结论已提交 OpenViking，正在异步建立索引。"
            : "最近档案结论已写入 OpenViking 长期记忆。"
          : `OpenViking 写入失败：${result.error?.code || "provider_error"}`,
      };
      if (!result.ok && this.runtimePolicy.fail_closed) {
        throw providerUnavailable("openviking", "OpenViking dossier-memory write failed.", {
          reason: result.error?.code || "provider_error",
        });
      }
      return record;
    } catch (error) {
      if (this.runtimePolicy.fail_closed) {
        if (error instanceof HttpError) throw error;
        throw providerUnavailable("openviking", "OpenViking dossier-memory write failed.", {
          reason: error.message || "provider_error",
        });
      }
      return {
        status: "failed",
        raw_ref: null,
        summary: `OpenViking 写入失败：${error.message || "provider_error"}`,
      };
    }
  }

  listMaterials(companyId) {
    const company = this.requireCompany(companyId);
    return (company.material_ids || []).map((id) => this.data.materials[id]).filter(Boolean).map((material) => ({
      id: material.id,
      title: compactText(normalizeSalesText(material.title), 120),
      summary: compactText(normalizeSalesText(material.summary || ""), 280),
      source_type: compactText(material.source_type || "", 24),
      source_url: publicSourceUrl(material.source_url),
      source_id: material.source_id || null,
      source_version: material.source_version || "",
      content_hash: material.content_hash || null,
      last_synced_at: material.last_synced_at || null,
      updated_at: material.updated_at,
      memory_status: material.openviking_status || (material.openviking_uri ? "indexed" : "pending"),
      memory_ready: ["ready", "indexed"].includes(material.openviking_status || (material.openviking_uri ? "indexed" : "pending")),
    }));
  }

  listMaterialSyncSources(companyId) {
    const company = this.requireCompany(companyId);
    const materials = (company.material_ids || []).map((id) => this.data.materials[id]).filter(Boolean);
    const grouped = new Map();
    for (const material of materials) {
      if (!material.source_id) continue;
      const items = grouped.get(material.source_id) || [];
      items.push(material);
      grouped.set(material.source_id, items);
    }

    return [...grouped.entries()].map(([sourceId, sourceMaterials]) => {
      const source = this.data.sync_sources?.[sourceId] || null;
      const checkpoint = Object.values(this.data.sync_checkpoints || {})
        .filter((item) => item?.source_id === sourceId)
        .sort((left, right) => String(right.updated_at || "").localeCompare(String(left.updated_at || "")))[0] || null;
      const latestMaterial = [...sourceMaterials]
        .sort((left, right) => String(right.updated_at || "").localeCompare(String(left.updated_at || "")))[0];
      const openVikingStatuses = sourceMaterials.reduce((counts, material) => {
        const status = material.openviking_status || (material.openviking_uri ? "indexed" : "pending");
        counts[status] = (counts[status] || 0) + 1;
        return counts;
      }, {});
      return {
        id: sourceId,
        source_type: compactText(source?.source_type || latestMaterial?.source_type || "manual", 24),
        external_id: compactText(source?.external_id || latestMaterial?.source_external_id || "", 240),
        display_name: compactText(source?.display_name || latestMaterial?.title || "资料同步源", 120),
        status: source?.status || "unmanaged",
        material_count: sourceMaterials.length,
        material_ids: sourceMaterials.map((material) => material.id),
        last_synced_at: source?.last_synced_at || latestMaterial?.last_synced_at || null,
        updated_at: source?.updated_at || latestMaterial?.updated_at || null,
        checkpoint: checkpoint ? {
          checkpoint_key: checkpoint.checkpoint_key || "latest",
          checkpoint_value: checkpoint.checkpoint_value || "",
          last_success_at: checkpoint.last_success_at || null,
          error: checkpoint.error || null,
          updated_at: checkpoint.updated_at || null,
        } : null,
        openviking_statuses: openVikingStatuses,
      };
    }).sort((left, right) => String(right.updated_at || "").localeCompare(String(left.updated_at || "")));
  }

  resolveMaterialSyncContext(company, input = {}, { requireExisting = false } = {}) {
    const requestedSourceId = compactText(input.source_id || input.sourceId || "", 240);
    if (requestedSourceId) {
      const material = (company.material_ids || [])
        .map((id) => this.data.materials[id])
        .find((item) => item?.source_id === requestedSourceId) || null;
      const source = this.data.sync_sources?.[requestedSourceId] || null;
      if (!material || !source) {
        throw new HttpError(404, "sync_source_not_found", "当前企业未找到对应的资料同步源。", {
          source_id: requestedSourceId,
          company_id: company.id,
        });
      }
      const checkpoint = Object.values(this.data.sync_checkpoints || {})
        .filter((item) => item?.source_id === requestedSourceId)
        .sort((left, right) => String(right.updated_at || "").localeCompare(String(left.updated_at || "")))[0] || null;
      return {
        identity: {
          source_id: requestedSourceId,
          material_id: material.id,
          checkpoint_key: checkpoint?.checkpoint_key || "latest",
        },
        source,
        checkpoint,
        material,
      };
    }

    const identity = buildMaterialSyncIdentity(company.id, input);
    const source = this.data.sync_sources?.[identity.source_id] || null;
    const checkpoint = this.data.sync_checkpoints?.[`${identity.source_id}:${identity.checkpoint_key}`] || null;
    const material = this.data.materials?.[identity.material_id]
      || (company.material_ids || []).map((id) => this.data.materials[id]).find((item) => item?.source_id === identity.source_id)
      || null;
    if (requireExisting && (!source || !material)) {
      throw new HttpError(404, "sync_source_not_found", "当前企业未找到对应的资料同步源。", {
        source_id: identity.source_id,
        company_id: company.id,
      });
    }
    return { identity, source, checkpoint, material };
  }

  async restoreMaterialContent(material) {
    if (!material) return null;
    if (cleanMaterialText(material.text) || normalizeSourceItems(material.source_items).length) {
      return material;
    }
    const uri = compactText(material.openviking_uri || material.openviking_ref || "", 1000);
    if (!uri || typeof this.openVikingProvider?.readTextResource !== "function") {
      if (this.runtimePolicy.fail_closed) {
        throw providerUnavailable("openviking", "Existing material content cannot be restored from OpenViking.", {
          material_id: material.id,
          reason: uri ? "read_not_supported" : "missing_resource_uri",
        });
      }
      return material;
    }

    const result = await this.openVikingProvider.readTextResource(uri);
    if (!result.ok) {
      if (this.runtimePolicy.fail_closed) {
        throw providerUnavailable("openviking", "Existing material content could not be read from OpenViking.", {
          material_id: material.id,
          reason: result.error?.code || "provider_error",
        });
      }
      return material;
    }

    const snapshot = decodeMaterialSnapshot(result.content);
    const restoredText = cleanMaterialText(snapshot?.text || legacyMaterialText(result.content));
    let restoredItems = normalizeSourceItems(snapshot?.source_items);
    if (!restoredItems.length && restoredText) {
      restoredItems = normalizeSourceItems([{
        id: `legacy-${String(material.content_hash || material.id || "material").slice(0, 40)}`,
        occurred_at: material.occurred_at || null,
        sender: "历史导入",
        content: restoredText,
        source_url: material.source_url || "",
      }]);
    }
    if (!restoredText && !restoredItems.length && this.runtimePolicy.fail_closed) {
      throw providerUnavailable("openviking", "The OpenViking material resource did not contain restorable content.", {
        material_id: material.id,
        reason: "invalid_material_resource",
      });
    }
    return {
      ...material,
      ...(snapshot || {}),
      id: material.id,
      company_id: material.company_id,
      text: restoredText || cleanMaterialText(renderSourceItems(restoredItems)),
      source_items: restoredItems,
      openviking_uri: uri,
    };
  }

  async importMaterial(companyId, body = {}) {
    const company = this.requireCompany(companyId);
    const title = compactText(body.title, 120);
    if (!title) throw new HttpError(400, "bad_request", "资料标题不能为空。");
    const identity = buildMaterialSyncIdentity(company.id, { ...body, title });
    const existingMetadata = this.data.materials[identity.material_id]
      || (company.material_ids || [])
        .map((id) => this.data.materials[id])
        .find((item) => item?.source_id === identity.source_id)
      || null;
    const incomingItems = normalizeSourceItems(body.source_items || body.items);
    const suppliedText = cleanMaterialText(body.raw_text || body.text || body.content);
    const existing = existingMetadata
      && incomingItems.length
      && !cleanMaterialText(existingMetadata.text)
      && !normalizeSourceItems(existingMetadata.source_items).length
      ? await this.restoreMaterialContent(existingMetadata)
      : existingMetadata;
    const sourceItems = incomingItems.length
      ? mergeSourceItems(existing?.source_items || [], incomingItems)
      : existing?.source_items || [];
    const rawText = cleanMaterialText(
      sourceItems.length && (incomingItems.length || !suppliedText)
        ? renderSourceItems(sourceItems)
        : suppliedText || existing?.text,
    );
    if (!rawText) throw new HttpError(400, "bad_request", "资料内容不能为空。");

    const previousSource = this.data.sync_sources?.[identity.source_id] || null;
    if (previousSource?.status === "paused" && !body.resume_source) {
      throw new HttpError(409, "sync_source_paused", "该资料源已暂停，请明确恢复后再同步。", {
        source_id: identity.source_id,
      });
    }

    const job = await this.startJob({
      job_type: "sales_material_import",
      entity_type: "target_enterprise",
      entity_id: company.id,
      max_attempts: 1,
      request: {
        title,
        source_type: identity.source_type,
        source_external_id: identity.external_id,
      },
    });
    let run = null;
    const now = nowIso();
    try {
      run = await this.providerRuns.startRun({
        operation: "feishu_material_import",
        entity_type: "target_enterprise",
        entity_id: company.id,
        job_id: job.id,
      });
      const summary = compactText(body.summary || existing?.summary || rawText, 280) || this.inferMaterialSummary(title);
      const candidate = {
        id: existing?.id || identity.material_id,
        company_id: company.id,
        title,
        source_type: identity.source_type,
        source_url: compactText(identity.source_url, 500),
        source_id: identity.source_id,
        source_external_id: identity.external_id,
        source_version: identity.source_version,
        summary,
        text: rawText,
        source_items: sourceItems,
        occurred_at: body.occurred_at || existing?.occurred_at || null,
        last_synced_at: now,
        created_at: existing?.created_at || now,
        updated_at: existing?.updated_at || now,
        openviking_uri: existing?.openviking_uri || "",
        openviking_ref: existing?.openviking_ref || "",
        openviking_status: existing?.openviking_status || "pending",
      };
      candidate.content_hash = makeMaterialContentHash(candidate);
      const contentChanged = !existing || existing.content_hash !== candidate.content_hash;
      if (contentChanged && existing) candidate.updated_at = now;
      const alreadyIndexed = ["ready", "indexed"].includes(existing?.openviking_status);
      const action = !existing ? "created" : contentChanged ? "updated" : alreadyIndexed ? "unchanged" : "retried";

      const sourceRecord = {
        id: identity.source_id,
        source_type: identity.source_type,
        external_id: identity.external_id,
        display_name: identity.display_name,
        status: "active",
        config: identity.config,
        last_synced_at: now,
        created_at: previousSource?.created_at || now,
        updated_at: now,
      };
      const checkpointId = `${identity.source_id}:${identity.checkpoint_key}`;
      const previousCheckpoint = this.data.sync_checkpoints?.[checkpointId] || null;
      const checkpoint = {
        id: checkpointId,
        source_id: identity.source_id,
        checkpoint_key: identity.checkpoint_key,
        checkpoint_value: identity.checkpoint_value,
        content_hash: candidate.content_hash,
        last_success_at: previousCheckpoint?.last_success_at || null,
        error: null,
        created_at: previousCheckpoint?.created_at || now,
        updated_at: now,
      };

      await this.trackProviderStep(run.id, {
        provider: "supabase",
        operation: "persist_material_sync_state",
        input_summary: `保存 ${company.name} 的资料源、同步游标和材料`,
        output_summary: `同步状态已保存，处理结果为 ${action}。`,
      }, async () => {
        await this.persist(() => this.repository.persistSyncSource(sourceRecord));
        await this.persist(() => this.repository.persistSalesMaterial(candidate));
        await this.persist(() => this.repository.persistSyncCheckpoint(checkpoint));
        return { ok: true, provider: "supabase", provider_mode: this.persistence.enabled ? "real" : "disabled" };
      });

      this.data.sync_sources = this.data.sync_sources || {};
      this.data.sync_checkpoints = this.data.sync_checkpoints || {};
      this.data.sync_sources[sourceRecord.id] = sourceRecord;
      this.data.sync_checkpoints[checkpoint.id] = checkpoint;
      this.data.materials[candidate.id] = candidate;
      company.material_ids = [candidate.id, ...(company.material_ids || []).filter((id) => id !== candidate.id)];

      let record;
      if (action === "unchanged") {
        await this.skipProviderStep(run.id, {
          provider: "openviking",
          operation: "upsert_material_resource",
          input_summary: `检查 ${company.name} 的资料内容指纹`,
          output_summary: "内容指纹未变化，未重复写入 OpenViking。",
        });
        record = {
          ok: true,
          material_id: candidate.id,
          title: candidate.title,
          status: candidate.openviking_status,
          raw_ref: candidate.openviking_ref || candidate.openviking_uri || null,
          uri: candidate.openviking_uri || "",
          summary: "内容未变化，已跳过重复写入。",
          created_at: now,
        };
      } else {
        record = await this.trackProviderStep(run.id, {
          provider: "openviking",
          operation: "upsert_material_resource",
          input_summary: `在 ${company.name} 的独立目录写入资料 ${candidate.title}`,
          output_summary: "资料已写入当前企业的 OpenViking 目录。",
        }, () => this.writeMaterialToOpenViking(company, candidate, {
          mode: existing?.openviking_uri ? "replace" : "create",
        }));
      }

      candidate.openviking_status = record.status;
      candidate.openviking_uri = record.uri || candidate.openviking_uri || "";
      candidate.openviking_ref = record.raw_ref || candidate.openviking_ref || "";
      sourceRecord.status = record.status === "failed" ? "error" : "active";
      checkpoint.last_success_at = record.status === "failed" ? previousCheckpoint?.last_success_at || null : now;
      checkpoint.error = record.status === "failed"
        ? { code: record.error?.code || "openviking_write_failed", message: record.summary }
        : null;

      await this.persist(() => this.repository.persistSyncSource(sourceRecord));
      await this.persist(() => this.repository.persistSalesMaterial(candidate));
      await this.persist(() => this.repository.persistSyncCheckpoint(checkpoint));
      if (record.status !== "skipped" && record.uri) {
        await this.persist(() => this.repository.persistSalesOpenVikingRef({
          company_id: company.id,
          related_type: "material",
          related_id: candidate.id,
          ref_kind: "resource_import",
          uri: record.uri,
          summary: record.summary,
          created_at: record.created_at,
          payload_json: { source_id: candidate.source_id, content_hash: candidate.content_hash, record },
        }));
      }
      this.data.sync_sources[sourceRecord.id] = sourceRecord;
      this.data.sync_checkpoints[checkpoint.id] = checkpoint;
      this.data.materials[candidate.id] = candidate;

      await this.providerRuns.completeRun(run.id, { result_ref: `material:${candidate.id}:${action}` });
      await this.completeJob(job.id, {
        result_ref: `material:${candidate.id}:${action}`,
        result: { action, material_id: candidate.id },
      });
      return {
        action,
        source: clone(sourceRecord),
        checkpoint: clone(checkpoint),
        material: {
          id: candidate.id,
          title: candidate.title,
          summary: candidate.summary,
          source_id: candidate.source_id,
          source_version: candidate.source_version,
          content_hash: candidate.content_hash,
          last_synced_at: candidate.last_synced_at,
          updated_at: candidate.updated_at,
          openviking_status: candidate.openviking_status,
        },
        openviking_record: {
          material_id: record.material_id,
          title: record.title,
          status: record.status,
          summary: record.summary,
          created_at: record.created_at,
        },
        provider_run_id: run.id,
        job_id: job.id,
        materials: this.listMaterials(company.id),
      };
    } catch (error) {
      if (run) {
        try {
          await this.providerRuns.failRun(run.id, {
            code: error.code || "material_import_failed",
            message: error.message || "Material import failed.",
            category: error.category || "workflow",
            retryable: error.retryable,
          });
        } catch (persistenceError) {
          if (this.runtimePolicy.fail_closed) throw persistenceError;
        }
      }
      await this.failJob(job.id, error);
      throw error;
    }
  }

  getMaterialSyncState(companyId, input = {}) {
    const company = this.requireCompany(companyId);
    const { identity, source, checkpoint, material } = this.resolveMaterialSyncContext(company, input);
    return {
      source_id: identity.source_id,
      source: source ? clone(source) : null,
      checkpoint: checkpoint ? clone(checkpoint) : null,
      material: material ? {
        id: material.id,
        content_hash: material.content_hash || null,
        source_version: material.source_version || "",
        last_synced_at: material.last_synced_at || null,
        openviking_status: material.openviking_status || "pending",
      } : null,
    };
  }

  async updateMaterialSyncSource(companyId, body = {}) {
    const company = this.requireCompany(companyId);
    const action = String(body.action || "").trim().toLowerCase();
    if (!['pause', 'resume', 'delete'].includes(action)) {
      throw new HttpError(400, "bad_request", "action 必须是 pause、resume 或 delete。");
    }
    const { identity, source } = this.resolveMaterialSyncContext(company, body, { requireExisting: true });

    const now = nowIso();
    if (action !== "delete") {
      const updatedSource = {
        ...source,
        status: action === "pause" ? "paused" : "active",
        updated_at: now,
      };
      await this.persist(() => this.repository.persistSyncSource(updatedSource));
      this.data.sync_sources[identity.source_id] = updatedSource;
      return {
        action,
        source: clone(updatedSource),
        affected_material_ids: [],
        warnings: [],
      };
    }

    const job = await this.startJob({
      job_type: "sales_material_source_delete",
      entity_type: "sync_source",
      entity_id: identity.source_id,
      max_attempts: 1,
      request: { company_id: company.id, source_id: identity.source_id },
    });
    let run = null;
    try {
      run = await this.providerRuns.startRun({
        operation: "material_sync_source_delete",
        entity_type: "sync_source",
        entity_id: identity.source_id,
        job_id: job.id,
      });
      const materials = (company.material_ids || [])
        .map((id) => this.data.materials[id])
        .filter((material) => material?.source_id === identity.source_id);
      const warnings = [];
      for (const material of materials) {
        if (material.openviking_uri) {
          if (this.openVikingProvider?.isRunEnabled?.() && typeof this.openVikingProvider.removeResource === "function") {
            const removal = await this.trackProviderStep(run.id, {
              provider: "openviking",
              operation: "remove_material_resource",
              input_summary: `删除资料资源 ${material.openviking_uri}`,
              output_summary: "OpenViking 资料资源已删除。",
            }, () => this.openVikingProvider.removeResource(material.openviking_uri));
            if (!removal.ok) {
              if (this.runtimePolicy.fail_closed) {
                throw providerUnavailable("openviking", "OpenViking material deletion failed.", {
                  reason: removal.error?.code || "provider_error",
                });
              }
              warnings.push(`OpenViking 资源删除失败：${material.openviking_uri}`);
            }
          } else {
            await this.skipProviderStep(run.id, {
              provider: "openviking",
              operation: "remove_material_resource",
              input_summary: `删除资料资源 ${material.openviking_uri}`,
              output_summary: "OpenViking 删除能力未启用。",
              error: { code: "provider_disabled", message: "OpenViking resource removal is not enabled." },
            });
            if (this.runtimePolicy.fail_closed) {
              throw providerUnavailable("openviking", "OpenViking material deletion is not enabled.");
            }
            warnings.push(`OpenViking 未启用，资源可能仍需人工清理：${material.openviking_uri}`);
          }
        }
        await this.persist(() => this.repository.softDeleteSalesMaterial(material.id, now));
        delete this.data.materials[material.id];
        company.material_ids = (company.material_ids || []).filter((id) => id !== material.id);
      }

      const deletedSource = {
        ...source,
        status: "deleted",
        updated_at: now,
      };
      await this.persist(() => this.repository.persistSyncSource(deletedSource));
      this.data.sync_sources[identity.source_id] = deletedSource;
      await this.providerRuns.completeRun(run.id, { result_ref: `sync-source:${identity.source_id}:deleted` });
      await this.completeJob(job.id, {
        result_ref: `sync-source:${identity.source_id}:deleted`,
        result: { source_id: identity.source_id, deleted_material_count: materials.length },
      });
      return {
        action,
        source: clone(deletedSource),
        affected_material_ids: materials.map((material) => material.id),
        warnings,
        provider_run_id: run.id,
        job_id: job.id,
      };
    } catch (error) {
      if (run) {
        try {
          await this.providerRuns.failRun(run.id, {
            code: error.code || "sync_source_delete_failed",
            message: error.message || "Sync source deletion failed.",
            category: error.category || "workflow",
            retryable: error.retryable,
          });
        } catch (persistenceError) {
          if (this.runtimePolicy.fail_closed) throw persistenceError;
        }
      }
      await this.failJob(job.id, error);
      throw error;
    }
  }

  async syncMaterialsToOpenViking(companyId, options = {}) {
    const company = this.requireCompany(companyId);
    const materials = (company.material_ids || []).map((id) => this.data.materials[id]).filter(Boolean);
    const reportProgress = typeof options.report_progress === "function"
      ? options.report_progress
      : async () => {};
    if (!materials.length) {
      if (options.claimed_job) {
        this.data.jobs[options.claimed_job.id] = clone(options.claimed_job);
        await this.completeJob(options.claimed_job.id, {
          result_ref: `material-sync:${company.id}:skipped`,
          result: { status: "skipped", material_count: 0, failed_count: 0 },
        });
      }
      return {
        status: "skipped",
        summary: "当前企业还没有可导入的历史资料。",
        records: [],
      };
    }
    if (!this.openVikingProvider?.isRunEnabled?.()) {
      if (this.runtimePolicy.fail_closed) {
        throw providerUnavailable("openviking", "OpenViking writes are not enabled.");
      }
      return {
        status: "skipped",
        summary: "OpenViking 写入未启用。",
        records: materials.map((material) => ({
          material_id: material.id,
          title: material.title,
          status: "skipped",
        })),
      };
    }

    const job = options.claimed_job
      ? await this.activateClaimedJob(options.claimed_job, "sales_material_openviking_sync")
      : await this.startJob({
        job_type: "sales_material_openviking_sync",
        entity_type: "target_enterprise",
        entity_id: company.id,
        max_attempts: 3,
        request: { material_count: materials.length },
      });
    let run = null;
    try {
      await reportProgress("syncing_materials", 8);
      run = await this.providerRuns.startRun({
        operation: "material_openviking_sync",
        entity_type: "target_enterprise",
        entity_id: company.id,
        job_id: job.id,
      });
      const records = [];
      for (const [index, material] of materials.entries()) {
        await this.assertJobActive(job.id);
        await reportProgress("syncing_materials", 10 + Math.floor((index / materials.length) * 75));
        const hasLocalContent = Boolean(
          cleanMaterialText(material.text)
          || normalizeSourceItems(material.source_items).length,
        );
        let record;
        if (!hasLocalContent && material.openviking_uri && ["ready", "indexed"].includes(material.openviking_status)) {
          await this.skipProviderStep(run.id, {
            provider: "openviking",
            operation: "upsert_material_resource",
            input_summary: `检查 ${company.name} 的资料 ${material.title}`,
            output_summary: "正文已由 OpenViking 保存，无需从 Supabase 重复读取或覆盖。",
          });
          record = {
            ok: true,
            material_id: material.id,
            title: material.title,
            status: material.openviking_status,
            raw_ref: material.openviking_ref || material.openviking_uri,
            uri: material.openviking_uri,
            summary: "资料正文已存在于 OpenViking。",
            created_at: nowIso(),
          };
        } else if (!hasLocalContent) {
          throw providerUnavailable("openviking", "Material metadata exists but its OpenViking content is unavailable.", {
            material_id: material.id,
            reason: "missing_material_content",
          });
        } else {
          record = await this.trackProviderStep(run.id, {
            provider: "openviking",
            operation: "upsert_material_resource",
            input_summary: `在 ${company.name} 的独立目录写入资料 ${material.title}`,
            output_summary: "资料已写入当前企业的 OpenViking 目录。",
          }, () => this.writeMaterialToOpenViking(company, material));
        }
        material.openviking_status = record.status;
        material.openviking_ref = record.raw_ref || material.openviking_uri || "";
        material.openviking_uri = record.uri || material.openviking_uri || "";
        records.push(record);
        await this.trackProviderStep(run.id, {
          provider: "supabase",
          operation: "persist_material_memory_ref",
          input_summary: `保存资料 ${material.title} 的记忆索引状态`,
          output_summary: "资料记忆索引状态已保存。",
        }, async () => {
          await this.persist(() => this.repository.persistSalesMaterial(material));
          if (record.uri) {
            await this.persist(() => this.repository.persistSalesOpenVikingRef({
              company_id: company.id,
              related_type: "material",
              related_id: material.id,
              ref_kind: "memory_import",
              uri: record.uri,
              summary: record.summary,
              payload_json: {
                material_id: material.id,
                source_id: material.source_id || null,
                content_hash: material.content_hash || null,
                status: record.status,
              },
            }));
          }
          return { ok: true, provider: "supabase", provider_mode: this.persistence.enabled ? "real" : "disabled" };
        });
      }

      const failed = records.filter((record) => record.status === "failed").length;
      const status = failed ? "partial" : "ready";
      const summary = failed
        ? `${records.length - failed}/${records.length} 条历史资料已写入 OpenViking。`
        : `${records.length} 条历史资料已写入 OpenViking。`;
      await reportProgress("persisting_result", 94);
      await this.providerRuns.completeRun(run.id, { result_ref: `material-sync:${company.id}:${status}` });
      await this.completeJob(job.id, {
        result_ref: `material-sync:${company.id}:${status}`,
        result: { status, material_count: records.length, failed_count: failed },
      });
      return {
        status,
        summary,
        records: records.map((record) => ({
          material_id: record.material_id,
          title: record.title,
          status: record.status,
          summary: record.summary,
          created_at: record.created_at,
        })),
        provider_run_id: run.id,
        job_id: job.id,
      };
    } catch (error) {
      if (run) {
        try {
          if (error.code === "job_cancelled") {
            await this.providerRuns.cancelRun(run.id, { summary: "资料记忆同步任务已由用户取消。" });
          } else {
            await this.providerRuns.failRun(run.id, {
              code: error.code || "material_openviking_sync_failed",
              message: error.message || "Material memory sync failed.",
              category: error.category || "workflow",
              retryable: error.retryable,
            });
          }
        } catch (persistenceError) {
          if (this.runtimePolicy.fail_closed) throw persistenceError;
        }
      }
      await this.failJob(job.id, error);
      throw error;
    }
  }

  async writeMaterialToOpenViking(company, material, options = {}) {
    if (!this.openVikingProvider?.isRunEnabled?.()) {
      if (this.runtimePolicy.fail_closed) {
        throw providerUnavailable("openviking", "OpenViking writes are not enabled.");
      }
      return {
        material_id: material.id,
        title: material.title,
        status: "skipped",
        raw_ref: null,
        uri: material.openviking_uri || "",
        summary: "OpenViking 写入未启用。",
        created_at: nowIso(),
      };
    }
    let result;
    try {
      const content = this.buildMaterialMemory(company, material);
      if (typeof this.openVikingProvider.upsertTextResource === "function") {
        result = await this.openVikingProvider.upsertTextResource({
          uri: this.openVikingProvider.salesMaterialUri({
            workspaceId: this.workspaceId,
            companyId: company.id,
            sourceId: material.source_id || material.id,
          }),
          content,
          mode: options.mode || (material.openviking_uri ? "replace" : "create"),
        });
      } else {
        result = await this.openVikingProvider.storeMemory([{ role: "user", content }]);
      }
    } catch (error) {
      if (this.runtimePolicy.fail_closed) {
        throw providerUnavailable("openviking", "OpenViking material write failed.", {
          reason: error.message || "provider_error",
        });
      }
      result = { ok: false, error: { code: error.message || "provider_error" }, raw_ref: null };
    }
    if (!result.ok && this.runtimePolicy.fail_closed) {
      throw providerUnavailable("openviking", "OpenViking material write failed.", {
        reason: result.error?.code || "provider_error",
      });
    }
    return {
      ok: result.ok,
      material_id: material.id,
      title: material.title,
      status: result.ok ? "ready" : "failed",
      raw_ref: result.raw_ref || null,
      uri: result.uri || result.raw_ref || material.openviking_uri || "",
      summary: result.ok
        ? "历史资料已写入 OpenViking 长期记忆。"
        : `OpenViking 写入失败：${result.error?.code || "provider_error"}`,
      created_at: nowIso(),
      error: result.error || null,
    };
  }

  buildMaterialMemory(company, material) {
    return [
      "销售历史资料需要作为长期记忆保存。",
      `企业：${company.name}`,
      `资料标题：${material.title}`,
      `资料来源：${material.source_type || "Codex 整理的飞书沟通、会议纪要或云文档"}`,
      material.source_url ? `来源链接：${material.source_url}` : "",
      material.occurred_at || material.updated_at ? `资料时间：${material.occurred_at || material.updated_at}` : "",
      material.openviking_uri ? `原始资源 URI：${material.openviking_uri}` : "",
      `资料摘要：${material.summary || this.inferMaterialSummary(material.title)}`,
      material.text ? `资料正文：${material.text}` : "",
      "使用边界：后续资料问答可以引用该资料；最近档案不得引用该资料，最近档案只能使用专业数据集和豆包搜索。",
      encodeMaterialSnapshot(material),
    ].filter(Boolean).join("\n");
  }

  inferMaterialSummary(title) {
    const text = String(title || "");
    if (/会议纪要/.test(text)) return "会议资料中通常包含客户关注点、预算排期、部署要求和下一步行动，需要在销售跟进中优先召回。";
    if (/方案|讨论/.test(text)) return "方案讨论资料通常包含客户需求、技术约束和供应商准入要求，需要用于判断当前推进状态。";
    if (/沟通|摘录/.test(text)) return "历史沟通摘录用于补充客户背景、已确认事项和资料缺口。";
    return "该历史资料用于补充销售跟进中的长期上下文。";
  }

  qaView(company, messages = []) {
    const hasMaterials = (company.material_ids || [])
      .map((id) => this.data.materials[id])
      .filter(Boolean)
      .some(isFeishuMaterial);
    return {
      messages: this.compatibleQaMessages(company, messages)
        .map((message) => this.publicQaMessage(message)),
      note: hasMaterials
        ? "仅根据当前企业档案和用户导入的飞书资料回答。"
        : "当前企业暂无飞书资料；问答仅根据当前企业档案回答。",
    };
  }

  cachedQa(companyId) {
    const company = this.requireCompany(companyId);
    return this.qaView(company, this.data.qa_messages[companyId] || []);
  }

  async loadQaSessionState(company, options = {}) {
    const fallbackMessages = this.compatibleQaMessages(
      company,
      this.data.qa_messages[company.id] || [],
    );
    if (
      !this.openVikingProvider?.isConfigured?.()
      || typeof this.openVikingProvider?.getSessionContext !== "function"
    ) {
      if (options.failOnUnavailable && this.runtimePolicy.fail_closed) {
        throw providerUnavailable("openviking", "OpenViking session retrieval is not configured.");
      }
      return {
        ok: true,
        provider: "openviking",
        provider_mode: "ephemeral",
        session_id: this.openVikingSessionId(company),
        messages: fallbackMessages,
        latest_archive_overview: "",
        summary: "OpenViking 会话读取未配置，当前仅使用进程内会话。",
      };
    }

    const sessionId = this.openVikingSessionId(company);
    const result = await this.openVikingProvider.getSessionContext(sessionId, { tokenBudget: 6000 });
    if (!result.ok && openVikingNotFound(result)) {
      this.data.qa_messages[company.id] = [];
      return {
        ok: true,
        provider: "openviking",
        provider_mode: "real",
        session_id: sessionId,
        messages: [],
        latest_archive_overview: "",
        summary: "当前企业尚未建立 OpenViking 问答会话。",
      };
    }
    if (!result.ok) {
      if (options.failOnUnavailable && this.runtimePolicy.fail_closed) {
        throw providerUnavailable("openviking", "OpenViking session retrieval failed.", {
          reason: result.error?.code || "provider_error",
        });
      }
      return {
        ok: true,
        provider: "openviking",
        provider_mode: "ephemeral",
        session_id: sessionId,
        messages: fallbackMessages,
        latest_archive_overview: "",
        summary: "OpenViking 会话暂不可读，保留当前进程内会话。",
      };
    }

    const messages = firstJsonArray(result.messages)
      .map((message, index) => decodeQaSessionMessage(message, index))
      .filter((message) => message.text);
    this.data.qa_messages[company.id] = messages;
    return {
      ok: true,
      provider: "openviking",
      provider_mode: "real",
      session_id: result.session_id || sessionId,
      messages,
      latest_archive_overview: compactText(result.latest_archive_overview || "", 3000),
      raw_ref: result.raw_ref || `openviking:session:${sessionId}:context`,
      summary: `已从 OpenViking 恢复 ${messages.length} 条近期会话。`,
    };
  }

  async getQa(companyId) {
    const company = this.requireCompany(companyId);
    const session = await this.loadQaSessionState(company);
    return this.qaView(company, session.messages);
  }

  isAllowedQaCitation(company, citation) {
    const sourceKind = compactText(citation?.source_kind || "", 80);
    if (sourceKind === "企业档案") return true;
    if (!/内部资料|飞书|云文档|会议纪要|会话/.test(sourceKind)) return false;

    const uri = compactText(citation?.uri || "", 1000);
    if (uri.includes("/materials/")) return true;

    const label = compactText(citation?.label || "", 240);
    const allowedMaterialIdentities = (company.material_ids || [])
      .map((id) => this.data.materials[id])
      .filter(Boolean)
      .filter(isFeishuMaterial)
      .flatMap((material) => [
        compactText(material.title || "", 240),
        compactText(material.openviking_uri || material.openviking_ref || "", 1000),
        compactText(material.source_url || "", 1000),
      ])
      .filter(Boolean);
    return allowedMaterialIdentities.includes(label) || allowedMaterialIdentities.includes(uri);
  }

  isCompatibleQaAnswer(company, message) {
    if (message?.role !== "assistant") return true;
    if (hasLegacyGenericQaCitations(message)) return false;
    const citations = firstJsonArray(message.citations);
    if (!citations.length) return true;
    return citations.every((citation) => this.isAllowedQaCitation(company, citation));
  }

  compatibleQaMessages(company, messages = []) {
    const source = firstJsonArray(messages);
    const compatible = [];
    for (let index = 0; index < source.length; index += 1) {
      const message = source[index];
      if (message?.role === "user" && source[index + 1]?.role === "assistant") {
        const answer = source[index + 1];
        if (this.isCompatibleQaAnswer(company, answer)) compatible.push(message, answer);
        index += 1;
        continue;
      }
      if (this.isCompatibleQaAnswer(company, message)) compatible.push(message);
    }
    return compatible;
  }

  publicQaMessage(message) {
    const displayText = message.role === "assistant" ? sanitizeQaDisplayText : normalizeSalesText;
    const displaySources = mergeQaDisplayCitations(message);
    return {
      id: message.id,
      role: message.role,
      text: displayText(message.text),
      paragraphs: displaySources.paragraphs.map((paragraph) => ({
        text: displayText(paragraph.text),
        citation_ids: firstJsonArray(paragraph.citation_ids).map(String),
      })),
      citation_ids: displaySources.citation_ids,
      citations: displaySources.citations.map((citation) => publicCitationView(citation)),
      insufficient: Boolean(message.insufficient),
      created_at: message.created_at || null,
    };
  }

  async askQuestion(companyId, body = {}, options = {}) {
    const company = this.requireCompany(companyId);
    const question = String(body.question || "").trim();
    if (!question) throw new HttpError(400, "bad_request", "问题不能为空。");
    const job = await this.startJob({
      job_type: "sales_qa",
      entity_type: "target_enterprise",
      entity_id: company.id,
      max_attempts: 3,
      request: { question },
      retry_job_id: options.retry_job_id || "",
    });
    let run = null;

    try {
      run = await this.providerRuns.startRun({
        operation: "sales_qa",
        entity_type: "target_enterprise",
        entity_id: company.id,
        job_id: job.id,
      });
      const sessionState = await this.trackProviderStep(run.id, {
        provider: "openviking",
        operation: "restore_qa_session",
        input_summary: `恢复 ${company.name} 的近期问答和长期会话摘要`,
        output_summary: "已从 OpenViking 恢复企业问答上下文。",
      }, () => this.loadQaSessionState(company, { failOnUnavailable: true }));
      const messages = [...this.compatibleQaMessages(company, sessionState.messages)];
      const conversationHistory = qaConversationHistory(messages);
      const userMessage = {
        id: makeId("qa_user"),
        role: "user",
        text: question,
        created_at: nowIso(),
      };
      userMessage.provider_run_id = run.id;
      const retrieval = await this.trackProviderStep(run.id, {
        provider: "openviking",
        operation: "retrieve_qa_context",
        input_summary: `仅在 ${company.name} 的飞书资料目录中执行多查询检索并读取命中原文`,
      }, async () => {
        const queries = qaRetrievalQueries(company, question, conversationHistory);
        const queryResults = [];
        for (const query of queries) {
          queryResults.push({
            query,
            contexts: await this.searchOpenViking(company, query),
          });
        }
        const matchedContexts = fuseQaRetrievalContexts(queryResults, {
          maxContexts: 10,
          maxPerMaterial: 2,
        });
        const contexts = await this.hydrateOpenVikingContexts(company, matchedContexts);
        return {
          ok: true,
          provider: "openviking",
          provider_mode: this.openVikingProvider?.isConfigured?.() ? "real" : "fallback",
          contexts,
          query_plan: queries,
          retrieval_trace: matchedContexts.map((context) => ({
            material_id: context.material_id,
            uri: context.uri,
            query_hits: context.query_hits,
            best_rank: context.best_rank,
            fusion_score: context.fusion_score,
          })),
          summary: `已执行 ${queries.length} 个检索查询，经融合排序后读取 ${contexts.length} 份企业范围内资料。`,
        };
      });
      await this.assertJobActive(job.id);
      const dossier = (company.dossier_ids || [])
        .map((id) => this.data.dossiers[id])
        .filter(Boolean)
        .sort((a, b) => Number(b.version_no || 1) - Number(a.version_no || 1)
          || String(b.created_at || "").localeCompare(String(a.created_at || "")))[0] || null;
      const evidenceResult = await this.trackProviderStep(run.id, {
        provider: "rule",
        operation: "build_qa_evidence",
        input_summary: `对 ${company.name} 当前档案与命中资料分块、重排并执行可回答性判断`,
      }, async () => {
        const evidence = buildQaEvidence({
          dossier,
          contexts: retrieval.contexts,
          question,
          conversationHistory,
          maxItems: 12,
        });
        const answerability = assessQaAnswerability(question, evidence, conversationHistory);
        return {
          ok: true,
          provider: "rule",
          provider_mode: "local",
          evidence,
          answerability,
          summary: `已建立 ${evidence.length} 个可引用证据片段；可回答性=${answerability.supported ? "通过" : "不足"}。`,
        };
      });
      const answer = await this.generateQaAnswer(
        company,
        question,
        dossier,
        retrieval.contexts,
        evidenceResult.evidence,
        run.id,
        conversationHistory,
        sessionState.latest_archive_overview,
        evidenceResult.answerability,
      );
      await this.assertJobActive(job.id);
      answer.provider_run_id = run.id;

      const captured = await this.trackProviderStep(run.id, {
        provider: "openviking",
        operation: "capture_qa_session",
        input_summary: `把 ${company.name} 的本轮问答写入企业会话`,
        output_summary: "问答会话已提交给 OpenViking。",
      }, () => this.captureQaSession(company, userMessage, answer, retrieval.contexts));
      await this.assertJobActive(job.id);
      messages.push(userMessage, answer);
      this.data.qa_messages[companyId] = messages;

      const assistantRounds = messages.filter((message) => message.role === "assistant").length;
      let commitStatus = "not_due";
      if (
        captured?.ok
        && this.qaAutoCommitEvery > 0
        && assistantRounds > 0
        && assistantRounds % this.qaAutoCommitEvery === 0
      ) {
        const committed = await this.trackProviderStep(run.id, {
          provider: "openviking",
          operation: "commit_qa_long_term_memory",
          input_summary: `从 ${company.name} 的问答会话提炼长期记忆并保留最近对话`,
          output_summary: "已提交 OpenViking 长期记忆提炼。",
        }, () => this.openVikingProvider.commitSession(captured.session_id, {
          keepRecentCount: this.qaKeepRecentMessages,
        }));
        commitStatus = committed?.ok ? "submitted" : "failed";
      }

      if (this.persistence.enabled && this.repository) {
        await this.trackProviderStep(run.id, {
          provider: "supabase",
          operation: "persist_qa_session_metadata",
          input_summary: `保存 ${company.name} 的 OpenViking 会话索引和业务状态`,
          output_summary: "仅保存了会话 URI、消息计数和同步状态。",
        }, async () => {
          await this.persist(() => this.repository.persistSalesCompany(company));
          await this.persist(() => this.repository.persistSalesOpenVikingRef({
            company_id: company.id,
            related_type: "qa_session",
            related_id: captured?.session_id || this.openVikingSessionId(company),
            ref_kind: "session",
            uri: captured?.raw_ref || `openviking:session:${captured?.session_id || this.openVikingSessionId(company)}`,
            summary: "企业资料问答会话由 OpenViking 保存。",
            payload_json: {
              session_id: captured?.session_id || this.openVikingSessionId(company),
              message_count: messages.length,
              last_message_at: answer.created_at,
              commit_status: commitStatus,
            },
          }));
          return { ok: true, provider: "supabase", provider_mode: "real" };
        });
      } else {
        await this.skipProviderStep(run.id, {
          provider: "supabase",
          operation: "persist_qa_session_metadata",
          input_summary: `保存 ${company.name} 的会话索引`,
          output_summary: "当前配置未启用持久化仓库。",
          error: { code: "repository_disabled", message: "Persistent repository is not enabled." },
        });
      }
      await this.assertJobActive(job.id);
      await this.providerRuns.completeRun(run.id, { result_ref: `qa_message:${answer.id}` });
      await this.completeJob(job.id, {
        result_ref: `qa_message:${answer.id}`,
        result: { message_id: answer.id, insufficient: answer.insufficient },
      });
      return {
        message: this.publicQaMessage(answer),
        messages: this.compatibleQaMessages(company, messages)
          .map((message) => this.publicQaMessage(message)),
        provider_run_id: run.id,
        job_id: job.id,
      };
    } catch (error) {
      if (run) {
        try {
          if (error.code === "job_cancelled") {
            await this.providerRuns.cancelRun(run.id, { summary: "资料问答任务已由用户取消。" });
          } else {
            await this.providerRuns.failRun(run.id, {
              code: error.code || "qa_failed",
              message: error.message || "Question answering failed.",
              category: error.category || "workflow",
              retryable: error.retryable,
              details: {
                validation_errors: safeValidationErrors(
                  error.details?.validation_errors || error.validation_errors,
                ),
              },
            });
          }
        } catch (persistenceError) {
          if (this.runtimePolicy.fail_closed) throw persistenceError;
        }
      }
      await this.failJob(job.id, error);
      throw error;
    }
  }

  async generateQaAnswer(
    company,
    question,
    dossier,
    contexts,
    evidence = null,
    providerRunId = "",
    conversationHistory = [],
    conversationMemory = "",
    answerability = null,
  ) {
    const allowedEvidence = Array.isArray(evidence)
      ? evidence
      : buildQaEvidence({ dossier, contexts, question, conversationHistory });
    const safeConversationHistory = qaConversationHistory(conversationHistory);
    const support = answerability
      || assessQaAnswerability(question, allowedEvidence, safeConversationHistory);
    const enumerationRequirements = buildQaEnumerationRequirements(question, allowedEvidence);
    if (!support.evidence_count) {
      const text = "现有企业档案和已导入飞书资料中，没有检索到足以可靠回答该问题的相关依据。请补充对应会话或云文档，或先更新企业档案后再提问。";
      return {
        id: makeId("qa_assistant"),
        role: "assistant",
        text,
        paragraphs: [{ text, citation_ids: [] }],
        citation_ids: [],
        citations: [],
        insufficient: true,
        created_at: nowIso(),
      };
    }
    if (this.modelProvider?.isRunEnabled?.()) {
      try {
        const qaSystem = [
          "你是销售资料问答助手。只输出 JSON，不要输出 Markdown。",
          "只能基于 evidence 中的企业档案和用户导入的飞书资料回答。",
          "企业档案是已由专业数据集和豆包搜索生成并完成引用校验的当前报告；飞书资料来自用户有权访问并主动导入的会话、云文档或会议纪要。",
          "conversation_history 仅用于理解代词、承接追问和避免重复；不得把其中未被 evidence 支撑的陈述当成事实。",
          "conversation_memory 是 OpenViking 从更早会话中提炼的长期摘要，只能用于保持对话连续性，不能单独作为事实证据。",
          "不能自由联网，不能补编资料。资料不足时明确说不足。",
          "retrieval_plan 说明问题类型和检索支持度；先直接回答问题，再给依据或下一步，不要介绍系统如何检索、调用了什么能力或资料条数。",
          "严格围绕用户明确要求的对象和分项作答；不得自行增加“补充”“延伸信息”“其他说明”等未被提问的旁支内容。只有资料不足会影响结论时，才说明缺口或下一步。",
          "当 retrieval_plan.answerability.supported=false 时，只有 evidence 原文明确包含答案才能回答；否则 insufficient 必须为 true，并简洁说明缺少哪类资料。",
          "evidence.label 是资料的正式展示标题，询问标题或来源时必须逐字使用 label，不得根据正文另拟标题。",
          "不得输出 evidence.uri、内部路径、资源 ID、公司内部 ID 或其他技术实现细节。",
          "复杂问题拆成 2 至 5 个简短段落，每个 paragraphs[] 只表达一个主题。第一段必须直接给结论，后续段落再写依据、风险或建议。",
          "回答必须针对问题中的对象、时间、需求或动作；禁止输出“可进一步关注”“建议持续跟踪”“资料可用于核验”等没有新增信息的套话。",
          "如果 enumeration_requirements 非空，说明证据中存在与问题最相关的明确枚举表。必须逐项覆盖其中每个 label，不得合并、概括或遗漏，也不得增加表中没有的项目。",
          "需要层级时，可让段落分别以“结论：”“依据：”“风险：”“建议：”或“下一步：”开头；简单事实问题使用 1 至 2 段，不机械套用全部标签。",
          "如果多个证据对同一事实表述不一致，必须指出差异；不得自行选取一个版本。",
          "每个非资料不足段落都必须提供 citation_ids，ID 必须逐字来自 evidence。",
          "完整回答正文控制在 900 个中文字符以内，优先保证 JSON 完整闭合。",
        ];
        const qaPayload = {
          question,
          conversation_history: safeConversationHistory,
          conversation_memory: compactText(conversationMemory, 3000),
          company: { name: company.name, industry: company.industry },
          retrieval_plan: {
            ...analyzeQaQuestion(question, safeConversationHistory),
            answerability: support,
          },
          enumeration_requirements: enumerationRequirements,
          evidence: allowedEvidence,
          output_schema: {
            paragraphs: [{ text: "回答段落", citation_ids: ["evidence_id"] }],
            insufficient: false,
          },
        };
        const callQaModel = ({
          operation,
          maxTokens,
          jsonRetry = false,
          jsonRepairContent = "",
          validationFeedback = [],
        }) => this.modelProvider.callJson({
          operation,
          maxTokens,
          system: [
            ...qaSystem,
            ...(jsonRetry
              ? [
                "上一轮响应因 JSON 未完整闭合而无法解析。本轮必须返回完整 JSON。",
                "最多输出 4 个段落，每段不超过 180 个中文字符；不得省略 citation_ids 和 insufficient。",
              ]
              : []),
            ...(jsonRepairContent
              ? [
                "你正在修复上一轮模型生成的无效 JSON。只修复 JSON 语法、闭合和转义问题，不得新增、删除或改写回答事实。",
                "必须保留原回答段落、citation_ids 和 insufficient；引用仍须来自 evidence[].id。",
                "只输出修复后的完整 JSON，不得解释修复过程。",
              ]
              : []),
            ...(validationFeedback.length
              ? [
                "上一轮回答未通过结构与引用校验。本轮必须根据 validation_feedback 逐项修正后重新输出完整 JSON。",
                "每个非资料不足段落都必须给出 citation_ids，并且只能逐字复制 evidence[].id；不得使用来源序号、标题或自行编造的 ID。",
                "如果 validation_feedback 指出遗漏枚举项，必须按 enumeration_requirements 逐项补齐。",
              ]
              : []),
          ].join("\n"),
          payload: {
            ...qaPayload,
            ...(jsonRepairContent ? { invalid_json_content: jsonRepairContent } : {}),
            ...(validationFeedback.length ? { validation_feedback: validationFeedback } : {}),
          },
        });
        let result = await this.trackProviderStep(providerRunId, {
          provider: "model",
          operation: "answer_sales_question",
          input_summary: `基于 ${allowedEvidence.length} 条允许引用证据和 ${safeConversationHistory.length} 条对话上下文回答 ${company.name} 的资料问题`,
          output_summary: "模型已返回结构化逐段回答。",
        }, () => callQaModel({
          operation: "sales_qa",
          maxTokens: 1600,
        }));
        if (!result.ok && result.error?.code === "invalid_json") {
          const invalidContent = String(result.invalid_content || "").trim();
          if (invalidContent) {
            result = await this.trackProviderStep(providerRunId, {
              provider: "model",
              operation: "repair_sales_question_json",
              input_summary: `修复 ${company.name} 首次问答响应的 JSON 语法`,
              output_summary: "模型已修复并返回完整结构化回答。",
            }, () => callQaModel({
              operation: "sales_qa_json_repair",
              maxTokens: 2200,
              jsonRepairContent: invalidContent,
            }));
          }
        }
        if (!result.ok && result.error?.code === "invalid_json") {
          result = await this.trackProviderStep(providerRunId, {
            provider: "model",
            operation: "retry_sales_question",
            input_summary: `首次回答 JSON 未完整闭合，使用更高输出预算重试 ${company.name} 的资料问题`,
            output_summary: "模型重试后已返回完整结构化回答。",
          }, () => callQaModel({
            operation: "sales_qa_retry",
            maxTokens: 2200,
            jsonRetry: true,
          }));
        }
        let validated = result.ok
          ? validateQaModelAnswer(result.parsed, allowedEvidence, { enumerationRequirements, question })
          : null;
        const validationErrors = validated?.errors || [];
        if (result.ok && validationErrors.length) {
          result = await this.trackProviderStep(providerRunId, {
            provider: "model",
            operation: "retry_invalid_qa_answer",
            input_summary: `首次回答未通过结构或引用校验，重试 ${company.name} 的资料问题`,
            output_summary: "模型重试后已返回修正引用与结构的回答。",
          }, () => callQaModel({
            operation: "sales_qa_quality_retry",
            maxTokens: 2200,
            validationFeedback: validationErrors,
          }));
          validated = result.ok
            ? validateQaModelAnswer(result.parsed, allowedEvidence, { enumerationRequirements, question })
            : null;
        }
        if (result.ok) {
          if (validated.errors.length) {
            if (this.runtimePolicy.fail_closed) {
              throw providerUnavailable("model", "The model returned an answer with invalid or missing citations.", {
                validation_errors: validated.errors,
              });
            }
          } else {
            return {
              id: makeId("qa_assistant"),
              role: "assistant",
              text: compactText(validated.text, 1800),
              paragraphs: validated.paragraphs,
              citation_ids: validated.citation_ids,
              citations: validated.citations,
              insufficient: validated.insufficient,
              created_at: nowIso(),
            };
          }
        } else if (this.runtimePolicy.fail_closed) {
          throw providerUnavailable("model", "The model provider did not return a valid answer.", {
            reason: result.error?.code || "provider_error",
          });
        }
      } catch (error) {
        if (this.runtimePolicy.fail_closed) {
          if (error instanceof HttpError) throw error;
          throw providerUnavailable("model", "Question answering failed.", {
            reason: error.message || "provider_error",
          });
        }
      }
    }

    if (!this.modelProvider?.isRunEnabled?.()) {
      await this.skipProviderStep(providerRunId, {
        provider: "model",
        operation: "answer_sales_question",
        input_summary: `回答 ${company.name} 的资料问题`,
        output_summary: "模型 Provider 未启用。",
        error: { code: "provider_disabled", message: "Model provider is not enabled." },
      });
    }

    if (this.runtimePolicy.fail_closed) {
      throw providerUnavailable("model", "The model provider did not return an answer.");
    }

    const hasMaterials = (company.material_ids || []).length > 0;
    const fallbackText = dossier
      ? hasMaterials
        ? `基于当前档案和历史资料，${company.name} 当前重点线索是：${dossier.memory_summary || dossier.summary}`
        : `基于当前最新档案，${company.name} 当前重点线索是：${dossier.memory_summary || dossier.summary}`
      : hasMaterials
        ? `当前资料不足，只能确认 ${company.name} 已在目标企业池中，尚需生成最新档案。`
        : `当前企业为新加入目标企业，暂无历史资料；请先生成最新档案后再围绕当前进展提问。`;
    const fallbackCitationIds = dossier
      ? [...new Set(firstJsonArray(dossier.body).flatMap((paragraph) => firstJsonArray(paragraph.citation_ids)))]
        .filter((id) => allowedEvidence.some((item) => String(item.id) === String(id)))
        .slice(0, 4)
      : [];
    const fallbackCitations = fallbackCitationIds
      .map((id) => allowedEvidence.find((item) => String(item.id) === String(id)))
      .filter(Boolean);
    return {
      id: makeId("qa_assistant"),
      role: "assistant",
      text: fallbackText,
      paragraphs: [{ text: fallbackText, citation_ids: fallbackCitationIds }],
      citation_ids: fallbackCitationIds,
      citations: fallbackCitations,
      insufficient: !dossier,
      created_at: nowIso(),
    };
  }

  async captureQaSession(company, userMessage, assistantMessage, contexts) {
    if (!this.openVikingProvider?.isRunEnabled?.()) {
      if (this.runtimePolicy.fail_closed) {
        throw providerUnavailable("openviking", "OpenViking session capture is not enabled.");
      }
      return null;
    }
    const preferredSessionId = this.openVikingSessionId(company);
    try {
      const result = await this.openVikingProvider.addSessionMessages(preferredSessionId, [
        { role: "user", content: encodeQaSessionMessage(userMessage) },
        { role: "assistant", content: encodeQaSessionMessage(assistantMessage) },
      ]);
      const sessionId = result.session_id || preferredSessionId;
      if (result.ok && sessionId && company.qa_session_id !== sessionId) {
        company.qa_session_id = sessionId;
        company.updated_at = nowIso();
        if (this.persistence.enabled && this.repository) {
          await this.persist(() => this.repository.persistSalesCompany(company));
        }
      }
      if (result.ok && contexts?.length) {
        await this.openVikingProvider.recordSessionUsed(sessionId, contexts.map((item) => item.uri).filter(Boolean));
      }
      if (!result.ok && this.runtimePolicy.fail_closed) {
        throw providerUnavailable("openviking", "OpenViking session capture failed.", {
          reason: result.error?.code || "provider_error",
        });
      }
      return { ...result, session_id: sessionId };
    } catch (error) {
      if (this.runtimePolicy.fail_closed) {
        if (error instanceof HttpError) throw error;
        throw providerUnavailable("openviking", "OpenViking session capture failed.", {
          reason: error.message || "provider_error",
        });
      }
      return {
        ok: false,
        error: { code: error.message || "provider_error" },
      };
    }
  }

  async commitQaMemory(companyId) {
    const company = this.requireCompany(companyId);
    if (!this.openVikingProvider?.isRunEnabled?.()) {
      if (this.runtimePolicy.fail_closed) {
        throw providerUnavailable("openviking", "OpenViking session commit is not enabled.");
      }
      return { status: "skipped", summary: "OpenViking 写入未启用。" };
    }
    const sessionId = this.openVikingSessionId(company);
    const job = await this.startJob({
      job_type: "sales_qa_memory_commit",
      entity_type: "target_enterprise",
      entity_id: company.id,
      max_attempts: 1,
      request: { session_id: sessionId },
    });
    let run = null;
    try {
      run = await this.providerRuns.startRun({
        operation: "qa_memory_commit",
        entity_type: "target_enterprise",
        entity_id: company.id,
        job_id: job.id,
      });
      const result = await this.trackProviderStep(run.id, {
        provider: "openviking",
        operation: "commit_session_memory",
        input_summary: `提交 ${company.name} 的资料问答会话`,
        output_summary: "问答会话已提交至 OpenViking。",
      }, () => this.openVikingProvider.commitSession(sessionId));
      if (!result.ok && this.runtimePolicy.fail_closed) {
        throw providerUnavailable("openviking", "OpenViking session commit failed.", {
          reason: result.error?.code || "provider_error",
        });
      }
      const record = {
        status: result.ok ? "ready" : "failed",
        raw_ref: result.raw_ref || null,
        summary: result.ok ? "资料问答会话已提交，OpenViking 将异步抽取长期记忆。" : `OpenViking session commit 失败：${result.error?.code || "provider_error"}`,
      };
      await this.trackProviderStep(run.id, {
        provider: "supabase",
        operation: "persist_qa_memory_ref",
        input_summary: `保存 ${company.name} 的会话记忆提交状态`,
        output_summary: "会话记忆提交状态已保存。",
      }, async () => {
        await this.persist(() => this.repository.persistSalesOpenVikingRef({
          company_id: company.id,
          related_type: "qa_session",
          related_id: sessionId,
          ref_kind: "session_commit",
          uri: record.raw_ref || "",
          summary: record.summary,
          payload_json: record,
        }));
        return { ok: true, provider: "supabase", provider_mode: this.persistence.enabled ? "real" : "disabled" };
      });
      await this.providerRuns.completeRun(run.id, { result_ref: `qa-memory:${company.id}:${record.status}` });
      await this.completeJob(job.id, {
        result_ref: `qa-memory:${company.id}:${record.status}`,
        result: { status: record.status },
      });
      return {
        status: record.status,
        summary: record.summary,
        provider_run_id: run.id,
        job_id: job.id,
      };
    } catch (error) {
      if (run) {
        try {
          await this.providerRuns.failRun(run.id, {
            code: error.code || "qa_memory_commit_failed",
            message: error.message || "QA memory commit failed.",
            category: error.category || "workflow",
            retryable: error.retryable,
          });
        } catch (persistenceError) {
          if (this.runtimePolicy.fail_closed) throw persistenceError;
        }
      }
      await this.failJob(job.id, error);
      throw error;
    }
  }

  openVikingSessionId(company) {
    if (company.qa_session_id) return company.qa_session_id;
    if (typeof this.openVikingProvider?.salesSessionId === "function") {
      return this.openVikingProvider.salesSessionId({
        workspaceId: this.workspaceId,
        companyId: company.id,
      });
    }
    return company.qa_session_id || `sales-${company.id}`;
  }
}
