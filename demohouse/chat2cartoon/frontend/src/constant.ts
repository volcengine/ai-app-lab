// Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
// Licensed under the 【火山方舟】原型应用软件自用许可协议
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at 
//     https://www.volcengine.com/docs/82379/1433703
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

enum EBotErrorType {
  RiskText = 'RiskText',
  ClientNetworkError = 'ClientNetworkError', // 客户端网络连接错误
  KnowledgeBaseError = 'KnowledgeBaseError', // 知识库调用出错
  RateLimit = 'RateLimit', // 请求速率限制
  Timeout = 'Timeout', // 请求超时
  EndpointError = 'EndpointError', // 在线推理接入点无效或异常
  ModelError = 'ModelError', // 模型服务报错
  ServiceError = 'ServiceError', // 服务未开通或账户余额欠费
  InternalServiceError = 'InternalServiceError', // 服务异常或未知错误
  AuthenticationError = 'AuthenticationError', // 认证或授权错误
  ParameterError = 'ParameterError', // 缺少必要参数
  OtherError = 'OtherError', // 其他低频错误，可保持原中文说明
}

export enum ErrorCodes {
  RateLimitExceeded = 'RateLimitExceeded',
  ReqTextExistRisk = 'ReqTextExistRisk',
  RespTextExistRisk = 'RespTextExistRisk',
  BFFPromptTextExistRisk = 'BFFPromptTextExistRisk',
  BFFResponseTextExistRisk = 'BFFResponseTextExistRisk',
  SensitiveContentDetected = 'SensitiveContentDetected',
  ConnectionEstablishmentFailed = 'ConnectionEstablishmentFailed',
  KnowledgeBaseError = 'KnowledgeBaseError',
  EndpointRateLimitExceeded = 'EndpointRateLimitExceeded',
  EndpointAccountRpmRateLimitExceeded = 'EndpointAccountRpmRateLimitExceeded',
  EndpointAccountTpmRateLimitExceeded = 'EndpointAccountTpmRateLimitExceeded',
  MaasPlatformNotOpen = 'MaasPlatformNotOpen',
  AssistantRateLimitExceeded = 'AssistantRateLimitExceeded',
  ModelAccountTpmRateLimitExceeded = 'ModelAccountTpmRateLimitExceeded',
  'RateLimitExceeded.FoundationModelRPMExceeded' = 'RateLimitExceeded.FoundationModelRPMExceeded',
  'RateLimitExceeded.FoundationModelTPDExceeded' = 'RateLimitExceeded.FoundationModelTPDExceeded',
  'RateLimitExceeded.FoundationModelTPMExceeded' = 'RateLimitExceeded.FoundationModelTPMExceeded',
  'RateLimitExceeded.EndpointRPMExceeded' = 'RateLimitExceeded.EndpointRPMExceeded',
  'RateLimitExceeded.EndpointTPMExceeded' = 'RateLimitExceeded.EndpointTPMExceeded',
  ServerOverloaded = 'ServerOverloaded',
  NeedRetryError = 'NeedRetryError',
  RequestTimeout = 'RequestTimeout',
  InferenceServiceConnetionTimeout = 'InferenceServiceConnetionTimeout',
  APITimeoutError = 'APITimeoutError',
  InvalidEndpointWithNoURL = 'InvalidEndpointWithNoURL',
  EndpointIsNotEnable = 'EndpointIsNotEnable',
  EndpointIsInvalid = 'EndpointIsInvalid',
  InvalidEndpoint = 'InvalidEndpoint',

