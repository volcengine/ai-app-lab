# Multimodal-kit Web API

## 前置准备

使用本文档所述API之前，需在宿主完成SDK接入：
- [Android](../android/README.md)
- [iOS](../ios/README.md)

## 构建项目

### 安装依赖

```bash
pnpm install
```

### 构建 Web SDK 和示例项目

- 不内联 JavaScript 和资源文件，产物由多个文件组成：

```bash
pnpm run build
```

- 内联 JavaScript 和资源文件，产物为单一的 HTML 文件：

```bash
pnpm run build:inlined
```

产物位于每个示例项目目录下的 `dist` 目录中。

## API调用
### 视觉识别 API
包含图片 RT-DETR 物体识别、MobileSAM 物体分割能力，使用时需要接入对应能力的 SDK。

视觉识别 API 系列接口需要提供Image Id进行调用，Image Id需要客户端通过诸如拼接url query等方式传递给前端。

**客户端前置条件**：
- Android
  - 完成如下SDK接入：
```groovy
//视觉识别 JSB
implementation "com.bytedance.ai:multimodalkit-visual-image-tob:${multimodalKitVersion}"
implementation "com.bytedance.ai:multimodalkit-visual-bridge-tob:${multimodalKitVersion}"
```
  - 注册Bridge实现
```kotlin
GlobalMethodSeeker.register(GetImageInfoMethod::class.java)
GlobalMethodSeeker.register(GetObjectDetectionMethod::class.java)
GlobalMethodSeeker.register(GetSAMInfoMethod::class.java)
```
  - 获取Image Id
```kotlin
import com.bytedance.ai.multimodal.visual.vision.BitMapWithPosition
import com.bytedance.ai.multimodal.visual.vision.ImageTaskQueue

//传入bitmap至ImageTaskQueue进行预处理
val imageId = ImageTaskQueue.enqueueBitmap(BitMapWithPosition(bitmap))
//通过url query等方式传递到前端环境
queryMap["image_id"] = imageId
```

- iOS
  - 请先按照多模态 iOS SDK 接入手册（ToB）中的图片物体识别/分割能力，接入对应的模型文件，并注入AIMMLModelLoadService的实现。
  - 注册 Bridge 实现：
```swift
import MultiModalKitToB

AIBridgeMethodManager.shared.register(method: AIMGetObjectDetectListMethod())
AIBridgeMethodManager.shared.register(method: AIMGetSAMInfoMethod())
AIBridgeMethodManager.shared.register(method: AIMGetImageInfoMethod())
```

  - 获取 ImageId
```swift
import MultiModalKitToB

// 使用 CVPixelBuffer 对象获取 imageId
let buffer: CVPixelBuffer
let info = AIMCameraImageInfo(buffer: buffer)
let imageId = AIMCameraImageManager.shared.storeImage(info)

//通过url query等方式传递到前端环境
queryMap["image_id"] = imageId
```
### 获取图片信息及 base64

- **名称**：`getImageInfo`
- **功能**：根据 imageId 获取图片信息和base64用于前端页面展示。
- **接口定义**
```typescript
export declare function getImageInfo(params: {
  imageId: string; // 入参包含 imageId
}): Promise<{ // 返回值为 Promise，包含 base64Image, imageId, location
    base64Image: string; // 图片的base64编码字符串
    imageId: string;     // 图片唯一ID
    location: string;    // 照片拍摄的地理位置(如"广东省XX市XX区XX街道")
                         // 图库图片从 Exif 读取
}>;
```
- **调用示例**
```typescript
import { getImageInfo } from 'multi-modal-sdk';

async function fetchImageInfo(id: string) {
  try {
    const { base64Image, location, imageId } = await getImageInfo({ imageId: id });
    console.log('Image Info:', { imageId, location, base64ImageLength: base64Image.length });
    // 可以使用 base64Image 显示图片或进行其他处理
  } catch (error) {
    console.error('Failed to get image info:', error);
  }
}

// 假设已经通过 url query等方式获取了 imageId 'some-image-id'
fetchImageInfo('your-image-id');
```
---

### 物体识别

