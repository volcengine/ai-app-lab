import { ErrorCodes, responseForTextRiskReplace } from '@/constant';

import { EMessageType } from './context';

/**
 * 审核错误与展示的 type content的映射
 * type
 * content
 */
export const textRiskTypeContentMap = {
  [ErrorCodes.ReqTextExistRisk]: {
    type: EMessageType.Message,
    content: responseForTextRiskReplace.modelPrompt,
  },
  [ErrorCodes.RespTextExistRisk]: {
    type: EMessageType.Error,
    content: responseForTextRiskReplace.modelResponse,
  },
  [ErrorCodes.BFFPromptTextExistRisk]: {
    type: EMessageType.Message,
    content: responseForTextRiskReplace.BFFPrompt,
  },
  [ErrorCodes.BFFResponseTextExistRisk]: {
    type: EMessageType.Message,
    content: responseForTextRiskReplace.BFFResponse,
  },
};
