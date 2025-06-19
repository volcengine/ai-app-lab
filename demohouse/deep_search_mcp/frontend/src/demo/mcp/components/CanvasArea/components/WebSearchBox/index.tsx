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

import React from 'react';

import styles from './index.module.less';
import SearchItem from './SearchItem';

interface Reference {
  url: string;
  title: string;
  site_name: string;
  logo_url: string;
}

interface Props {
  query: string;
  references?: Reference[];
}

const WebSearchBox = (props: Props) => {
  const { references } = props;

  const onClickResourceItem = (reference: Reference) => {
    window.open(reference.url);
  };

  return (
    <div className={styles.webSearchBox}>
      <div className="flex flex-col gap-[8px]">
        {references?.map((reference, referenceIndex) => (
          <div
            key={referenceIndex}
            className={styles.resourceItem}
            onClick={() => {
              onClickResourceItem(reference);
            }}
          >
            {/* <span>
              {referenceIndex + 1}. {reference.title}
            </span>
            <span className={styles.split}> I </span>
            <span className={styles.site}>{reference.site_name}</span> */}
            <SearchItem title={reference.title} site={reference.site_name} logoUrl={reference.logo_url} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default WebSearchBox;
