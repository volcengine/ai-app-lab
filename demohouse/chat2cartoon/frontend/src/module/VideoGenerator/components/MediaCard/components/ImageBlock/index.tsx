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


import { IconErrorTypeHighSaturation } from '@/images/iconBox';
import { ReactComponent as IconMediaLoading } from '@/images/icon_media_loading.svg';
import iconImageFailed from '@/images/assets/icon_image_failed.png';

import styles from './index.module.less';


interface ImageBlockProps {
  imgUrl?: string;
  imgText?: string;
}

const ImageBlock = ({ imgUrl, imgText }: ImageBlockProps) => {
  const renderImg = () => {
    if (imgUrl === 'Post Img Risk Not Pass') {
      return (
        <div className={styles.imgRisk}>
          <IconErrorTypeHighSaturation fontSize={76} />
          <div className={styles.riskText}>
            {'图片内容不合规'}
          </div>
        </div>
      );
    }
    if (imgUrl && !imgUrl?.startsWith('http')) {
      return (
        <div className={styles.imgRisk}>
          <img src={iconImageFailed} style={{ width: 76, height: 76 }} />
          <div className={styles.riskText}>{'图片生成失败'}</div>
        </div>
      );
    }
    if (imgUrl) {
      return (
        <img
          src={imgUrl}
          onError={e => {
            e.currentTarget.src = iconImageFailed;
          }}
        />
      );
    }
    return (
      <div className={styles.background}>
        <IconMediaLoading className={styles.icon} />
      </div>
    );
  };
  return (
    <div className={styles.wrapper}>
      {renderImg()}
      {imgText && <div className={styles.text}>{imgText}</div>}
    </div>
  );
};

export default ImageBlock;
