## 环境准备

1. 请参阅 [TTSASRInitializer](teacher/src/main/java/com/bytedance/ai/multimodal/teacher/init/TTSASRInitializer.kt)、[VLMInitializer](teacher/src/main/java/com/bytedance/ai/multimodal/teacher/init/VLMInitializer.kt)、[DefaultConfig](teacher/src/main/java/com/bytedance/ai/multimodal/teacher/init/DefaultConfig.kt) 完成配置。
2. 需要使用 jdk11 进行编译。

## 注意事项

1. 目前Android工程内默认不携带前端产物，详见教师分身前端工程的[README.md](../frontend/README.md)完成编译，完成编译后前端产物`dist/index.html`需要复制到 [assets](teacher/src/main/assets) 目录下。
2. 购物助手前端页面URL定义在`com.bytedance.ai.multimodal.teacher.PreferenceUtils#DEFAULT_MULTIMODAL_WEB_URL`，可按需进行修改。
3. 图片按题目切分（题目分割）的功能未实现，需参考`com.bytedance.ai.multimodal.teacher.bridge.GetQuestionSegmentListMethod`自行实现。
4. 本工程使用了多模态SDK，关于多模态SDK的使用请参考`demohouse/multimodalkit_example`内的README.md进行了解。