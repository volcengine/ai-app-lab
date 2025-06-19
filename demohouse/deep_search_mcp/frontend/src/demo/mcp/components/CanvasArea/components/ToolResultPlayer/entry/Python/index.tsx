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

import React, { useMemo, useState } from 'react';

import { Radio } from '@arco-design/web-react';

import { Event } from '@/demo/mcp/types/event';

import BaseContent from '../../baseContent';
import PlayerBroadcast from '../../../PlayerBroadcast';
import PythonBox from '../../../PythonBox';
import PythonHTMLBox from '../../../PythonHTMLBox';

interface PythonProps {
  data: Event;
}

const Python = (props: PythonProps) => {
  const { data } = props;
  const [currentHTMLType, setCurrentHTMLType] = useState<'origin' | 'preview'>('preview');
  const showHTMLBox = useMemo(() => Boolean(data.result?.files), [data.result?.files]);

  const decodeBase64 = (base64String: string) => {
    const binaryString = atob(base64String);
    const bytes = new Uint8Array(binaryString.length);

    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const decoder = new TextDecoder('utf-8');
    return decoder.decode(bytes);
  };

  const htmlContent = useMemo(() => {
    let htmlContent = '';
    if (showHTMLBox) {
      const keys = Object.keys(data.result.files);
      if (keys.length === 0) {
        return '';
      }
      // 取第一个键值
      htmlContent = decodeBase64(data.result.files[keys[0]]);
    }
    return htmlContent;
  }, [data.result?.files, showHTMLBox]);

  if (!data.result) {
    return null;
  }

  return (
    <BaseContent
      header={
        <>
          <PlayerBroadcast type={data.type} suffix={showHTMLBox ? '生成 HTML' : ''} />
          {showHTMLBox && (
            <div>
              <Radio.Group value={currentHTMLType} onChange={setCurrentHTMLType} type="button" size="small">
                <Radio value="origin">代码</Radio>
                <Radio value="preview">预览</Radio>
              </Radio.Group>
            </div>
          )}
        </>
      }
    >
      {showHTMLBox ? (
        <PythonHTMLBox currentType={currentHTMLType} code={htmlContent} />
      ) : (
        <PythonBox code={data.result.code} stdout={data.result.stdout} />
      )}
    </BaseContent>
  );
};

export default Python;
