# 电商购物SnapShop ReadMe

## 应用介绍

本应用深度整合视觉理解、图像向量化、物品识别、语音识别以及语音合成等大模型能力，旨在重塑电商购物流程。用户仅需拍照或在实时视频场景下操作，就能触发物品识别，快速获取相关商品推荐，享受便捷、高效且有趣的智能购物新体验。

### 直接体验

您可以通过访问[火山方舟控制台](https://console.volcengine.com/ark/region:ark+cn-beijing/application/detail?id=bot-20250313161133-ggqlb&prev=application&projectName=default)在线体验。

### 流程架构

应用的流程架构如下所示。

![](assets/0.png)

## 关联模型及云产品

### 相关模型

| 相关服务                                                     | 描述                                                         | 计费说明                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ |
| [Doubao-流式语音识别](https://console.volcengine.com/ark/region:ark+cn-beijing/model/detail?Id=seedasr-streaming) | 将用户的语音提问转写为文本，以便于视觉大模型对用户问题的理解与回复。 | [多种计费方式](https://www.volcengine.com/docs/82379/1099320) |
| [Doubao-1.5-vision-pro-32k](https://console.volcengine.com/ark/region:ark+cn-beijing/model/detail?Id=doubao-1-5-vision-pro-32k) | 负责对商品进行视觉理解，并输出商品类型。                     | [多种计费方式](https://www.volcengine.com/docs/82379/1099320) |
| [Doubao-embedding-vision-241215](https://console.volcengine.com/ark/region:ark+cn-beijing/model/detail?Id=doubao-embedding-vision) | 进行商品图的向量化，方便召回商品。                           | [多种计费方式](https://www.volcengine.com/docs/82379/1099320) |
| [Doubao-语音合成](https://console.volcengine.com/ark/region:ark+cn-beijing/model/detail?Id=ve-tts) | 负责将模型生成的文本回答转化为自然流畅的语音输出。           | [多种计费方式](https://www.volcengine.com/docs/82379/1099320) |


## 技术实现

本电商购物应用主要由 Android 客户端和 Web 前端两部分构成：

- **Android 端**：为用户提供移动设备上的购物支持，不仅集成了 Web 页面容器，还整合了物品识别、语音识别、语音合成等核心能力。
- **Web 前端**：负责搭建识别物体的 UI 交互页面，实现与大模型的物品识别交互。

本项目开源了电商购物应用中的 Web 前端代码。Web 前端基于 React 技术栈实现，涵盖了处理大模型对话（包括文本和图片）、大模型流式输出等重要模块。开发者可以参考本工程中的大模型接口调用、会话管理等逻辑，方便地将其移植到其他前端工程中，从而显著提高开发效率。

**注意：由于本项目的运行依赖部分内部实现，因此此开源工程暂时无法进行整体编译运行。**

### 核心模块

本项目的核心模块结构如下：

```Shell
├── src
│   ├── api                             
│   │   ├── bridge.ts                   # 原生 API 桥接层
│   │   └── llm.ts                      # LLM 对话实现
│   ├── pages
│   │   └── entry                       # webview 总入口
│   │       ├── context                 # 全局状态管理
│   │       ├── index.css
│   │       ├── index.tsx
│   │       ├── routes                  # 组件级页面路由
│   │       │   ├── recognition        # 识别中页面
│   │       └── utils.ts
```

### 对话实现

以下是请求 Bot 接口的代码示例，展示了如何与大模型进行交互：

```TypeScript
import { appletRequest, StreamEvent } from '@ai-app/bridge-api';

// 定义接口的基础 URL、使用的Bot ID以及 API Key
static BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
static MODEL = 'bot-xxx';
static APIKEY = 'xxx';
static image_url = 'data:image/jpeg;base64,***' // 或图片url链接

const handle = await appletRequest({
  url: `${this.BASE_URL}/bots/chat/completions`,
  method: 'POST',
  header: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${this.TEACHER_APIKEY}`,
    Accept: 'text/event-stream'
  },
  body: {
    model: this.TEACHER_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: this.image_url
            }
          }
        ]
      }
    ],
    stream: true
  },
  addCommonParams: false,
  streamType: 'sse'
});
```

### UI交互设计实现

1. **单 webview 入口**：本应用采用单 webview 入口的设计，实现了类似单页应用（SPA）的体验。将所有页面以组件的方式进行实现，并通过全局状态管理来实现路由的跳转以及参数的传递，确保用户在不同页面之间的切换流畅自然。以下是相关代码示例：

```typescript
import { useEffect, useState } from 'react';

import { definePage } from '@ai-app/agent';
import Recognition from './routes/recognition';
import Confirm from './routes/confirm';
import { RouterContext } from './context/routerContext/context';

import './index.css';
import { RecognitionResult } from 'src/pages/entry/routes/recognition-result';

const App = () => {
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

  return (
    <RouterContext.Provider>
      <div style={{ paddingTop: safeArea.top, paddingBottom: safeArea.bottom }} className="entry">
        {renderRoute()}
      </div>
    </RouterContext.Provider>
  );
};

export default definePage({
  aiMeta: {
    id: 'recognition',
    description: '识别页面'
  },

  render(props) {
    return <App />;
  }
});
```

2. **消息渲染实现**：对于 bot 消息，采用流式输出的方式，负责渲染思考链以及文本消息样式，具体实现代码如下：

```TypeScript
import { MdBox } from '@flow-web/md-box';

const APP = () => {
  const handle = await appletRequest({...})
  handle.on(e: StreamEvent){
    if(e.event === 'data'){
        // handle Done
        const text = e.data.replace(/^data:\s*/, '').trim();
        if(text ==='[DONE]') return;
        // handle finish reason        
        const json = JSON.parse(text);
        // handle tool
        const tool_details = json?.bot_usage?.action_details[0]?.tool_details;
        tool_details && updateData(tool_details)
    } else if (e.event === 'complete') {
     // handle complete    
    } else if (event.event === 'error') {
     // handle error
    }
  }

  render(){
    return renderToolResult();
  }
}
```

## 目录结构

项目的目录结构如下：

```Bash
.
├── applet.config.ts
├── package.json                          # 项目依赖包管理
├── pnpm-lock.yaml
├── postcss.config.cjs
├── src
│   ├── api                             
│   │   ├── bridge.ts                   # 原生 API 桥接层
│   │   └── llm.ts                      # LLM 对话实现
│   ├── app.ts
│   ├── components
│   ├── images
│   ├── pages
│   │   └── entry                       # webview 总入口
│   │       ├── components
│   │       ├── context                 # 全局状态管理
│   │       ├── index.css
│   │       ├── index.tsx
│   │       ├── routes                  # 组件级页面路由
│   │       │   ├── recognition        # 识别结果页面
│   │       └── utils.ts
│   └── types
│       └── index.ts
├── tailwind.config.js                   # tailwind 配置
└── tsconfig.json
```