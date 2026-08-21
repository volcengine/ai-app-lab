import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootDir = path.resolve(backendDir, "..");
const appSource = await fs.readFile(path.join(rootDir, "frontend", "app.js"), "utf8");
const textFormatSource = await fs.readFile(path.join(rootDir, "frontend", "text-format.js"), "utf8");
const htmlSource = await fs.readFile(path.join(rootDir, "frontend", "index.html"), "utf8");
const styleSource = await fs.readFile(path.join(rootDir, "frontend", "styles.css"), "utf8");

test("formal frontend starts empty and has no user-selectable fixture mode", () => {
  assert.match(appSource, /let goals = \[\];\s+let companies = \{\};/);
  assert.match(appSource, /function resetConnectedState\(\) \{[\s\S]*?goals = \[\];[\s\S]*?companies = \{\};/);
  assert.doesNotMatch(appSource, /DEMO_MODE|SALES_WORKBENCH_MODE|safe-demo|applySafeRecordingData/);
  assert.doesNotMatch(appSource, /yutong04|南区销售工作台|星澜新能源|曜驰智能/);
});

test("formal frontend keeps the sales workspace free of backend operations content", () => {
  assert.match(appSource, /<strong>销售智能工作台<\/strong>/);
  assert.doesNotMatch(appSource, /api\("\/providers\/status"\)/);
  assert.doesNotMatch(appSource, /api\("\/admin\/status"\)/);
  assert.match(appSource, /\/jobs\?job_type=sales_dossier_generation&entity_id=/);
  assert.match(appSource, /api\(`\/jobs\/\$\{encodeURIComponent\(job\.id\)\}`\)/);
  assert.doesNotMatch(appSource, /\/provider-runs\?entity_id=/);
  assert.doesNotMatch(appSource, /配置诊断|运维状态|运行与资料管理|真实后端已配置|模型 Token/);
  assert.doesNotMatch(appSource, /data-source-action|data-job-action/);
  assert.doesNotMatch(appSource, /providers\/model\/probe/);
  assert.doesNotMatch(appSource, /ARK_API_KEY|SUPABASE_SERVICE_ROLE_KEY|OPENVIKING_API_KEY/);
});

test("formal frontend still exposes the complete sales workflow", () => {
  assert.match(appSource, /销售目标/);
  assert.match(appSource, /查找企业/);
  assert.match(appSource, /目标企业池/);
  assert.match(appSource, /获取最新档案/);
  assert.match(appSource, /历史资料/);
  assert.match(appSource, /MATERIAL_FILTERS = \["全部", "档案", "飞书会话", "云文档"\]/);
  assert.doesNotMatch(appSource, /MATERIAL_FILTERS = [^\n]*"会议纪要"/);
  assert.match(appSource, /id="openFeishuImport"/);
  assert.match(appSource, /联系人姓名或会话 ID/);
  assert.match(appSource, /完整的飞书云文档或知识库链接/);
  assert.doesNotMatch(appSource, /姓名、Open ID 或会话 ID|飞书云文档链接或 Token/);
  assert.doesNotMatch(appSource, /导入企业资料/);
  assert.match(appSource, /class="library-tools"[\s\S]*?class="secondary-button library-import-button" id="openFeishuImport"[\s\S]*?>导入飞书资料</);
  assert.match(appSource, /id="feishuImportForm"/);
  assert.match(appSource, /\/materials\/feishu-import/);
  assert.match(appSource, /state\.materialFilter = task\.source_kind === "document" \? "云文档" : "飞书会话"/);
  assert.match(appSource, /function historicalDossierRecords\(item\)/);
  assert.match(appSource, /function historicalDossierRecords\(item\) \{\s+return \(item\.updates \|\| \[\]\)\.map/);
  assert.doesNotMatch(appSource, /function historicalDossierRecords\(item\) \{[\s\S]*?\.slice\(1\)\.map/);
  assert.match(appSource, /暂无历史档案/);
  assert.match(appSource, /资料问答/);
  assert.match(appSource, /class="support-tabs" role="tablist" aria-label="企业资料与问答"/);
  assert.match(appSource, /data-support-view="library"[\s\S]*?role="tab"[\s\S]*?>历史资料<\/button>/);
  assert.match(appSource, /data-support-view="qa"[\s\S]*?role="tab"[\s\S]*?>资料问答<\/button>/);
  assert.match(appSource, /id="supportLibraryPanel"[\s\S]*?role="tabpanel"/);
  assert.match(appSource, /id="supportQaPanel"[\s\S]*?role="tabpanel"/);
  assert.match(appSource, /state\.supportView = nextView;/);
  assert.match(appSource, /仅根据当前企业档案和用户导入的飞书资料回答/);
  assert.match(appSource, /paragraphs: \(message\.paragraphs \|\| \[\]\)/);
  assert.match(appSource, /class="qa-answer-body"/);
  assert.match(appSource, /function renderQaAnswerParagraph/);
  assert.match(appSource, /collapseRepeatedCitationRuns\(qaAnswerParagraphs\(message\)\)/);
  assert.match(appSource, /dedupeCitationEntries\(rawCitationEntries\)/);
  assert.match(appSource, /citationGroup/);
  assert.match(appSource, /class="qa-citation-anchor"/);
  assert.doesNotMatch(appSource, /<div class="qa-answer-refs">/);
  assert.match(appSource, /window\.SalesTextFormat/);
  assert.match(appSource, /function splitDisplayParagraphs/);
  assert.match(textFormatSource, /function splitReadableBlocks/);
  assert.match(textFormatSource, /function collapseRepeatedCitationRuns/);
  assert.match(textFormatSource, /function dedupeCitationEntries/);
  assert.doesNotMatch(appSource, /\(\[\^\\n\]\)\(\?=\(\?:\\d\+\[\.\)、\]/);
  assert.match(appSource, /class="chat-message assistant is-pending"/);
  assert.match(appSource, /const pendingMessages = \[\s+\.\.\.qaMessagesForCompany\(current\),\s+\{ role: "user", text: question \},\s+\];/);
  assert.match(appSource, /rememberCompanyQa\(current\.id, pendingMessages\);\s+state\.busy = "qa";/);
  assert.match(appSource, /function scrollQaToBottom/);
  assert.match(appSource, /\/target-enterprises\/\$\{encodeURIComponent\(current\.id\)\}\/dossiers/);
  assert.match(appSource, /\/target-enterprises\/\$\{encodeURIComponent\(current\.id\)\}\/qa/);
  assert.match(appSource, /data-cancel-dossier-job/);
  assert.match(appSource, /data-retry-dossier-job/);
  assert.match(appSource, /function compactDossierStageLabel\(job\)/);
  assert.match(appSource, /job\?\.stage_detail\?\.message/);
  assert.match(appSource, /正在等待自动重试/);
  assert.match(appSource, /正在核验专业资料/);
  assert.match(appSource, /正在检索公开资料/);
  assert.match(appSource, /正在查找资料/);
  assert.match(appSource, /正在核验资料/);
  assert.match(appSource, /正在整理档案/);
  assert.match(appSource, /正在保存结果/);
  assert.match(appSource, /class="dossier-job-spinner"/);
  assert.match(appSource, /class="dossier-job-flow"/);
  assert.doesNotMatch(appSource, /job\.progress/);
  assert.match(styleSource, /@keyframes dossier-job-flow/);
  assert.match(styleSource, /animation: dossier-job-flow/);
  assert.match(appSource, /window\.sessionStorage\.getItem\(storageKey\)/);
  assert.match(appSource, /clearDossierRequestIdempotencyKey\(current\.id\)/);
  assert.match(appSource, /job\.stage !== "cancelling"/);
  assert.match(appSource, /正在等待当前步骤安全结束后取消/);
});

test("formal frontend refreshes the active goal count after adding a company", () => {
  assert.match(appSource, /if \(!goal\.pool\.includes\(id\)\) goal\.pool\.push\(id\);\s+goal\.stats = goalStats\(goal\.pool\.length\);/);
});

test("dossier versions and citations use API evidence only in formal mode", () => {
  assert.match(appSource, /previousDossierId: item\.previous_dossier_id \|\| null/);
  assert.doesNotMatch(appSource, /providerRunId|provider_run_id/);
  assert.match(appSource, /data-dossier="\$\{escapeHtml\(update\.id\)\}"/);
  assert.doesNotMatch(appSource, /与上一版比较|data-compare-dossier|version-comparison|\/compare\//);
  assert.match(appSource, /if \(update\.citations\?\.length\) return update\.citations;\s+return \[\];/);
  assert.match(appSource, /segments: \(paragraph\.segments \|\| \[\]\)\.map/);
  assert.match(appSource, /paragraph\.segments\?\.length/);
  assert.match(appSource, /renderTextWithCitations\(segment\.text, segment\.citationIds\)/);
  assert.match(appSource, /暂无可验证的引用来源/);
  assert.match(appSource, /专业数据集（DataPro）/);
  assert.match(appSource, /联网搜索/);
  assert.match(appSource, /查看数据明细/);
  assert.match(appSource, /未标注发布时间/);
  assert.match(appSource, /target="_blank"/);
  assert.doesNotMatch(appSource, /source\.qualityLabel/);
  assert.doesNotMatch(appSource, /source\.freshnessLabel/);
  assert.doesNotMatch(appSource, /source\.verificationLabel/);
  assert.doesNotMatch(appSource, /source\.conflictLabel|source\.conflict_label/);
  assert.doesNotMatch(appSource, /关键字段存在来源差异/);
  assert.doesNotMatch(appSource, /source\.entityMatch/);
  assert.match(appSource, /source\.summary \|\| source\.excerpt/);
  assert.match(appSource, /function professionalSourceDetails/);
  assert.match(appSource, /function renderCitationGroups/);
  assert.match(appSource, /function sourceSiteName/);
  assert.match(appSource, /function sourcePublishLabel/);
  assert.doesNotMatch(appSource, /source\.provider/);
  assert.match(appSource, /档案正文暂未加载/);
  assert.match(appSource, /function isPlaceholderUrl\(value\)/);
  assert.match(appSource, /example\\\.\(com\|test\)/);
  assert.match(appSource, /async function loadDossierDetail\(record, attempts = 3\)/);
  assert.match(appSource, /系统不会用摘要冒充正文/);
  assert.doesNotMatch(appSource, /detailLoadMessage|isPlaceholderUrl is not defined/);
  assert.doesNotMatch(appSource, /body: item\.summary \|\| ""/);
  assert.doesNotMatch(appSource, /\.catch\(\(\) => mapDossierFromApi\(record\)\)/);
});

test("formal frontend retries connections without exposing backend error details", () => {
  assert.match(appSource, /function apiErrorMessage\(_error, fallback\) \{\s*return fallback \|\| "操作没有完成，请稍后重试。";/);
  assert.match(
    appSource,
    /catch \(error\) \{\s*state\.showNewGoal = false;\s*state\.sidebarNotice = apiErrorMessage\(error, "暂时没能创建销售目标，请稍后再试。"\)/,
  );
  assert.match(appSource, /id="retryBoot"/);
  assert.match(appSource, /\$\("#retryBoot"\)\?\.addEventListener\("click"/);
  assert.match(appSource, /工作台加载时间较长，请稍后重试/);
  assert.doesNotMatch(appSource, /无法读取后端业务数据|后端响应超时|请求 \$\{error\.requestId\}|task\.error\?\.message/);
});

test("formal frontend authenticates before loading business data and protects mutations with CSRF", () => {
  assert.match(appSource, /api\("\/auth\/status", \{ skipAuthRedirect: true \}\)/);
  assert.match(appSource, /bootstrap \? "\/auth\/bootstrap" : "\/auth\/login"/);
  assert.match(appSource, /name="username" autocomplete="username"/);
  assert.doesNotMatch(appSource, /name="email"|type="email"/);
  assert.match(appSource, /credentials: "same-origin"/);
  assert.match(appSource, /cookieValue\("siw_csrf"\)/);
  assert.match(appSource, /headers\["X-CSRF-Token"\] = csrfToken/);
  assert.match(appSource, /id="logoutButton"/);
  assert.match(appSource, /api\("\/auth\/logout", \{ method: "POST", skipAuthRedirect: true \}\)/);
  assert.doesNotMatch(appSource, /AGENT_PLAN_API_KEY|SUPABASE_API_URL|service-role-secret|siw_access/);
});

test("formal frontend exposes one local administrator and no email or member flows", () => {
  assert.doesNotMatch(appSource, /openMemberAdmin|memberInviteForm|\/admin\/members/);
  assert.match(appSource, /设置本机管理员/);
  assert.doesNotMatch(appSource, /reset-password|忘记密码|找回密码|重置密码/);
  assert.doesNotMatch(appSource, /passwordRecoveryForm|\/auth\/password\/recover|\/auth\/password\/update/);
  assert.doesNotMatch(appSource, /工作区成员|成员管理|成员邀请|找回密码|重置邮件/);
  assert.doesNotMatch(appSource, /SUPABASE_SERVICE_ROLE_KEY|service_role/);
});

test("formal frontend assets carry the current cache key and responsive runtime styles", () => {
  assert.match(htmlSource, /<title>销售智能工作台<\/title>/);
  assert.match(htmlSource, /20260730-source-list/);
  assert.match(htmlSource, /text-format\.js/);
  assert.match(styleSource, /\.version-tabs/);
  assert.match(styleSource, /\.citation-group/);
  assert.match(styleSource, /\.citation-source-row/);
  assert.match(styleSource, /\.professional-source-details/);
  assert.match(styleSource, /\.qa-answer-body/);
  assert.match(styleSource, /\.qa-answer-paragraph/);
  assert.match(styleSource, /\.qa-citation-anchor/);
  assert.match(styleSource, /vertical-align: super/);
  assert.match(styleSource, /\.chat-message\.is-pending/);
  assert.match(styleSource, /@keyframes qa-pending-pulse/);
  assert.match(styleSource, /\.dossier-report-section/);
  assert.match(styleSource, /\.dossier-report-content/);
  assert.match(styleSource, /\.library-dossier-link/);
  assert.match(styleSource, /\.connection-retry/);
  assert.match(styleSource, /\.auth-panel/);
  assert.match(styleSource, /\.dialog-modal/);
  assert.doesNotMatch(styleSource, /\.member-modal/);
  assert.match(styleSource, /\.feishu-import-modal/);
  assert.match(styleSource, /\.library-import-button/);
  assert.match(styleSource, /@media \(max-width: 780px\)/);
  assert.match(styleSource, /\.sales-layout\.is-mobile-navigation-open \.sales-sidebar/);
  assert.match(appSource, /id="mobileNavigationToggle"/);
});

test("HTTP-hosted frontend uses the same-origin API by default", () => {
  assert.match(appSource, /window\.location\.origin/);
  assert.match(appSource, /`\$\{window\.location\.origin\}\/api`/);
  assert.match(appSource, /\["http:", "https:"\]\.includes\(window\.location\.protocol\)/);
});
