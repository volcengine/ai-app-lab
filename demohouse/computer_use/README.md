# 场景介绍
Computer Use Agent实现了通过简单的指令即可让远程计算机为用户执行任务，例如视频剪辑、演示文稿（PPT）制作以及自媒体账号运维等均能轻松完成。该方案基于自研的Doubao 1.5 UI - TARS模型，即“通过强化学习融合视觉能力与高级推理的模型”，能够直接与图形用户界面（GUI）进行交互，而无需依赖特定的应用程序编程接口（API）。

Computer Use Agent具备卓越的桌面应用操作能力，能够精准识别用户的任务需求，进行智能感知、自主推理并准确执行，体现了从“对话式人工智能（AI）”向“行动式人工智能（AI）”的转型趋势。
- 感知：CUA 截取计算机屏幕图像，旨在对数字环境中的内容进行情境化处理。这些视觉输入成为决策的依据。
- 推理：CUA 借助思维链推理对其观察结果进行评估，并跟踪中间步骤的进展。通过分析过往和当前的屏幕截图，该系统能够动态适应新的挑战和不可预见的变化。
- 行动：CUA 利用虚拟鼠标和键盘执行键入、点击和滚动等操作
<br>

## 开始体验
- 方式一：[基于火山FaaS应用模版一键部署ComputerUse应用](https://console.volcengine.com/vefaas/region:vefaas+cn-beijing/application)

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/lm_sth/ljhwZthlaukjlkulzlp/ark/assistant/videos/20250415-221030.mp4" controls>
</video>

- 方式二：[使用火山Computer-Use体验中心快速体验](https://computer-use.console.volcengine.com/)

<video src="https://lf3-static.bytednsdoc.com/obj/eden-cn/lm_sth/ljhwZthlaukjlkulzlp/ark/assistant/videos/20250415-221030.mp4" controls>
</video>

<br>


# 架构图
![Image](https://lf3-static.bytednsdoc.com/obj/eden-cn/lm_sth/ljhwZthlaukjlkulzlp/ark/assistant/images/comuse-system.image)

## 优势
- **强大的自研模型**：基于字节自研强大的Doubao 1.5 UI-TARS，让大模型更加精准理解用户的意图和执行用户的任务
- **多种操作系统支持**：支持Window和Linux双操作系统，满足用户多种场景需求
- **极致拉起速度**：提供秒级的远程云主机拉起速度，极致云上体验
<br>


# 关联模型及云产品
支持的模型包括方舟平台上线的全量豆包大模型，以及方舟平台认证的第三方合作模型，如DeepSeek模型，模型详细信息见[方舟平台模型列表](https://www.volcengine.com/docs/82379/1330310)。

## 模型
| 相关服务              | 描述                                                                                                                  | 计费说明 |
|-----------------------|---------------------------------------------------------------------------------------------------------------------------|--------|
| Doubao 1.5 UI-TARS    |- UI-TARS 是一款原生面向图形界面交互（GUI）的Agent模型。通过感知、推理和行动等类人的能力，与GUI进行无缝交互。<br>- 与传统模块化框架不同，UI-TARS将所有核心能力（感知、推理、基础理解能力）统一集成在视觉大模型（VLM）中，实现无需预定义工作流程或人工规则的端到端任务自动化。<br>- 模型通过将屏幕视觉理解、逻辑推理、界面元素定位和操作整合在单一模型中，突破了传统自动化工具依赖预设规则的局限性，为智能界面交互提供了更接近人类认知范式的解决方案。 |<a href="https://www.volcengine.com/docs/82379/1263336" target="_blank">计费说明</a>   |    |

## 云服务

| 相关服务 | 描述 | 计费说明                                                                                                                                                               |
| --- | --- |--------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| ECS | 云服务器（Elastic Compute Service，ECS）是一种由CPU、内存、云盘等组成的资源集合，每一种资源都会逻辑对应到数据中心的计算硬件实体。您可以结合自己的需求申请对应大小、不同规格的资源，用于运行不同的业务负载，而无需关注硬件服务器的位置和状态 | <a href="https://www.volcengine.com/docs/6396/69812" target="_blank">云服务器计费说明</a>、<a href="https://www.volcengine.com/docs/6396/68422" target="_blank">云硬盘计费说明</a> |
| APIG | 火山引擎API 网关（API Gateway，APIG）是基于云原生的、高扩展、高可用的云上网关托管服务 |<a href="https://www.volcengine.com/docs/6569/185249" target="_blank">计费说明</a>                                                                                                                                                                   |
| FaaS| Function as a Service函数即服务，是一种云计算服务模型，开发者可以在该模型下构建、运行和管理应用程序中的功能，而无需自行处理底层应用程序基础设施。字节跳动针对内外用户有ByteFaas、VeFaaS两个产品，主要支持消费Serverless，微服务Serverless，AI（Artificial intelligence）云原生应用Serverless等业务场景，具备事件驱动、快速冷启动、自动扩缩、按量计费等特点。 |<a href="https://www.volcengine.com/docs/6662/107454" target="_blank">计费说明</a>                                                                                                                                                                    | |

# 联系我们
点击加入飞书群： [应用实验室开发者沟通群](https://applink.larkoffice.com/client/chat/chatter/add_by_link?link_token=a5aq182d-ad9b-4867-8464-609f1ee8cb34)

<img src="https://p9-arcosite.byteimg.com/tos-cn-i-goo7wpa0wc/640fc3ff866649f5b7bff9c44874374b~tplv-goo7wpa0wc-image.image" alt="应用实验室开发者沟通飞书群" style="width:50%;">

<br><br><br><br><br><br>