- **名称**：`getObjectDetectList`
- **功能**：获取图片中的物体识别检测信息，一般为 COCO 数据集结果。
- **接口定义**:
```typescript
export declare function getObjectDetectList(params: {
  imageId: string; // 入参包含 imageId
}): Promise<{ // 返回值为 Promise，包含检测到的物体列表
    detectedObjects: Array<{
      centerX: number; // 物体中心点X坐标(px)
      centerY: number; // 物体中心点Y坐标(px)
      width: number;  // 物体宽度(px)
      height: number; // 物体高度(px)
      name: string;   // 识别出的物体类别/名称，一般是coco数据集的类别
    }>;
  }>;
```
- **调用示例**
```typescript
import { getObjectDetectList } from 'multi-modal-sdk';

async function detectObjects(id: string) {
  try {
    const { detectedObjects } = await getObjectDetectList({ imageId: id });
    console.log('Detected Objects:', detectedObjects);
    if (detectedObjects.length > 0) {
      console.log('First object:', detectedObjects[0].name, 'at', detectedObjects[0].centerX, detectedObjects[0].centerY);
    }
  } catch (error) {
    console.error('Failed to detect objects:', error);
  }
}

// 假设已经通过 url query等方式获取了 imageId 'some-image-id'
detectObjects('your-image-id');
```

---

### 物体分割

- **名称**：`getSAMInfo`
- **功能**：输入用户点击或者选择的区域，获取物体的 Segment 分割信息。可以结合画板，实现物体的圈选和点选逻辑。
- **接口定义**：
```typescript
export declare function getSAMInfo(params: {
    // 入参
    imageId: string; // 图片唯一ID
    points?: Array<{ // 可选，分割点坐标数组 (points 和 rectangles 二选一)
      x: number;   // 相对于图片左上角的X坐标(px)
      y: number;   // 相对于图片左上角的Y坐标(px)
      label: 0 | 1; // 0 表示排除点 (exclude), 1 表示包含点 (include), 默认为 1
    }>;
    rectangles?: Array<{ // 可选，分割矩形区域数组 (points 和 rectangles 二选一)
      top: number;    // 矩形上边界坐标
      left: number;   // 矩形左边界坐标
      right: number;  // 矩形右边界坐标
      bottom: number; // 矩形下边界坐标
    }>;
    contourTopN?: number; // 可选，获取面积前 N 大的闭合轮廓，用于过滤杂乱小轮廓
}): Promise<{ // 返回值为 Promise，包含分割结果
    maskContour: number[][][]; // 三维数组，表示分割出的物体轮廓点列表 (格式为 [[ [y1, x1], [y2, x2], ... ], ...])，可直接用于绘制轮廓
    segId: string;             // 当前分割物体的唯一ID
  }>;
```
- **调用示例**
```typescript
import { getSAMInfo } from 'multi-modal-sdk';

async function segmentObjectByPoint(id: string) {
  try {
    const { maskContour, segId } = await getSAMInfo({
      imageId: id,
      points: [{ x: 150, y: 200, label: 1 }] // 在 (150, 200) 位置指定一个包含点
    });
    console.log('Segmentation Info (by point):', { segId, contourPointsCount: maskContour[0]?.length });
    // 可以使用 maskContour 绘制分割区域
  } catch (error) {
    console.error('Failed to get SAM info by point:', error);
  }
}

async function segmentObjectByRect(id: string) {
  try {
    const { maskContour, segId } = await getSAMInfo({
      imageId: id,
      rectangles: [{ top: 50, left: 50, right: 250, bottom: 350 }] // 指定一个矩形区域
    });
    console.log('Segmentation Info (by rect):', { segId, contourPointsCount: maskContour[0]?.length });
  } catch (error) {
    console.error('Failed to get SAM info by rectangle:', error);
  }
}

// 假设已经通过 url query等方式获取了 imageId 'some-image-id'
segmentObjectByPoint('some-image-id');
segmentObjectByRect('some-image-id');
```

---

## ASR / TTS API

包含火山引擎文本转语音（TTS）、流式/非流式语音转文本（ASR）的前端接口封装。

### 客户端前置条件

- **Android**
  - 完成如下SDK接入
    ```groovy
    //tts能力对应JSB
    implementation "com.bytedance.ai:multimodalkit-tts-bridge-tob:${multimodalKitVersion}"
    //asr能力对应JSB
    implementation "com.bytedance.ai:multimodalkit-asr-bridge-tob:${multimodalKitVersion}"
    ```
  - 注册Bridge实现
    ```java
    //asr tts
    GlobalMethodSeeker.register(MultiModalStartTTSMethod.class);
    GlobalMethodSeeker.register(MultiModalCancelTTSMethod.class);
    GlobalMethodSeeker.register(MultiModalStartASRMethod.class);
    GlobalMethodSeeker.register(MultiModalStopASRMethod.class);
    GlobalMethodSeeker.register(MultiModalCreateStreamingTTSMethod.class);
    GlobalMethodSeeker.register(MultiModalAppendStreamingTTSMethod.class);
    GlobalMethodSeeker.register(MultiModalCancelStreamingTTSMethod.class);
    ```