  'InvalidEndpoint.NotFound' = 'InvalidEndpoint.NotFound',
  'InvalidEndpoint.ClosedEndpoint' = 'InvalidEndpoint.ClosedEndpoint',
  EndpointIsPending = 'EndpointIsPending',
  ModelLoadingError = 'ModelLoadingError',
  ModelLoading = 'ModelLoading',
  ChatNotSupportStreamMode = 'ChatNotSupportStreamMode',
  'InvalidParameter.UnsupportedModel' = 'InvalidParameter.UnsupportedModel',
  ModelNotSupportEmbeddings = 'ModelNotSupportEmbeddings',
  ChatNotSupportBatchStreamMode = 'ChatNotSupportBatchStreamMode',
  ChatNotSupportBatchMode = 'ChatNotSupportBatchMode',
  ServiceNotOpen = 'ServiceNotOpen',
  ServiceOverdue = 'ServiceOverdue',
  AccountOverdueError = 'AccountOverdueError',
  QuotaExceeded = 'QuotaExceeded',
  ModelAccountRpmRateLimitExceeded = 'ModelAccountRpmRateLimitExceeded',
  ServiceConnectionRefused = 'ServiceConnectionRefused',
  InternalServiceError = 'InternalServiceError',
  InternalServiceShowMsgError = 'InternalServiceShowMsgError',
  UnknownError = 'UnknownError',
  EngineInternalServiceError = 'EngineInternalServiceError',
  TextCheckServiceError = 'TextCheckServiceError',
  ServiceConnectionClosed = 'ServiceConnectionClosed',
  SignatureDoesNotMatch = 'SignatureDoesNotMatch',
  MissingAuthenticationHeader = 'MissingAuthenticationHeader',
  AuthenticationHeaderIsInvalid = 'AuthenticationHeaderIsInvalid',
  UnauthorizedUserForEndpoint = 'UnauthorizedUserForEndpoint',
  UnauthorizedClientCertificate = 'UnauthorizedClientCertificate',
  UnauthorizedUserForResource = 'UnauthorizedUserForResource',
  AuthenticationError = 'AuthenticationError',
  AuthenticationExpire = 'AuthenticationExpire',
  NoAccountIdError = 'NoAccountIdError',
  NoUserIdError = 'NoUserIdError',
  MissingParameter = 'MissingParameter',
  InvalidParameter = 'InvalidParameter',
  UnauthorizedApiKeyForEndpoint = 'UnauthorizedApiKeyForEndpoint',
  ApiKeyBannedError = 'ApiKeyBannedError',
  ServiceResourceWaitQueueFull = 'ServiceResourceWaitQueueFull',
  ResourceNotFound = 'ResourceNotFound',
  AccessDenied = 'AccessDenied',
  RequestCanceled = 'RequestCanceled',
  RequestCancelled = 'RequestCancelled',
  APINotSupport = 'APINotSupport',
  FunctionCallPostProcessError = 'FunctionCallPostProcessError',
  'InvalidParameter.OversizedImage' = 'InvalidParameter.OversizedImage',
  'InvalidParameter.UnsupportedImageFormat' = 'InvalidParameter.UnsupportedImageFormat',
  'InvalidParameter.UnsupportedImageCount' = 'InvalidParameter.UnsupportedImageCount',
  'InvalidParameter.UnsupportedInput' = 'InvalidParameter.UnsupportedInput',
  ImageSizeLimitExceeded = 'ImageSizeLimitExceeded',
  ImageFormatNotSupported = 'ImageFormatNotSupported',
  OnlyOneImageSupported = 'OnlyOneImageSupported',
  OnlyOneMultiContentSupported = 'OnlyOneMultiContentSupported',
  UrlUnSupported = 'UrlUnSupported',
  Unknown = 'Unknown',
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  '600403' = '600403',
  // bot新增错误码
  InvalidAction = 'InvalidAction',
  InvalidBot = 'InvalidBot',
  LinkReaderBaseError = 'LinkReaderBaseError',
  // 推理公共错误码
}

