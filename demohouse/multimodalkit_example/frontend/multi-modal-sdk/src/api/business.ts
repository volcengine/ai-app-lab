import { createAPI } from '../client-api';

/**
 * 关闭 app
 * @example
 * ```ts
 * import { closeApp } from 'multi-modal-sdk';
 *
 * closeApp();
 * ```
 */
export const closeApp = createAPI('app.close');

/**
 * 获取题目分割信息请求参数
 */
export interface GetQuestionSegmentListParams {
  imageId: string;
  rotate?: 0 | 90 | 180 | 270;
  selectRect?: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
}

/**
 * 角点坐标
 */
export interface CornerPoint {
  x: number;
  y: number;
}

/**
 * 检测到的问题
 */
export interface DetectedQuestion {
  questionImage: string; // 题目图片的base64
  cornerPoints: [CornerPoint, CornerPoint, CornerPoint, CornerPoint]; // 文本块的四个角点坐标,左上，右上，右下，左下
  boundingBox: {
    // 外接矩形
    centerX: number; // 矩形中心x
    centerY: number; // 矩形中心y
    width: number; // width
    height: number; // height
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
}

/**
 * 获取题目分割信息响应
 */
export interface GetQuestionSegmentListResult {
  pass: boolean; // 拍摄的图片是否是试卷
  status: number; // 错误码，成功为0，错误为其他值
  midBoxIndex: number; // 居中题目在detectedQuestions里面的index
  detectedQuestions: DetectedQuestion[];
}

/**
 * 获取题目分割信息
 * @param params - 请求参数
 * @returns 返回 Promise 包含题目分割信息
 * @example
 * ```ts
 * import { getQuestionSegmentList } from 'multi-modal-sdk';
 *
 * const result = await getQuestionSegmentList({ imageId: 'some-image-id' });
 * console.log('题目分割信息:', result);
 * ```
 */
export const getQuestionSegmentList = createAPI<
  GetQuestionSegmentListParams,
  GetQuestionSegmentListResult
>('mind.getQuestionSegmentList');
