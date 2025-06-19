import React from 'react';

import HTMLPreview from '../../../HTMLPreview';
import CodePreview from '../../../CodePreview';

interface Props {
  code: string;
  currentType: 'origin' | 'preview';
}

const PythonHTMLBox = (props: Props) => {
  const { code, currentType } = props;

  return (
    <div className="w-full h-full overflow-hidden">
      {currentType === 'preview' ? <HTMLPreview content={code} /> : <CodePreview code={code} language={'html'} />}
    </div>
  );
};

export default PythonHTMLBox;
