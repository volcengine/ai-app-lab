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
import Recognition from './routes/recognition';
import Confirm from './routes/confirm';
import { RouterContext } from './context/routerContext/context';

import './index.css';
import { RecognitionResult } from 'src/pages/entry/routes/recognition-result';

const App = () => {
  const [query, setQuery] = useState({});
  const [route, setRoute] = useState('recognition');
  const [safeArea, setSafeArea] = useState({ top: 0, bottom: 0 });

  const navigate = (path: string, pageData?: Record<string, any>) => {
    setQuery(pageData || {});
    setRoute(path);
  };

  const renderRoute = () => {
    switch (route) {
      case 'recognition': {
        return <Recognition />;
      }
      case 'confirm': {
        return <Confirm />;
      }
      case 'recognition-result': {
        return <RecognitionResult />;
      }
      default: {
        return <Recognition />;
      }
    }
  };

  const judgeBigScreen = () => {
    // 这里根据返回值 true 或false,返回true的话 则为全面屏
    let result = false;
    const rate = window.screen.height / window.screen.width;
    const limit = window.screen.height === window.screen.availHeight ? 1.8 : 1.65;
    // 临界判断值
    // window.screen.height为屏幕高度
    // window.screen.availHeight 为浏览器 可用高度
    if (rate > limit) {
      result = true;
    }
    return result;
  };

  useEffect(() => {
    const isBigScreen = judgeBigScreen();
    if (isBigScreen) {
      setSafeArea({ top: 33, bottom: 0 });
    }
    //
    return () => {
      close();
    };
  }, []);

  return (
    <RouterContext.Provider value={{ current: route, navigate, query }}>
      <div style={{ paddingTop: safeArea.top, paddingBottom: safeArea.bottom }} className="entry">
        {renderRoute()}
      </div>
    </RouterContext.Provider>
  );
};

export default App;
