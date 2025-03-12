# 教师分身  Teacher Avatar
## 应用介绍

基于豆包视觉理解与DeepSeek深度推理双引擎驱动的教育解决方案，创新性实现多模态教学场景覆盖。通过视觉理解技术，精准提取题目文本与公式图形，结合DeepSeek进行逻辑推演，提供「即拍即解-批量批改-实时互动」三维一体的智能辅导体验。支持单题深度解析、多题智能批阅及视频流实时解题，突破传统教育工具时空限制，为教师减负增效，打造24小时在线的个性化学习伙伴。

### 效果预览


[视频地址](https://lf3-static.bytednsdoc.com/obj/eden-cn/lm_sth/ljhwZthlaukjlkulzlp/ark/assistant/videos/20250311-163309.mp4)
### 直接体验

![](0.png)

### 流程架构


![](1.png)


**极简开发的场景化赋能**
提供多模态（拍照和视频），标准化的（拍题-切题-解题）教育产品核心链路，并且支持主体识别，分割，圈选，流式加载，多题展示等产品能力，企业和开发者只要结合自身业务场景做定向改造，即可快速搭建教育应用。

<br/>

**双引擎技术重构解题逻辑** 区别于传统题库的检索模式，深度融合豆包视觉模型的图像理解能力与DeepSeek深度推理引擎，实现「视觉解析-逻辑推演-步骤生成」的全新解题和批改链路。

<br/>

**视频流解题开启教学新模态** 借助豆包视频大模型的视频实时理解技术，首创教育行业实时视频拍照解题，依据画面关键信息 ，为使用者提供精准的题目识别和答案解析，为探索更多【视频教育场景】提供技术支持。

## 关联模型及云产品

### 模型

| 相关服务 | 描述 | 计费说明 |
| --- | --- | --- |
| [Doubao-流式语音识别](https://console.volcengine.com/ark/region:ark+cn-beijing/model/detail?Id=seedasr-streaming) | 将用户的语音提问转写为文本，以便于视觉大模型对用户问题的理解与回复。 | [多种计费方式](https://www.volcengine.com/docs/82379/1099320) |
| [Doubao-1.5-vision-pro-32k](https://console.volcengine.com/ark/region:ark+cn-beijing/model/detail?Id=doubao-1-5-vision-pro-32k) | 负责对题目内容进行视觉理解，并输出题目内容 | [多种计费方式](https://www.volcengine.com/docs/82379/1099320) 
| [DeepSeek-R1](https://console.volcengine.com/ark/region:ark+cn-beijing/model/detail?Id=deepseek-r1) | 负责对题目进行深度思考和AI解析，并生成答案。 | [多种计费方式](https://www.volcengine.com/docs/82379/1099320) |
| [Doubao-语音合成](https://console.volcengine.com/ark/region:ark+cn-beijing/model/detail?Id=ve-tts) | 负责将模型生成的文本回答转化为自然流畅的语音输出。 | [多种计费方式](https://www.volcengine.com/docs/82379/1099320) |\



# 技术实现


教师分身应用包括 Android 客户端和 Web 前端两部分：

- Android 端主要提供 Web 页面容器、题目分割、语音合成、语音识别等能力
	
- Web 前端主要提供识别题目的UI交互页面以及与大模型交互的题目解析页面等
	

<br>

本项目开源了教师分身应用中的 Web 前端代码。Web 前端基于 React 技术栈实现，负责处理大模型对话（文本+图片）、大模型流式输出、用户语音输入等模块。开发者可参考此工程的大模型接口调用、会话管理等逻辑，将其方便地移植到其他前端工程，提高开发效率。
<br>

备注：由于本项目运行依赖部分内部实现，此开源工程暂时无法整体编译运行。

### 核心模块

```Shell
├── src
│   ├── api                             
│   │   ├── bridge.ts                   # 原生 API 桥接层
│   │   └── llm.ts                      # LLM 对话实现
│   ├── pages
│   │   └── entry                       # webview 总入口
│   │       ├── components
│   │       ├── context                 # 全局状态管理
│   │       ├── index.css
│   │       ├── index.tsx
│   │       ├── routes                  # 组件级页面路由
│   │       │   ├── confirm            # 确认页面
│   │       │   ├── recognition        # 识别中页面
│   │       │   └── recognition-result # 题目解析页面
│   │       └── utils.ts
```

## 对话实现

1. 请求 Bot 接口：
	

```TypeScript
import { appletRequest, StreamEvent } from '@ai-app/bridge-api';

static BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
static TEACHER_MODEL = 'bot-xxx';
static TEACHER_APIKEY = 'xxx';
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

## UI交互设计实现

1. 单 webview 入口
	

实现类似 SPA 的体验，将所有页面以组件的方式实现。通过全局状态管理实现路由的跳转以及参数的传递

```typescript
import { useEffect, useState } from 'react';

import { definePage } from '@ai-app/agent';
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
    id: 'recognition',
    description: '识别页面'
  },

  render(props) {
    return <App />;
  }
});
```

2. 消息渲染实现
	1. 语音识别用户消息
		
		```JavaScript
		import { startASR, onASRResult, stopASR } from '@ai-app/multimodal-api';
		
		const App = () => {
		  const asrText = useRef('');
		  
		  useEffect(()=>{
		    onASRResult(({ text }) => {
		      asrText.current = text;
		    })
		  },[]);
		  
		  return (
		    <div
		      onTouchStart={()=>{
		        startASR({
		          vadEnable: true,
		        })
		      }}
		      onTouchEnd={()=>{
		         stopASR()
		         // handle send user message
		      }}
		    >
		      按住说话
		    </div>
		  )
		}
		```
		
	2. bot消息，流式输出，负责渲染思考链以及文本消息样式
		
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
		        if(json.choice[0].finish_reason) return;
		        // handle content
		        const content = choice.delta.content;
		        const reasoning = choice.delta.reasoning_content;
		        content && updateContent(content)
		        reasoning && updateReasoning(reasoning)
		    } else if (e.event === 'complete') {
		     // handle complete    
		    } else if (event.event === 'error') {
		     // handle error
		    }
		  }
		
		  render(){
		    return(
		      <>
		        <MdBox markDown={content} />
		        <MdBox markDown={reasoning} />
		      </>
		  }
		}
		```
		

## 目录结构
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
│   │       │   ├── confirm            # 确认页面
│   │       │   ├── recognition        # 识别中页面
│   │       │   └── recognition-result # 题目解析页面
│   │       └── utils.ts
│   └── types
│       └── index.ts
├── tailwind.config.js                   # tailwind 配置
└── tsconfig.json
```