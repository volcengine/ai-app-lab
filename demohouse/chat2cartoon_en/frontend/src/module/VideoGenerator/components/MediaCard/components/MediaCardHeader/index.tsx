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

import cx from 'classnames';

import styles from './index.module.less';

interface Props {
  title: string;
  imgArr?: string[];
  onSelect?: (index: number) => void;
  currentIndex?: number;
}

const MediaCardHeader = ({ title, imgArr = [], currentIndex, onSelect }: Props) => (
  <div className={styles.wrapper}>
    <div className={styles.title}>{title}</div>
    <div className={styles.imgList}>
      {imgArr?.map((img, index) => (
        <img
          key={index}
          src={img}
          className={cx(styles.imgItem, {
            [styles.imgItemSelected]: index === currentIndex,
          })}
          onClick={() => {
            onSelect?.(index);
          }}
        />
      ))}
    </div>
  </div>
);

export default MediaCardHeader;
