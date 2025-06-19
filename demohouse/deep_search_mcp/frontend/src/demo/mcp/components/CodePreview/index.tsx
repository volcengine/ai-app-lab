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
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';

import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup';
import { solarizedlight } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface Props {
  code: string;
  language: string;
}

// 按需注册
SyntaxHighlighter.registerLanguage('python', python);
// 注册 HTML 语言支持（在 Prism 中，HTML 被归类为 markup）
SyntaxHighlighter.registerLanguage('html', markup);

const CodePreview = (props: Props) => {
  const { code, language } = props;
  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-[#fff] text-gray-200 pb-[8px]">
      <SyntaxHighlighter
        language={language}
        style={solarizedlight}
        customStyle={{
          background: 'transparent',
          margin: 0,
          padding: 0,
          fontSize: '14px',
          lineHeight: '1.5',
        }}
        wrapLines={true}
        showLineNumbers={true}
        lineNumberStyle={{
          minWidth: '3em',
          paddingRight: '1em',
          color: '#606366',
          textAlign: 'right',
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
};

export default CodePreview;
