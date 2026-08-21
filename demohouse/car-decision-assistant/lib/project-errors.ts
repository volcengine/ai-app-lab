export const ProjectErrorCode = {
  VEHICLE_SERIES_NOT_FOUND: "VEHICLE_SERIES_NOT_FOUND",
  VEHICLE_SELECTION_REQUIRED: "VEHICLE_SELECTION_REQUIRED",
  EXACT_CONFIG_NO_DATA: "EXACT_CONFIG_NO_DATA",
  CITY_SALES_NO_DATA: "CITY_SALES_NO_DATA",
  PROVIDER_TIMEOUT: "PROVIDER_TIMEOUT",
  REQUIREMENT_PARSE_FAILED: "REQUIREMENT_PARSE_FAILED",
  PROJECT_SAVE_FAILED: "PROJECT_SAVE_FAILED",
  PROJECT_NOT_FOUND: "PROJECT_NOT_FOUND",
  RECOVERY_CODE_INVALID: "RECOVERY_CODE_INVALID",
  VERSION_CONFLICT: "VERSION_CONFLICT",
} as const;

export type ProjectErrorCode =
  (typeof ProjectErrorCode)[keyof typeof ProjectErrorCode];

export type ProjectStage =
  | "request_validation"
  | "requirement_parsing"
  | "vehicle_resolution"
  | "project_create"
  | "vehicle_configuration"
  | "city_sales"
  | "project_finalize"
  | "project_read"
  | "project_update"
  | "project_recovery";

export interface ProjectApiError {
  code: ProjectErrorCode;
  message: string;
  stage: ProjectStage;
  retryable: boolean;
  action: string;
}

export class ProjectServiceError extends Error {
  constructor(
    public readonly detail: ProjectApiError,
    options?: ErrorOptions,
  ) {
    super(detail.message, options);
    this.name = "ProjectServiceError";
  }
}

const defaultErrors: Record<ProjectErrorCode, Omit<ProjectApiError, "code">> = {
  VEHICLE_SERIES_NOT_FOUND: {
    message: "没有找到可核验的车系或具体版本",
    stage: "vehicle_resolution",
    retryable: false,
    action: "请补充品牌、车系、年款或配置名称",
  },
  VEHICLE_SELECTION_REQUIRED: {
    message: "找到多个可核验版本，需要选择一个具体版本",
    stage: "vehicle_resolution",
    retryable: false,
    action: "请选择专业数据返回的一个具体版本",
  },
  EXACT_CONFIG_NO_DATA: {
    message: "车型身份已锁定，但本次没有返回可绑定的精确配置数据",
    stage: "vehicle_configuration",
    retryable: false,
    action: "已保留该车型和其他成功数据，不需要重新选择车型",
  },
  CITY_SALES_NO_DATA: {
    message: "本次没有返回可核验的城市车系月份数据",
    stage: "city_sales",
    retryable: false,
    action: "已保留配置和其他车型数据",
  },
  PROVIDER_TIMEOUT: {
    message: "上游数据查询超时",
    stage: "vehicle_configuration",
    retryable: true,
    action: "已保留其他成功数据，可稍后重新建立项目",
  },
  REQUIREMENT_PARSE_FAILED: {
    message: "Agent Plan 未能完整解析需求，已使用保守规则并保留原文",
    stage: "requirement_parsing",
    retryable: false,
    action: "请检查待确认项是否完整",
  },
  PROJECT_SAVE_FAILED: {
    message: "项目数据保存失败",
    stage: "project_finalize",
    retryable: true,
    action: "初始项目已保存时可使用项目编号恢复",
  },
  PROJECT_NOT_FOUND: {
    message: "项目不存在或已过期",
    stage: "project_read",
    retryable: false,
    action: "请检查项目编号，或重新建立项目",
  },
  RECOVERY_CODE_INVALID: {
    message: "项目编号或恢复码不正确",
    stage: "project_recovery",
    retryable: false,
    action: "请检查项目编号和恢复码",
  },
  VERSION_CONFLICT: {
    message: "项目已被其他操作更新",
    stage: "project_update",
    retryable: true,
    action: "请刷新页面后重试",
  },
};

export function projectApiError(
  code: ProjectErrorCode,
  overrides: Partial<Omit<ProjectApiError, "code">> = {},
): ProjectApiError {
  return { code, ...defaultErrors[code], ...overrides };
}

export function toProjectApiError(
  error: unknown,
  fallbackCode: ProjectErrorCode = ProjectErrorCode.PROJECT_SAVE_FAILED,
): ProjectApiError {
  if (error instanceof ProjectServiceError) return error.detail;
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
  const message = error instanceof Error ? error.message : "";
  if (code === "NOT_FOUND" || /not found|不存在/i.test(message)) {
    return projectApiError(ProjectErrorCode.PROJECT_NOT_FOUND);
  }
  if (
    code === "UNAUTHORIZED" ||
    /recovery code|恢复码|edit token|编辑令牌/i.test(message)
  ) {
    return projectApiError(ProjectErrorCode.RECOVERY_CODE_INVALID);
  }
  if (code === "VERSION_CONFLICT" || /version conflict|版本冲突/i.test(message)) {
    return projectApiError(ProjectErrorCode.VERSION_CONFLICT);
  }
  if (/timeout|timed out|abort/i.test(message)) {
    return projectApiError(ProjectErrorCode.PROVIDER_TIMEOUT);
  }
  return projectApiError(fallbackCode);
}

export function logProjectStage(
  operationId: string,
  stage: ProjectStage,
  status: "start" | "ok" | "partial" | "error",
  fields: {
    candidateIndex?: number;
    code?: ProjectErrorCode | string;
    durationMs?: number;
    diagnostic?: string;
  } = {},
) {
  const entry = {
    event: "car_decision_stage",
    operationId,
    stage,
    status,
    ...fields,
  };
  (status === "error" ? console.error : console.info)(JSON.stringify(entry));
}

export function safeErrorDiagnostic(error: unknown): string {
  const value =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String(error.message)
        : String(error);
  return value
    .replace(/ark-[a-z0-9-]+/gi, "<redacted-key>")
    .replace(/eyJ[a-zA-Z0-9._-]+/g, "<redacted-token>")
    .replace(/(authorization|apikey|service[_-]?role)\\s*[:=]\\s*\\S+/gi, "$1=<redacted>")
    .slice(0, 300);
}
