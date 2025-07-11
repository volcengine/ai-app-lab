import { createAPI } from '../client-api';

/**
 * 根据imageId获取图片信息
 * @param params - 请求参数
 * @param params.imageId - 图片唯一ID
 * @returns 返回包含以下内容的Promise:
 *   - base64Image: 图片的base64编码字符串
 *   - imageId: 图片唯一ID
 *   - location: 照片拍摄的地理位置(如"广东省深圳市南山区粤海街道")
 * @example
 * ```ts
 * const { base64Image, location } = await getImageInfo({ imageId: '123' });
 * ```
 */
export const getImageInfo = createAPI<
  {
    imageId: string;
  },
  {
    base64Image: string;
    imageId: string;
    location: string;
  }
>('applet.multimodal.getImageInfo');

/**
 * 获取物体检测信息
 * @param params - 请求参数
 * @param params.imageId - 图片唯一ID
 * @returns 返回包含以下内容的Promise:
 *   - detectedObjects: 检测到的物体列表，每个物体包含:
 *     - centerX: 物体中心点X坐标(px)
 *     - centerY: 物体中心点Y坐标(px)
 *     - width: 物体宽度(px)
 *     - height: 物体高度(px)
 *     - name: 识别出的物体类别/名称
 * @example
 * ```ts
 * const { detectedObjects } = await getObjectDetectList({ imageId: '123' });
 * ```
 */
export const getObjectDetectList = createAPI<
  {
    imageId: string;
  },
  {
    detectedObjects: Array<{
      centerX: number;
      centerY: number;
      width: number;
      height: number;
      name: string;
    }>;
  }
>('applet.multimodal.getObjectDetectList');

/**
 * 获取物体分割信息
 * @param params - 请求参数
 * @param params.imageId - 图片唯一ID
 * @param params.points - 可选，分割点坐标数组，每个点包含:
 *   - x: X坐标(px)
 *   - y: Y坐标(px)
 *   - label: 0表示exclude，1表示include(默认为1)
 * @param params.rectangles - 可选，分割矩形区域数组，每个矩形包含:
 *   - top: 顶部坐标
 *   - left: 左侧坐标
 *   - right: 右侧坐标
 *   - bottom: 底部坐标
 * @param params.contourTopN - 可选，获取面积前N大的闭合轮廓
 * @returns 返回包含以下内容的Promise:
 *   - maskContour: 三维数组，表示传入mask的闭合轮廓列表(先Y后X)
 *   - segId: 当前分割物体的ID
 * @example
 * ```ts
 * const { maskContour } = await getSAMInfo({
 *   imageId: '123',
 *   points: [{ x: 100, y: 100, label: 1 }]
 * });
 * ```
 */
export const getSAMInfo = createAPI<
  {
    imageId: string;
    points?: Array<{
      x: number;
      y: number;
      label: 0 | 1;
    }>;
    rectangles?: Array<{
      top: number;
      left: number;
      right: number;
      bottom: number;
    }>;
    contourTopN?: number;
  },
  {
    maskContour: number[][][];
    segId: string;
  }
>('applet.multimodal.getSAMInfo');