export const botErrorCodesMessageMap = {
  // 触发内容审核
  [ErrorCodes.ReqTextExistRisk]: '输入文本包含敏感信息，请更换话题后进行重试',
  [ErrorCodes.RespTextExistRisk]: '输出文本包含敏感信息，请更换话题后进行重试',
  [ErrorCodes.BFFPromptTextExistRisk]: '输入文本可能包含敏感信息',
  [ErrorCodes.BFFResponseTextExistRisk]:
    '生成文本可能包含敏感信息，联系平台技术同学进行解决。',

  [ErrorCodes.SensitiveContentDetected]:
    '输入文本包含敏感信息，请更换话题后进行重试',
  [ErrorCodes.LinkReaderBaseError]: '网页解析插件调用出错',
  [ErrorCodes['600403']]: '渠道号不正确',
  [ErrorCodes.ConnectionEstablishmentFailed]:
    '网络连接建立失败，请检查网络后进行重试',
  [EBotErrorType.KnowledgeBaseError]:
    '当前知识库服务异常，请稍后重试，如多次重试失败请联系我们',
  [EBotErrorType.RateLimit]: '当前服务繁忙或关联资源请求已达上限，请稍后重试',
  [EBotErrorType.Timeout]: '服务请求超时，请核对服务情况并稍后重试',
  [EBotErrorType.EndpointError]:
    '模型推理接入点无效或暂时不可用，请检查后重试，如多次重试失败请联系我们。',
  [ErrorCodes.ModelLoading]:
    '当前模型服务正在加载中，请稍后重试，如多次重试失败请联系我们',
  [ErrorCodes.ModelLoadingError]:
    '当前模型服务正在加载中，请稍后重试，常出现在调用流量突增或刚开始调用长时间未使用的推理接入点。如多次重试失败请联系我们',
  [ErrorCodes.ChatNotSupportStreamMode]: '模型不支持流模式，请更改后重试',
  [ErrorCodes['InvalidParameter.UnsupportedModel']]:
    '模型不支持流模式，请更改后重试',
  [ErrorCodes.ModelNotSupportEmbeddings]: '模型不支持嵌入，请更改后重试',
  [ErrorCodes.ChatNotSupportBatchStreamMode]:
    '模型不支持批量流模式，请更改后重试',
  [ErrorCodes.ChatNotSupportBatchMode]: '模型不支持批量模式，请更改后重试',
  [ErrorCodes.ServiceNotOpen]: '请注意相关平台服务暂未开通，请开通后进行重试',
  [ErrorCodes.MaasPlatformNotOpen]:
    '请注意相关平台服务暂未开通，请开通后进行重试',
  [ErrorCodes.ServiceOverdue]:
    '账户余额不足或欠费，请前往交易中心充值以继续使用服务',
  [ErrorCodes.AccountOverdueError]:
    '账户余额不足或欠费，请前往火山交易中心充值以继续使用服务',
  // BOT
  [ErrorCodes.InvalidAction]: '请求插件已关停，请开通插件后再次重试',
  [ErrorCodes.InvalidBot]: '请求Bot不存在，请检查后重试',
  [ErrorCodes.QuotaExceeded]:
    '当前账号 %s 对 %s 模型的免费试用额度已消耗完毕，请先开通对应的模型服务',
  [EBotErrorType.InternalServiceError]:
    '当前服务异常，请稍后重试，如多次重试失败请联系我们',
  [EBotErrorType.AuthenticationError]:
    '认证校验无效或授权检查未通过，请您重新检查设置的鉴权凭证。',
  [ErrorCodes.NoAccountIdError]: '缺少必要参数 AccountId，请检查后重试',
  [ErrorCodes.NoUserIdError]: '缺少必要参数 UserId，请检查后重试',
  [EBotErrorType.ParameterError]: '请求缺少必要参数或参数无效，请检查后重试',
  [ErrorCodes.UnauthorizedApiKeyForEndpoint]:
    'API 密钥与端点不匹配，请重新生成 API 密钥',
  [ErrorCodes.ApiKeyBannedError]: 'API 密钥已被封禁，请申请新的或联系管理员',
  [ErrorCodes.ServiceResourceWaitQueueFull]: '服务没有更多资源放入队列',
  [ErrorCodes.ResourceNotFound]: '未找到指定资源',
  [ErrorCodes.AccessDenied]:
    '没有访问该资源的权限，请检查权限设置，或联系管理员添加白名单。',
  [ErrorCodes.RequestCanceled]: '请求已取消',
  [ErrorCodes.RequestCancelled]: '请求已被调用方取消',
  [ErrorCodes.APINotSupport]: 'API 不支持',
  [ErrorCodes.FunctionCallPostProcessError]: '函数调用后处理错误',
  [ErrorCodes['InvalidParameter.OversizedImage']]: '图片大小超出限制',
  [ErrorCodes['InvalidParameter.UnsupportedImageFormat']]: '图片格式不支持',
  [ErrorCodes['InvalidParameter.UnsupportedImageCount']]:
    '一轮对话仅支持一张图片',
  [ErrorCodes['InvalidParameter.UnsupportedInput']]:
    '仅支持tos，http或https URL',
  [ErrorCodes.ImageSizeLimitExceeded]:
    '图片大小超出限制，请减小图片大小，或联系管理员',
  [ErrorCodes.ImageFormatNotSupported]:
    '图片格式不支持，仅支持 jpg、png，请修改图片，或联系管理员',
  [ErrorCodes.OnlyOneImageSupported]:
    '会话中仅支持一张图片，请修改图片，或联系管理员',
  [ErrorCodes.OnlyOneMultiContentSupported]:
    '会话中仅支持一个内容，请修改，或联系管理员',
  [ErrorCodes.UrlUnSupported]:
    '仅支持 tos、http、https url，请修改，或联系管理员',
  [ErrorCodes.Unknown]: '未知错误',
};

