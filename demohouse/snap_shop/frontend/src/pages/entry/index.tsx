/* eslint-disable @typescript-eslint/no-empty-function */
import { useEffect, useState } from 'react';
import { close } from '@ai-app/bridge-api/procode';
import { definePage } from '@ai-app/agent';

import './index.css';
import { RouterContext } from './context/routerContext/context';
import Recognition from './routes/recognition';

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

export default definePage({
  aiMeta: {
    id: 'shopping',
    description: '主入口'
  },

  render(props) {
    return <App />;
  }
});
