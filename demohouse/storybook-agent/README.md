
# 故事书生成 Agent

## 应用介绍

StoryBook Agent 主要面向 **AI 应用开发者、内容创作者、设计师、AIGC 产品团队**，帮助他们：

- 在无需复杂前端/后端开发的情况下 **快速复用成熟模板能力**
- 用标准化结构生成"多图故事书""连环漫画""分屏预览图集"等内容
- 支持多图上传参考、可选分辨率、可选比例、沉浸式预览等能力
- 快速创建具备「可编辑、可预览、可下载」特性的视觉生成类应用

其核心价值在于：**降低 AI 图像应用的搭建门槛、提供可复用 UI 模板、帮助开发者快速产出可商用级别的故事书/连环画生成体验。**

## 效果预览

### 演示视频

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/lm_sth/ljhwZthlaukjlkulzlp/ark/assistant/storybook_experience_video.mp4" style="width: 100%;" controls></video>

### 直接体验

[AI 体验中心](https://www.volcengine.com/experience/ark?launch=seedream)


## 架构图

![架构图](https://lf3-static.bytednsdoc.com/obj/eden-cn/lm_sth/ljhwZthlaukjlkulzlp/ark/assistant/storybook_framework.jpg)

### 优势说明

- **模板开箱可用**：无需重新设计 UI，直接拥有可商用的故事书/连环画生成体验
- **多图参考增强可控性**：支持多图上传提高生成质量与角色一致性
- **结构化输出**：故事书卡片、多页漫画分镜均为标准化输出格式
- **友好预览体验**：包含分屏、沉浸式等多种观看模式
- **可扩展性强**：可自由替换模型、扩展参数、加入自定义工作流
- **支持二次开发**：前端与后端均采用模块化设计，可快速改造成任意行业模板（教育、文旅、IP 创作、电商等）

## 关联模型及云产品

### 模型

| 相关服务 | 描述 | 计费说明 |
| :--- | :--- | :--- |
| [Seedream 4.0 图像生成模型](https://console.volcengine.com/ark/region:ark+cn-beijing/model/detail?Id=doubao-seedream-4-0) | 故事书、连环画的核心生成能力；负责多图生成、风格生成、内容一致性 | 按调用计费；0.2元/张 |
| [Doubao Seed 1.6 深度思考模型](https://console.volcengine.com/ark/region:ark+cn-beijing/model/detail?Id=doubao-seed-1-6) | 根据用户描述和参考图，生成故事计划（标题、摘要、分镜、场景描述）| [多种计费方式] |

## 云服务

| 相关服务 | 描述 | 计费说明 |
| :--- | :--- | :--- |
| 模型推理 API（Responses / Image Generation） | 负责向模型发送生成请求并返回图片 | 按 Token 或按调用计费（根据具体模型服务） |
| TOS（可选） | 若需托管生成图片、提供下载链接，可使用对象存储 | 存储计费 + 流量计费 |
| 其他方舟能力（可选） | 如需扩展文本生成故事内容，可使用 Doubao 文本模型 | 按 Token 计费 |

## 环境准备

### 后端环境

- Python 3.8+
- pip 20.0+

### 前端环境

- Node.js 22+（推荐使用项目中指定的版本，见 `frontend/.nvmrc`）
- pnpm 9+ 包管理器

### 方舟服务

- 开通 Seed 1.6 和 Seedream 4.0 模型服务（[开通模型服务](https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement?LLM=%7B%7D&OpenTokenDrawer=false)）
- 在[模型列表](https://www.volcengine.com/docs/82379/1330310)获取所需 Model ID
  - 通过 Endpoint ID 调用模型服务请参考[获取 Endpoint ID（创建自定义推理接入点）](https://www.volcengine.com/docs/82379/1099522)
- [获取火山方舟 API KEY](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey)

## 快速入门

### 下载代码

```bash
git clone https://github.com/volcengine/ai-app-lab.git
cd demohouse/storybook-agent
```

### 安装依赖

推荐使用 Python 虚拟环境隔离项目依赖：

```bash
# 创建并激活虚拟环境
python3 -m venv venv
source venv/bin/activate  # macOS/Linux
# venv\Scripts\activate  # Windows

# 安装项目依赖
pip install -r requirements.txt
```

### 配置环境变量

复制并配置环境变量文件：

```bash
cp .env.example .env
```

在`.env`文件中设置你的火山方舟 API 密钥：

```env
ARK_API_KEY=your_ark_api_key
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
```

### 启动服务

```bash
python main.py
```

### 启动前端

前端代码位于 `frontend` 目录，启动步骤如下：

```bash
# 进入前端目录
cd frontend

# 安装依赖
pnpm install

# 启动前端服务
pnpm dev
```

前端服务启动后，可通过浏览器访问前端应用。(本地可用测试 UserToken 为 demo_user_token)

## API接口说明

### 故事书生成接口

**路径**: `/api/storybook/generate`
**方法**: `POST`
**请求体**:

```json
{
  "query": "创作一个关于独居插画师与退休老船长在海滨旧书店相遇，互相治愈、重拾生活热忱的暖心故事",
  "reference_images": [],
  "mode": "storybook",
  "size": "2048x2048"
}
```

**参数说明**:

- `query`: 故事主题或提示（必填）
- `reference_images`: 参考图片列表，支持提供参考图片来影响风格，默认为空列表
- `mode`: 生成模式，影响返回数据格式，可选值包括"storybook"和"comics"
- `size`: 生成图片的尺寸，格式为widthxheight，默认"2048x2048"

**响应**:

```json
{
  "status": "success",
  "data": {
    "Title": "旧书页里的星光航线",
    "Summary": "独居插画师在海滨小城的旧书店邂逅退休老船长，两人交换人生故事与心底心事，在彼此的陪伴与启发中，重新找回对创作和生活的热忱",
    "Items": [
      {
        "Url": "https://example.com/images/story_cover.jpg",
        "Text": "",
        "IsCover": true
      },
      {
        "Url": "https://example.com/images/story_page1.jpg",
        "Text": "梅雨连绵的海滨小城，插画师林知夏抱着画夹躲进街边的旧书店，木质书架上裹着海风气息的纸墨香，让烦躁的她瞬间安静下来。",
        "IsCover": false
      },
      ...
    ],
    "Mode": "storybook"
  }
}
```

> 注：实际响应中会包含更多的图片条目，每个条目都有完整的图片URL和对应的故事文本。示例中的URL使用example.com域名，实际系统会返回指向真实图片存储服务的URL。

### 故事书流式生成接口

**路径**: `/api/storybook/generate_stream`
**方法**: `POST`
**请求体**:

```json
{
  "query": "编写一个关于太空探索的儿童故事",
  "reference_images": [],
  "mode": "storybook",
  "size": "2048x2048"
}
```

**参数说明**:

- `query`: 故事主题或提示（必填）
- `reference_images`: 参考图片列表，支持提供参考图片来影响风格，默认为空列表
- `mode`: 生成模式，影响返回数据格式，可选值包括"storybook"和"comics"
- `size`: 生成图片的尺寸，格式为widthxheight，默认"2048x2048"

**响应**:

响应为 Server-Sent Events (SSE) 流，内容类型为`text/event-stream`，事件类型为`image-generation`，包含以下状态事件：

1. **开始事件**

```
event: image-generation
data: {"status": "start"}
```

2. **计划事件**

```
event: image-generation
data: {"status": "plan", "Title": "故事标题", "Summary": "故事摘要"}
```

3. **内容事件**（重复发送，每次包含一个图片项）

```
event: image-generation
data: {"status": "content", "Items": [{"Url": "https://example.com/images/image.jpg", "Text": "故事文本", "IsCover": false}]}
```

4. **结束事件**

```
event: image-generation
data: {"status": "end"}
```

> 注：流式接口的主要特点是实时返回生成结果，客户端可以边接收边展示内容，提升用户体验。

## 生产环境建议

- 建议使用环境变量或密钥管理服务管理敏感信息，特别是`ARK_API_KEY`
- 根据实际使用情况，考虑添加 API 限流等安全措施
- 注意：当前项目使用简单的`X-User-Token`头进行 API 鉴权，仅适用于开发和测试环境。**正式生产环境建议采用更可靠的鉴权方式，如 JWT、OAuth2.0 或 API 密钥管理系统，以确保 API 安全。**
