import { getCameraImage } from '@ai-app/bridge-api/procode';
import { EQUESTIONSTATUS } from '@/pages/entry/routes/recognition-result/components/AnswerCard';

export const getCameraImageBase64 = async (imageId: string) => {
  const res = await getCameraImage({ imageId });
  if (res.base64Image) {
    return `data:image/jpeg;base64,${res.base64Image}`;
  }
  return '';
};

export const parseVLMCorrectionResult = (content: string) => {
  const idx = content.indexOf('批改结果');
  if (idx === -1) {
    return EQUESTIONSTATUS.NONE;
  }
  // deepseek 输出匹配
  // 批改结果：错误
  // 批改结果：正确
  // 批改结果：无
  const reg = /([正确|错误|无])+/g;
  //
  const matchRes = content.slice(idx, idx + 10).match(reg);
  if (matchRes === null) {
    return EQUESTIONSTATUS.NONE;
  }
  if (matchRes[0] === '无') {
    return EQUESTIONSTATUS.NONE;
  }
  if (matchRes[0] === '错误') {
    return EQUESTIONSTATUS.FALSE;
  }
  if (matchRes[0] === '正确') {
    return EQUESTIONSTATUS.TRUE;
  }
  return EQUESTIONSTATUS.TRUE;
};

export const genId = () => Math.random().toString(36).slice(2);