const ErrorCodeMap = {
  [EBotErrorType.RiskText]: [
    ErrorCodes.ReqTextExistRisk,
    ErrorCodes.RespTextExistRisk,
  ],
  [EBotErrorType.ClientNetworkError]: [
    ErrorCodes.ConnectionEstablishmentFailed,
  ],
  [EBotErrorType.KnowledgeBaseError]: [ErrorCodes.KnowledgeBaseError],
  [EBotErrorType.RateLimit]: [
    ErrorCodes.EndpointRateLimitExceeded,
    ErrorCodes.EndpointRateLimitExceeded,
    ErrorCodes.AssistantRateLimitExceeded,
    ErrorCodes.EndpointAccountTpmRateLimitExceeded,
    ErrorCodes.EndpointAccountRpmRateLimitExceeded,
    ErrorCodes.ModelAccountTpmRateLimitExceeded,
    ErrorCodes['RateLimitExceeded.FoundationModelRPMExceeded'],
    ErrorCodes['RateLimitExceeded.FoundationModelTPDExceeded'],
    ErrorCodes['RateLimitExceeded.FoundationModelTPMExceeded'],
    ErrorCodes['RateLimitExceeded.EndpointRPMExceeded'],
    ErrorCodes['RateLimitExceeded.EndpointTPMExceeded'],
    ErrorCodes.ModelAccountRpmRateLimitExceeded,
    ErrorCodes.ServerOverloaded,
    ErrorCodes.NeedRetryError,
  ],
  [EBotErrorType.Timeout]: [
    ErrorCodes.RequestTimeout,
    ErrorCodes.InferenceServiceConnetionTimeout,
    ErrorCodes.APITimeoutError,
  ],
  [EBotErrorType.EndpointError]: [
    ErrorCodes.InvalidEndpointWithNoURL,
    ErrorCodes.EndpointIsNotEnable,
    ErrorCodes.EndpointIsInvalid,
    ErrorCodes.InvalidEndpoint,
    ErrorCodes['InvalidEndpoint.ClosedEndpoint'],
    ErrorCodes['InvalidEndpoint.NotFound'],
    ErrorCodes.EndpointIsPending,
  ],
  [EBotErrorType.ModelError]: [
    ErrorCodes.ModelLoadingError,
    ErrorCodes.ChatNotSupportStreamMode,
    ErrorCodes['InvalidParameter.UnsupportedModel'],
    ErrorCodes.ModelNotSupportEmbeddings,
    ErrorCodes.ChatNotSupportBatchStreamMode,
    ErrorCodes.ChatNotSupportBatchMode,
  ],
  [EBotErrorType.ServiceError]: [
    ErrorCodes.ServiceNotOpen,
    ErrorCodes.MaasPlatformNotOpen,
    ErrorCodes.ServiceOverdue,
    ErrorCodes.AccountOverdueError,
    ErrorCodes.QuotaExceeded,
  ],
  [EBotErrorType.InternalServiceError]: [
    ErrorCodes.ServiceConnectionRefused,
    ErrorCodes.InternalServiceError,
    ErrorCodes.InternalServiceShowMsgError,
    ErrorCodes.UnknownError,
    ErrorCodes.EngineInternalServiceError,
    ErrorCodes.TextCheckServiceError,
    ErrorCodes.ServiceConnectionClosed,
  ],
  [EBotErrorType.AuthenticationError]: [
    ErrorCodes.SignatureDoesNotMatch,
    ErrorCodes.MissingAuthenticationHeader,
    ErrorCodes.AuthenticationHeaderIsInvalid,
    ErrorCodes.UnauthorizedUserForEndpoint,
    ErrorCodes.UnauthorizedClientCertificate,
    ErrorCodes.UnauthorizedUserForResource,
    ErrorCodes.AuthenticationError,
    ErrorCodes.AuthenticationExpire,
  ],
  [EBotErrorType.ParameterError]: [
    ErrorCodes.NoAccountIdError,
    ErrorCodes.NoUserIdError,
    ErrorCodes.MissingParameter,
    ErrorCodes.InvalidParameter,
  ],
  [EBotErrorType.OtherError]: [
    ErrorCodes.UnauthorizedApiKeyForEndpoint,
    ErrorCodes.ApiKeyBannedError,
    ErrorCodes.ServiceResourceWaitQueueFull,
    ErrorCodes.ResourceNotFound,
    ErrorCodes.AccessDenied,
    ErrorCodes.RequestCanceled,
    ErrorCodes.RequestCancelled,
    ErrorCodes.APINotSupport,
    ErrorCodes.FunctionCallPostProcessError,
    ErrorCodes.ImageSizeLimitExceeded,
    ErrorCodes.ImageFormatNotSupported,
    ErrorCodes.OnlyOneImageSupported,
    ErrorCodes.OnlyOneMultiContentSupported,
    ErrorCodes.UrlUnSupported,
    ErrorCodes['InvalidParameter.OversizedImage'],
    ErrorCodes['InvalidParameter.UnsupportedImageFormat'],
    ErrorCodes['InvalidParameter.UnsupportedImageCount'],
    ErrorCodes['InvalidParameter.UnsupportedInput'],
  ],
};

