# 教师分身 web project

本前端工程需与Android工程配合使用，无法独立运行，Android工程代码可在 `demohouse/teacher_avatar/android` 目录下找到。

## 前置准备

1. 运行本工程前，需先申请火山LLM相关模型API，获得模型名称和API Key。
2. 本工程目录下创建 `.env` 文件，填写模型名称和API Key，内容如下：

```
VLM_MODEL=your_vlm_model
TEACHER_MODEL=your_teacher_model
TEACHER_APIKEY=your_teacher_apikey
DEEP_SEEK_MODEL=deepseek_model
```

具体引用可在 `src/api/llm.ts` 中找到。

## 嵌入到Android工程

本工程可通过执行编译后，得到完整html产物(dist/index.html)，复制并内置到Android工程内（android/teacher/src/main/assets）内作为内嵌资源。
亦或是发布为线上固定站点，并修改Android代码(`com.bytedance.ai.multimodal.teacher.PreferenceUtils.DEFAULT_MULTIMODAL_WEB_URL`)为站点地址，最后编译Android工程进行测试。

## 安装依赖

通过下面的命令行完成依赖安装

```bash
pnpm install
```

## 开发 & 编译

启动开发服务器：

```bash
pnpm dev
```

构建应用 Html 产物，产物输出在dist目录下：

```bash
pnpm build
```

本地预览产物：

```bash
pnpm preview
```