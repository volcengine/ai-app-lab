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

import { getCameraImage } from "@ai-app/bridge-api/procode";

export const getCameraImageBase64 = async (imageId: string) => {
  const res = await getCameraImage({ imageId });
  if (res.base64Image) {
    return `data:image/jpeg;base64,${res.base64Image}`;
  }
  return '';
};

export const getImageScale = (imgElement: HTMLImageElement): { x: number; y: number } | null => {
  if (!(imgElement instanceof HTMLImageElement)) {
    console.error('Invalid input parameters');
    return null;
  }
  const { naturalWidth, naturalHeight, clientWidth, clientHeight } = imgElement;
  const scaleX = clientWidth / naturalWidth;
  const scaleY = clientHeight / naturalHeight;

  return {
    x: scaleX,
    y: scaleY
  };
};