- **iOS**
  - 请先按照多模态 iOS SDK 接入手册（ToB），注册火山语音 Token，并实现语音能力鉴权委托。
  - 注册 Bridge 实现：
    ```swift
    import MultiModalKitToB

    AIBridgeMethodManager.shared.register(method: AIMultiModalStartTTSMethod())
    AIBridgeMethodManager.shared.register(method: AIMultiModalCancelTTSMethod())
    AIBridgeMethodManager.shared.register(method: AIMultiModalCreateStreamingTTSMethod())
    AIBridgeMethodManager.shared.register(method: AIMultiModalAppendStreamingTTSMethod())
    AIBridgeMethodManager.shared.register(method: AIMultiModalCancelStreamingTTSMethod())
            
    AIBridgeMethodManager.shared.register(method: AIMStartASRMethod())
    AIBridgeMethodManager.shared.register(method: AIMStopASRMethod())
    ```

### 开始TTS任务 `startTTS`

- **名称**：`startTTS`
- **功能**：发起文本转语音任务
- **接口定义**:
```typescript
export declare function startTTS(params: {
  text: string;
  config?: {
    speaker?: string;
  };
}): Promise<object>;
```
- **调用示例**:
```typescript
import { startTTS } from 'multi-modal-sdk';

// 默认参数调用
startTTS({ text: '妖怪，休走，吃俺老孙一棒！' });

// 自定义 speaker
startTTS({
  text: '妖怪，休走，吃俺老孙一棒！',
  config: {
    speaker: "zh_female_qingxin"//音色speaker需提前在火山平台完成开通
  }
});
```

---

### 取消TTS任务 `cancelTTS`

- **名称**：`cancelTTS`
- **功能**：停止语音播报
- **接口定义**:
```typescript
export declare function cancelTTS(): Promise<object>;
```
- **调用示例**:
```typescript
import { cancelTTS } from 'multi-modal-sdk';

cancelTTS();
```

---

### 创建流式TTS任务 `createStreamingTTS`

- **名称**：`createStreamingTTS`
- **功能**：创建一次流式文字转语音任务，获得对应流式id
- **接口定义**:
```typescript
export declare function createStreamingTTS(params?: {
    speaker?: string;     // 默认值 开朗姐姐 "zh_female_kailangjiejie_moon_bigtts"
}): Promise<{
    streamingId: string; // 流式id
}>;
```
- **调用示例**:
```typescript
 import { createStreamingTTS } from 'multi-modal-sdk';
 const retval = await createStreamingTTS({});
 const currentSessionId = retval.streamingId;//获取当前的sessionId
```

---

### 添加TTS文本 `appendStreamingTTS`

- **名称**：`appendStreamingTTS`
- **功能**：往流式文字转语音的任务里面添加新文本以播报
- **接口定义**:
```typescript
export declare function appendStreamingTTS(params: {
    streamingId: string;
    newText: string;         // 只传输增量字符
    isFinish: boolean;
}): Promise<object>;
```
- **调用示例**:
```typescript
 import { appendStreamingTTS } from 'multi-modal-sdk';
appendStreamingTTS({
  streamingId: currentSessionId,
  newText: plainText,
  isFinish: finishReason === 'stop'
});
```

---

### 取消流式TTS `cancelStreamingTTS`

- **名称**：`cancelStreamingTTS`
- **功能**：取消流式文字转语音任务
- **接口定义**:
```typescript
export declare function cancelStreamingTTS(params: {
    streamingId: string;
}): Promise<object>;
```
- **调用示例**:
```typescript
 import { cancelStreamingTTS } from 'multi-modal-sdk';
cancelStreamingTTS({
  streamingId: currentSessionId,
});
```

---

### 开始ASR识别 `startASR`

- **名称**：`startASR`
- **功能**：开始语音转文字任务
- **接口定义**:
```typescript
export declare function startASR(): Promise<object>;
```
- **调用示例**:
```typescript
import { startASR } from 'multi-modal-sdk';

await startASR();
```

---

### 结束ASR识别 `stopASR`

- **名称**：`stopASR`
- **功能**：结束 ASR 识别
- **接口定义**:
```typescript
export declare function stopASR(): Promise<object>;
```
- **调用示例**:
```typescript
import { stopASR } from 'multi-modal-sdk';

stopASR();
```

---

### ASR回调事件 `ASRResult`

- **名称**：`onASRResult`
- **功能**：监听语音转文字回调事件
- **接口定义**:
```typescript
// 监听事件，传入处理事件的回调
export declare function onASRResult(handler: (params: {
  text: string;
  isFinished?: boolean;
}) => void): () => void; // 返回解除监听的函数
```
- **调用示例**:
```typescript
import { onASRResult } from 'multi-modal-sdk';

// 监听 ASR 流式结果
onASRResult(({ text }) => {
  // ASR Result: 我
  // ASR Result: 我的
  // ASR Result: 我的朋友
  // ASR Result: 我的朋友叫小鸣
  console.log('ASR Result: ', text);
});

// 监听 ASR 整段识别结果
onASRResult(({ text, isFinished }) => {
  if (isFinished) {
    // ASR Result: 我的朋友叫小鸣
    console.log('ASR Result', text);
  }
});
```

