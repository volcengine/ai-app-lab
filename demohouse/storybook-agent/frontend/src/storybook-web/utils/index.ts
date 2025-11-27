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

import dayjs from "dayjs";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { PromptData } from "@/common/components/ChatBox/Prompt";
import { GenerateStoryBookParams } from "../apis";

export function generateUniqueId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

export function formatDate(
  timestamp: number | string,
  format: string = "MM-DD HH:mm"
): string {
  return dayjs().format(format);
}

export function formatPromptData2Params(
  data: PromptData
): GenerateStoryBookParams & {
  ratio?: string;
  resolution?: string;
} {
  return {
    mode: data.mode || "storybook",
    query: data?.text || "",
    reference_images:
      data.images?.map((item: any) => item?.response?.base64 || "") || [],
    size: data.size?.replace(",", "x") || "1024x1024",
    ratio: data.ratio || "1:1",
    resolution: data.resolution || "2K",
  };
}

export function formatImageUrl(url: string) {
  return url.replace(
    "https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com",
    ""
  );
}

export function formatFileName(filename: string) {
  return `${filename}-${dayjs().format("YYYY-MM-DD_HHmmss")}`;
}

export function getQueryValue(
  key: string,
  search: string = window.location.search
): string | null {
  return new URLSearchParams(search).get(key);
}

/**
 * 下载多张图片（支持 URL 或 Base64），打包为 ZIP
 * @param {Array<string>} images - 图片数组（URL 或 Base64）
 * @param {Function} formatFilename - 格式化文件名的函数，接收图片索引作为参数，不需拼接文件后缀
 * @param {string} [zipFilename] - ZIP 文件包名，不需要拼接文件后缀
 * @returns {Promise<void>}
 */
export async function downloadImages(
  images: string[],
  formatFilename: (index: number) => string,
  zipFilename?: string
) {
  if (!Array.isArray(images) || images.length === 0) {
    throw new Error("请输入有效的图片数组");
  }

  let currentBlob: { blob?: Blob; filename?: string } = {};
  const zip = new JSZip();

  // 将每个图片转换为 Blob 并添加到 ZIP
  const promises = images.map(async (imageData, index) => {
    try {
      let blob;
      const filename = formatFilename(index);

      if (imageData.startsWith("http") || imageData.startsWith("https")) {
        // 处理远程 URL
        const response = await fetch(imageData);
        if (!response.ok) {
          throw new Error(`HTTP 错误: ${response.status}`);
        }
        blob = await response.blob();
        currentBlob = {
          blob,
          filename: `${filename}.${getFileTypeFromMimeType(
            response.headers.get("Content-Type")
          )}`,
        };
      } else if (imageData.startsWith("data:image/")) {
        // 处理 Base64
        const base64Data = imageData.split(",")[1];
        const byteString = atob(base64Data);
        const arrayBuffer = new ArrayBuffer(byteString.length);
        const uint8Array = new Uint8Array(arrayBuffer);
        for (let i = 0; i < byteString.length; i++) {
          uint8Array[i] = byteString.charCodeAt(i);
        }
        blob = new Blob([uint8Array], { type: "image/png" });
        currentBlob = {
          blob,
          filename: `${filename}.png`,
        };
      } else {
        throw new Error("无效的图片格式");
      }

      zip.file(currentBlob.filename || "unknown.png", blob);
    } catch (error) {
      console.error(`图片 ${index + 1} 处理失败:`, error);
      throw error;
    }
  });

  try {
    await Promise.all(promises);

    if (images.length === 1) {
      if (currentBlob.blob) {
        saveAs(currentBlob.blob, currentBlob.filename);
      }
    } else {
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `${zipFilename || "unknown"}.zip`);
    }
  } catch (error: any) {
    throw new Error(`打包失败: ${error.message}`);
  }
}

/**
 * 根据 MIME 类型推断文件扩展名
 * @param {string} mimeType - MIME 类型（如 image/png）
 * @returns {string} - 文件扩展名（如 png）
 */
function getFileTypeFromMimeType(mimeType: string | null) {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/gif":
      return "gif";
    default:
      return "png";
  }
}

export function preloadImage(url: string) {
  return new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = url;
  });
}
