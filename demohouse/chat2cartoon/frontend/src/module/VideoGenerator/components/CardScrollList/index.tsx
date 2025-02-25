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

import { ReactElement, useEffect, useState } from 'react';

import cx from 'classnames';
import { IconLeft, IconRight } from '@arco-design/web-react/icon';

import styles from './index.module.less';

interface Props {
  list: ReactElement[];
  isActive?: boolean;
  id: string;
}

const CardScrollList = ({ list, isActive, id }: Props) => {
  const [leftVisible, setLeftVisible] = useState(false);
  const [rightVisible, setRightVisible] = useState(false);

  useEffect(() => {
    if (list.length > 2) {
      setRightVisible(true);
    }
  }, [list]);

  const handleScrollRight = () => {
    const scrollContainer = document.getElementById(id);
    if (scrollContainer !== null) {
      scrollContainer.scrollBy({ left: 900, behavior: 'smooth' });
    }
    if (
      (scrollContainer?.scrollLeft || 0) + 900 >=
      (scrollContainer?.scrollWidth || 0) - (scrollContainer?.clientWidth || 0)
    ) {
      setRightVisible(false);
    }
    setLeftVisible(true);
  };

  const handleScrollLeft = () => {
    const scrollContainer = document.getElementById(id);
    if (scrollContainer !== null) {
      scrollContainer.scrollBy({ left: -900, behavior: 'smooth' });
    }
    if ((scrollContainer?.scrollLeft || 0) <= 900) {
      setLeftVisible(false);
    }
    setRightVisible(true);
  };

  return (
    <div className={cx(styles.border, { [styles.colorfulBorder]: isActive })}>
      {rightVisible && (
        <div className={styles.iconRight}>
          <IconRight fontSize={20} onClick={handleScrollRight} />
        </div>
      )}
      {leftVisible && (
        <div className={styles.iconLeft}>
          <IconLeft fontSize={20} onClick={handleScrollLeft} />
        </div>
      )}
      <div className={styles.listWrapper} id={id}>
        {list}
      </div>
    </div>
  );
};
export default CardScrollList;