// 需要pick出message中的关键词，并转化message
// target_character_name: 角色11 not found
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const needTransMsgCode: any = {
  [ErrorCodes.RateLimitExceeded]: {
    reg: /The Requests Per Minute\(RPM\) limit of the associated (.*) for your account has been exceeded/,
    // starling-disable-next-line
    msg: '请求所关联的 %s1 已超过账户 TPM (Tokens Per Minute) 限制, 请稍后重试。',
  },
  [ErrorCodes.InvalidParameter]: {
    reg: /target_character_name:\s(.*)\snot found/,
    // starling-disable-next-line
    msg: '角色 %s1 不存在，请检查角色名是否正确或智能体配置是否生效',
  },
  [ErrorCodes.QuotaExceeded]: {
    reg: /Your account\s(.*)\shas exhausted its free trial quota for the\s(.*)\smodel/,
    // starling-disable-next-line
    msg: '当前账号 %s1 对 %s2 模型的免费试用额度已消耗完毕，请先开通对应的模型服务',
  },
};

// 只要包含 code / message 也是可以处理的
export const isNormalSSEError = (
  error: any
): error is {
  debugInfo?: { start_time: number; end_time: number; duration: number };
  code: string;
  message: string;
  logid?: string;
} => 'code' in error && 'message' in error;

