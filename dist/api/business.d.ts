/**
 * 关闭 app
 * @example
 * ```ts
 * import { closeApp } from 'multi-modal-sdk';
 *
 * closeApp();
 * ```
 */
export declare const closeApp: (params?: object | undefined) => Promise<object>;
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
    questionImage: string;
    cornerPoints: [CornerPoint, CornerPoint, CornerPoint, CornerPoint];
    boundingBox: {
        centerX: number;
        centerY: number;
        width: number;
        height: number;
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
    pass: boolean;
    status: number;
    midBoxIndex: number;
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
export declare const getQuestionSegmentList: (params: GetQuestionSegmentListParams) => Promise<GetQuestionSegmentListResult>;
