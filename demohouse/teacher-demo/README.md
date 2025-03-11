# 场景介绍
基于豆包视觉理解与DeepSeek深度推理双引擎驱动的教育解决方案，创新性实现多模态教学场景覆盖。通过视觉理解技术，精准提取题目文本与公式图形，结合DeepSeek进行逻辑推演，提供「即拍即解-批量批改-实时互动」三维一体的智能辅导体验。支持单题深度解析、多题智能批阅及视频流实时解题，突破传统教育工具时空限制，为教师减负增效，打造24小时在线的个性化学习伙伴
<br>

[GitHub代码查看](https://github.com/volcengine/ai-app-lab/tree/main/demo_house/chat2cartoon)
```bash
git clone https://github.com/volcengine/ai-app-lab.git
cd demohouse/chat2cartoon/backend
```
<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/lm_sth/ljhwZthlaukjlkulzlp/ark/assistant/videos/20241217-172721.mp4" controls>
</video>

<br>

# 架构图
![Image](https://p9-arcosite.byteimg.com/tos-cn-i-goo7wpa0wc/9a993e7ce54a4c48b8a7a46a18b1cce2~tplv-goo7wpa0wc-image.image)

- **极简开发的场景化赋能**：提供多模态（拍照和视频），标准化的（拍题-切题-解题）教育产品核心链路，并且支持主体识别，分割，圈选，流式加载，多题展示等产品能力，企业和开发者只要结合自身业务场景做定向改造，即可快速搭建教育应用。  
- **双引擎技术重构解题逻辑**：区别于传统题库的检索模式，深度融合豆包视觉模型的图像理解能力与DeepSeek深度推理引擎，实现「视觉解析-逻辑推演-步骤生成」全新解题&批改链路。  
- **视频流解题开启教学新模态**：借助豆包视频大模型的视频实时理解技术，首创教育行业实时视频拍照解题，依据画面关键信息   为使用者提供精准的题目识别和答案解析，为探索更多【视频教育场景】提供技术支持。
<br>

# 代码说明

注意：在运行开源代码前请先创建对应模型的<a href="https://console.volcengine.com/ark/region:ark+cn-beijing/endpoint?config=%7B%7D" target="_blank">推理接入点</a> 并根据【快速开始】说明修改配置，以确保代码的正常运行和集成。相关操作说明如下：
- <a href="https://www.volcengine.com/docs/82379/1399008" target="_blank">快速入门-调用模型服务</a>
- <a href="https://www.volcengine.com/docs/82379/1361424" target="_blank">API Key 管理</a>
- <a href="https://www.volcengine.com/docs/82379/1099522" target="_blank">创建推理接入点（Endpoint）</a>

<br>

查看更多详细代码及环境准备，请点击下方按钮。 

<button style="padding: 8px 50px; background-color: #ffffff; color: black; border: 2px solid #ccc; border-radius: 5px; cursor: pointer;">
    github 下载地址
</button>  

<br>

```python
async def main(
    request: ArkChatRequest,
) -> AsyncIterable[Union[ArkChatCompletionChunk, ArkChatResponse]]:
    """
    Determines the phase and mode based on the last message in the
    current request and executes the corresponding response generator.
    """
    last_user_message = get_last_message(request.messages, "user")

    mode = Mode.CONFIRMATION
    if type(last_user_message.content) is str and last_user_message.content.startswith(
        Mode.REGENERATION.value
    ):
        mode = Mode.REGENERATION

    INFO(f"mode: {mode.value}")

    phase = PhaseFinder(request).get_next_phase()
    if mode == Mode.REGENERATION:
        phase = get_phase_from_message(last_user_message.content)

    INFO(f"phase: {phase.value}")

    generator = GeneratorFactory(phase).get_generator(request, mode)

    async for chunk in generator.generate():
        yield chunk
```
<br>

# 关联模型及云产品

## 模型

| 相关服务 | 描述 | 计费说明 |
| --- | --- | --- |
| [Doubao-pro-32k](https://cloud.bytedance.net/ark/region:ark+cn-beijing/model/detail?Id=doubao-pro-32k&arkAccountId=2100583673&arkProjectName=default&x-resource-account=public) | 根据用户的主题需求，生成故事大纲与分镜脚本，并提供角色设定、首帧图、视频、音频等素材的创作提示词。 | [多种计费方式](https://www.volcengine.com/docs/82379/1099320) |
| [Doubao-语音合成](https://console.volcengine.com/ark/region:ark+cn-beijing/model/detail?Id=ve-tts) | 根据分镜台词及角色特点所匹配音色等创作提示词，生成配音文件。 | [多种计费方式](https://www.volcengine.com/docs/82379/1099320) |
| [Doubao-流式语音识别](https://console.volcengine.com/ark/region:ark+cn-beijing/model/detail?Id=seedasr-streaming) | 将用户的语音提问转写为文本，以便于视觉大模型对用户问题的理解与回复。 | [多种计费方式](https://www.volcengine.com/docs/82379/1099320) |


# 联系我们
点击加入飞书群： [应用实验室开发者沟通群](https://applink.larkoffice.com/client/chat/chatter/add_by_link?link_token=a5aq182d-ad9b-4867-8464-609f1ee8cb34)

<img src="https://p9-arcosite.byteimg.com/tos-cn-i-goo7wpa0wc/640fc3ff866649f5b7bff9c44874374b~tplv-goo7wpa0wc-image.image" alt="应用实验室开发者沟通飞书群" style="width:50%;">

<br><br><br><br><br><br>