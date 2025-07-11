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

/* eslint-disable max-lines-per-function */
import React, { useContext, useEffect, useState } from 'react';

import { getQuestionSegmentList } from '@/api/bridge';
import { getCameraImageBase64 } from '../../utils';
import ImageRectSelect from './components/ImageRectSelect';

import styles from './index.module.less';
import { CircleButton } from './components/CircleButton';
import { RouterContext } from '../../context/routerContext/context';
import { closeApp } from 'multi-modal-sdk';

const Confirm = () => {
  const { query, navigate } = useContext(RouterContext);

  const [imageBase64, setImageBase64] = useState('');
  const [rotate, setRotate] = useState(0); // 旋转角度 [0, 90, 180, 270]
  const [selectRect, setSelectRect] = useState<{
    top: number;
    left: number;
    right: number;
    bottom: number;
  }>(); // 选中的区域 [top, left, right, bottom]

  const onConfirm = async () => {
    if (selectRect) {
      const searchParams = new URL(window.location.toString()).searchParams;
      const imageId = searchParams.get('image_id');
      const res: any = await getQuestionSegmentList({
        imageId: imageId,
        rotate,
        selectRect
      });
      const { pass, detectedQuestions } = res || {};
      if (pass) {
        navigate('recognition-result', {
          detectedQuestions,
          selectRect
        });
      }
      return;
    }
    // 直接确认
    const { detectedQuestions, midBoxIndex } = query.originData;
    const confirmQuestion = detectedQuestions[midBoxIndex];
    navigate('recognition-result', {
      detectedQuestions: [confirmQuestion]
    });
  };

  useEffect(() => {
    (async () => {
      const searchParams = new URL(window.location.toString()).searchParams;
      const imageId = searchParams.get('image_id');
      if (imageId) {
        const base64 = await getCameraImageBase64(imageId);
        setImageBase64(base64);
      }
    })();
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <ImageRectSelect
          initPosition={query.position}
          initSize={query.size}
          imageSrc={imageBase64}
          rotate={rotate}
          onSelect={(position, size, scale) => {
            const top = Math.floor(position.y / scale.y);
            const left = Math.floor(position.x / scale.x);
            setSelectRect({
              top,
              left,
              right: left + Math.floor(size.width / scale.x),
              bottom: top + Math.floor(size.height / scale.y)
            });
          }}
        />
      </div>
      <div className={styles['btn-container']}>
        <CircleButton
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="20" viewBox="0 0 24 20" fill="none">
              <path
                d="M7.5 2.5L3 7L7.5 11.5"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M3 7H13.2195C16.2786 7 18.8765 9.16169 18.9957 11.8077C19.1217 14.6037 16.452 17 13.2195 17H10.0588"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          }
          onClick={() => {
            // 返回拍照界面
            closeApp();
          }}
        />
        <CircleButton
          icon={
            <svg
              style={{ position: 'relative', left: 3 }}
              xmlns="http://www.w3.org/2000/svg"
              width="28"
              height="28"
              viewBox="0 0 28 28"
              fill="none"
            >
              <path
                d="M21 4L9.84383 21.5834L2.91675 14.6895"
                stroke="white"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          }
          size={64}
          style={{ background: '#0CCC75' }}
          onClick={() => {
            onConfirm();
          }}
        />
        <CircleButton
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M3 10H18V19H3V10Z" stroke="white" strokeWidth="2" strokeLinejoin="round" />
              <path
                d="M2 2V6.5H6.5"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M18.2374 4.64925C16.5978 2.43525 13.9665 1 11 1C8.0894 1 5.50145 2.38167 3.85636 4.5249L2 6.5"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          }
          onClick={() => {
            setRotate((prev) => (prev + 90) % 360);
          }}
        />
      </div>
    </div>
  );
};

export default Confirm;
