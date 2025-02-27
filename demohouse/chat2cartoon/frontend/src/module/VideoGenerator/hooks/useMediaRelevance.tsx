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

import { useEffect, useState } from 'react';

import { useIndexedDB } from './useIndexedDB';

// 视频首帧图/音频背景图，在生成的时候记录
const useMediaRelevance = (storeUniqueId: string) => {
  const dbInstance = useIndexedDB(storeUniqueId);
  const [videoBackgroundImages, setVideoBackgroundImages] = useState<string[][]>([]);
  const [audioBackgroundImages, setAudioBackgroundImages] = useState<string[][]>([]);

  const updateAudioBackgroundImages = (params: ((prevData: string[][]) => string[][]) | string[][]) => {
    if (Array.isArray(params)) {
      setAudioBackgroundImages(params);
      if (dbInstance) {
        dbInstance.putItem({ audioBackgroundImages: params });
      }
      return;
    }

    // 传入函数
    setAudioBackgroundImages(prevData => {
      const newData = params(prevData);
      if (dbInstance) {
        dbInstance.putItem({ audioBackgroundImages: newData });
      }
      return newData;
    });
  };

  const updateVideoBackgroundImages = (params: ((prevData: string[][]) => string[][]) | string[][]) => {
    if (Array.isArray(params)) {
      setVideoBackgroundImages(params);
      if (dbInstance) {
        dbInstance.putItem({ videoBackgroundImages: params });
      }
      return;
    }

    // 传入函数
    setVideoBackgroundImages(prevData => {
      const newData = params(prevData);
      if (dbInstance) {
        dbInstance.putItem({ videoBackgroundImages: newData });
      }
      return newData;
    });
  };

  useEffect(() => {
    if (!dbInstance) {
      return;
    }
    (async () => {
      const data = await dbInstance.getItem();
      if (data) {
        setVideoBackgroundImages(data.videoBackgroundImages ?? []);
        setAudioBackgroundImages(data.audioBackgroundImages ?? []);
      }
    })();
  }, []);

  return {
    videoBackgroundImages,
    audioBackgroundImages,
    updateVideoBackgroundImages,
    updateAudioBackgroundImages,
  };
};

export default useMediaRelevance;
