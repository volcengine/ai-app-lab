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