---

## 视觉大模型 VLM API

包含简易流式/非流式的视觉大模型的前端接口封装。

### 客户端前置条件

- **Android**
  - 完成如下SDK接入
    ```groovy
    //大模型交互JSB
    implementation "com.bytedance.ai:multimodalkit-vlm-bridge-tob:${multimodalKitVersion}"
    ```
  - 注册Bridge实现
    ```java
    //vlm
    GlobalMethodSeeker.register(ChatCompletionMethod.class);
    GlobalMethodSeeker.register(CancelChatCompletionStreamingMethod.class);
    GlobalMethodSeeker.register(RequestChatCompletionStreamingMethod.class);
    GlobalMethodSeeker.register(ReadChatCompletionStreamingMethod.class);
    ```
- **iOS**
  - 请先按照多模态 iOS SDK 接入手册（ToB），注册火山方舟模型 Token，并配置全局实例。
  - 注册 Bridge 实现：
    ```swift
    import MultiModalKitToB

    AIBridgeMethodManager.shared.register(method: AIMChatRequestMethod())
    AIBridgeMethodManager.shared.register(method: AIMChatStreamRequestMethod())
    AIBridgeMethodManager.shared.register(method: AIMChatStreamCancelMethod())
    AIBridgeMethodManager.shared.register(method: AIMChatStreamReadMethod())
    ```

### 单次对话 `chatCompletion`

- **名称**：`chatCompletion`
- **功能**：调用客户端封装好的 VLM 模型进行对话，非流式返回。
- **注意**：传入base64图片的时候，需要按照OpenAI标准，携带`data:image/jpeg;base64,`前缀。
- **接口定义**:
```typescript
export declare function chatCompletion(params: {
    base64Image: string; // 传入base64图片的时候，需要按照openai标准，携带"data:image/jpeg;base64,"前缀
    query: string;
    prompt?: string;
}): Promise<{
    answer: string;
  }>;
```
- **调用示例**
```typescript
import { chatCompletion } from 'multi-modal-sdk';

const {answer} = await chatCompletion({
    base64Image: image, // 传入base64图片的时候，需要按照openai标准，携带"data:image/jpeg;base64,"前缀
    query: query,
    prompt: prompt
});
```

---

### 发起单次流式对话 `chatCompletionStreaming`

- **名称**：`chatCompletionStreaming`
- **功能**：创建一个调用客户端封装好的 VLM 模型进行对话的请求，获得streamingId，流式返回。
- **注意**：传入base64图片的时候，需要按照OpenAI标准，携带`data:image/jpeg;base64,`前缀。
- **接口定义**:
```typescript
export declare function chatCompletionStreaming(params: {
    base64Image: string; // 传入base64图片的时候，需要按照openai标准，携带"data:image/jpeg;base64,"前缀
    query: string;
    prompt?: string;
}): Promise<{
    streamingId: string;
  }>;
```
- **调用示例**
```typescript
import { chatCompletionStreaming } from 'multi-modal-sdk';
const {streamingId} = await chatCompletionStreaming({
    base64Image: image,//传入base64图片的时候，需要按照openai标准，携带"data:image/jpeg;base64,"前缀
    query: query,
    prompt: prompt
})
```

---

### 读取单次流式对话 `readCompletionStreaming`

- **名称**：`readCompletionStreaming`
- **功能**：根据streamingId获得对应的模型返回。
- **接口定义**:
```typescript
export declare function readCompletionStreaming(params: {
    streamingId: string;
}): Promise<{
    newText: string;
    isFinished: boolean;
  }>;
```
- **调用示例**
```typescript
import { readCompletionStreaming } from 'multi-modal-sdk';

let tmp = false;
let content = '';
while (!tmp) {
    const {newText, isFinished} = await readCompletionStreaming({
        streamingId: streamingId
    });
    tmp = isFinished;
    content = `${content}${newText}`;
}
```

---

### 取消单次流式对话 `cancelCompletionStreaming`

- **名称**：`cancelCompletionStreaming`
- **功能**：取消当前的流式请求。
- **接口定义**:
```typescript
export declare function cancelCompletionStreaming(params: {
  streamingId: string;
}): Promise<object>;
```
- **调用示例**
```typescript
import { cancelCompletionStreaming } from 'multi-modal-sdk';
cancelCompletionStreaming({
    streamingId: streamingId
})
```