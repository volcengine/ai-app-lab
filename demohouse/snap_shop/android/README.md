## 运行示例工程

## 环境准备

1. 运行前需要准备火山引擎VLM、TTS、ASR等能力的API_KEY等参数，请参阅 [TTSASRInitializer](shopping/src/main/java/com/bytedance/ai/multimodal/shopping/init/TTSASRInitializer.kt)、[VLMInitializer](shopping/src/main/java/com/bytedance/ai/multimodal/shopping/init/VLMInitializer.kt)、[DefaultConfig](shopping/src/main/java/com/bytedance/ai/multimodal/shopping/init/DefaultConfig.kt) 完成配置。
2. 需分别下载物体分割([MobileSAM](https://github.com/ChaoningZhang/MobileSAM))/物体识别([RT-DETR](https://github.com/lyuwenyu/RT-DETR))模型文件并放置在Android工程 `shopping/src/main/assets` 目录下，使用对应模型文件时需遵守其许可证要求。
模型文件如下：
- [mobile_sam_decoder.onnx](https://lf3-static.bytednsdoc.com/obj/eden-cn/lm_sth/ljhwZthlaukjlkulzlp/ark/assistant/models/mobile_sam_decoder.onnx)
- [mobile_sam_encoder.onnx](https://lf3-static.bytednsdoc.com/obj/eden-cn/lm_sth/ljhwZthlaukjlkulzlp/ark/assistant/models/mobile_sam_encoder.onnx)
- [detr_v2_s.onnx](https://lf3-static.bytednsdoc.com/obj/eden-cn/lm_sth/ljhwZthlaukjlkulzlp/ark/assistant/models/rt-detr_v2_s.onnx)
3. 需要使用 jdk11 进行编译。

## 注意事项

1. 购物助手前端URL定义在`com.bytedance.ai.multimodal.shopping.PreferenceUtils#DEFAULT_MULTIMODAL_WEB_URL`，可按需进行修改。
2. 工程默认不携带前端产物，详见拍照购物前端工程的[README.md](../frontend/README.md)完成编译，完成编译后前端产物需要放置在 assets 目录下。
3. 本工程使用了多模态SDK，关于多模态SDK的使用请参考`demohouse/multimodalkit_example`内的README.md进行了解。