export const TextRiskErrorCodes = [
  ErrorCodes.BFFPromptTextExistRisk,
  ErrorCodes.BFFResponseTextExistRisk,
  ErrorCodes.BFFPromptTextExistRisk,
  ErrorCodes.RespTextExistRisk,
  ErrorCodes.ReqTextExistRisk,
] as const;

export const isTextRiskError = (error: any) =>
  TextRiskErrorCodes.includes(error?.code);

const replaceParamFromMsg = (
  sourceMsg: string,
  targetMsg: string,
  reg: RegExp,
  nameMap?: { [key: string]: string }
) => {
  const match = sourceMsg.match(reg);
  if (!match) {
    return false;
  }
  let res = targetMsg;
  if (match[1]) {
    res = targetMsg.replace(/%s1/, nameMap?.[match[1]] || match[1]);
  }
  if (match[2]) {
    res = res.replace(/%s2/, nameMap?.[match[2]] || match[2]);
  }
  return res;
};

export const extractErrorMessage = (error: any) => {
  const { code, message = '' } = error;
  if (Object.keys(needTransMsgCode).includes(code)) {
    const transMsg = replaceParamFromMsg(
      message,
      needTransMsgCode[code].msg,
      needTransMsgCode[code].reg,
      undefined
    );
    if (typeof transMsg === 'string') {
      return transMsg;
    }
  }
  // 该code直接对应一个message，返回该message
  if (Object.keys(botErrorCodesMessageMap).includes(code)) {
    return botErrorCodesMessageMap[
      code as keyof typeof botErrorCodesMessageMap
    ];
  }
  // 该code没有直接对应一条message，而是对应在某一类错误下，返回该错误类型的 msg
  for (const item of Object.entries(ErrorCodeMap)) {
    const [errorType, errorCodes] = item;
    if (errorCodes.includes(code as ErrorCodes)) {
      return botErrorCodesMessageMap[
        errorType as keyof typeof botErrorCodesMessageMap
      ];
    }
  }
  return '';
};

export const getErrorContent = (error: any) => {
  // 判断error.code是否在Errors中
  if (Object.keys(ErrorCodes).includes(String(error.code))) {
    const msg = extractErrorMessage(error);
    const msgContent = `${error.code}: ${msg || error.message}`;
    return msgContent;
  }

  if (isNormalSSEError(error)) {
    // sse 超时无code
    return error.code
      ? `${error.code}: ${error?.message || ''}`
      : error?.message || '';
  }

  return '发生未知错误，请联系管理员';
};

export const responseForTextRiskReplace = {
  modelPrompt: '或许我们可以讨论一些其他的话题',
  modelResponse: '请您重新生成一次，感谢您的支持与理解',
  BFFPrompt: '让我们换个话题，看看有什么新的内容可以探讨～',
  BFFResponse: '请再次尝试生成回答～',
  fallback: '我还不够聪明，无法理解这句话，换个话题试试吧～',
};

export const responseForTextRiskReplaceSet = new Set(
  Object.values(responseForTextRiskReplace)
);

export const globalEnv = {
  ARK_ACCESS_KEY: process.env.VOLC_ACCESSKEY,
  ARK_SECRET_KEY: process.env.VOLC_SECRETKEY,
  ARK_API_KEY: process.env.ARK_API_KEY,
};
