/*
 * Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
 * Licensed under the 【火山方舟】原型应用软件自用许可协议
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at 
 *     https://www.volcengine.com/docs/82379/1433703
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export const SupportImageFileTypes = [
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "bmp",
  "dib",
  "heic",
  "heif",
];

/** 分辨率 */
export enum Resolution {
  Resolution_480 = "480p",
  Resolution_720 = "720p",
  Resolution_1080 = "1080p",
  Resolution_1K = "1K",
  Resolution_2K = "2K",
  Resolution_4K = "4K",
}

/** 比例 */
export enum Ratio {
  //   Ratio_Adaptive = "adaptive",
  Ratio_1_1 = "1:1",
  Ratio_3_4 = "3:4",
  Ratio_4_3 = "4:3",
  Ratio_16_9 = "16:9",
  Ratio_9_16 = "9:16",
  Ratio_2_3 = "2:3",
  Ratio_3_2 = "3:2",
  Ratio_21_9 = "21:9",
}

/** 生图 分辨率 + 比例 -> [width, height] */
export const GenImageResolutionRatio2WHMap: Partial<
  Record<Resolution, Partial<Record<Ratio, [number, number]>>>
> = {
  /**
   *   1k：
  - 1024x1024 （1:1）
  - 864x1152 （3:4）
  - 1152x864 （4:3）
  - 1280x720 （16:9）
  - 720x1280 （9:16）
  - 832x1248 （2:3）
  - 1248x832 （3:2）
  - 1512x648 （21:9）
   */
  [Resolution.Resolution_1K]: {
    [Ratio.Ratio_21_9]: [1512, 648],
    [Ratio.Ratio_16_9]: [1280, 720],
    [Ratio.Ratio_4_3]: [1152, 864],
    [Ratio.Ratio_1_1]: [1024, 1024],
    [Ratio.Ratio_3_4]: [864, 1152],
    [Ratio.Ratio_9_16]: [720, 1280],
    [Ratio.Ratio_2_3]: [832, 1248],
    [Ratio.Ratio_3_2]: [1248, 832],
  },
  /**
   *   2k：
  - 2048x2048 （1:1）
  - 2304x1728 （3:4）
  - 2304x1728（4:3）
  - 2560x1440 （16:9）
  - 1440x2560 （9:16）
  - 1664x2496 （2:3）
  - 2496x1664 （3:2）
  - 3024x1296 （21:9）
   */
  [Resolution.Resolution_2K]: {
    [Ratio.Ratio_21_9]: [3024, 1296],
    [Ratio.Ratio_16_9]: [2560, 1440],
    [Ratio.Ratio_4_3]: [2304, 1728],
    [Ratio.Ratio_1_1]: [2048, 2048],
    [Ratio.Ratio_3_4]: [1728, 2304],
    [Ratio.Ratio_9_16]: [1440, 2560],
    [Ratio.Ratio_2_3]: [1664, 2496],
    [Ratio.Ratio_3_2]: [2496, 1664],
  },
  /**
   *   4k：
  - 4096x4096 （1:1）
  - 3520x4704 （3:4）
  - 4704x3520（4:3）
  - 5504x3040 （16:9）
  - 3040x5504（9:16）
  - 3328x4992（2:3）
  - 4992x3328 （3:2）
  - 6240x2656 （21:9）
   */
  [Resolution.Resolution_4K]: {
    [Ratio.Ratio_21_9]: [6240, 2656],
    [Ratio.Ratio_16_9]: [5504, 3040],
    [Ratio.Ratio_4_3]: [4704, 3520],
    [Ratio.Ratio_1_1]: [4096, 4096],
    [Ratio.Ratio_3_4]: [3520, 4704],
    [Ratio.Ratio_9_16]: [3040, 5504],
    [Ratio.Ratio_2_3]: [3328, 4992],
    [Ratio.Ratio_3_2]: [4992, 3328],
  },
};
