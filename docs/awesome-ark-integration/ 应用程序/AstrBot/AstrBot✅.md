## AstrBot

Github地址：https://github.com/Soulter/AstrBot
Demo地址：[https://demo.astrbot.app/](https://demo.astrbot.app/)

AstrBot 是一个松耦合、异步、支持多消息平台部署、具有易用的插件系统和完善的大语言模型（LLM）接入功能的聊天机器人及开发框架。

## **方舟**上的准备


1. 获取 API Key 点击[这里](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey)。
2. 开通方舟模型点击[这里](https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement)。
3. 获取模型 ID 点击[这里](https://www.volcengine.com/docs/82379/1330310#%E6%96%87%E6%9C%AC%E7%94%9F%E6%88%90)。


## 部署及调用方舟


1. Git clone该项目到本地，命令`git clone https://github.com/Soulter/AstrBot`
2. 通过[Docker](https://astrbot.app/deploy/astrbot/docker.html#%E4%BD%BF%E7%94%A8-docker-%E9%83%A8%E7%BD%B2-astrbot)、[Windows](https://astrbot.app/deploy/astrbot/windows.html)、[Replit](https://repl.it/github/Soulter/AstrBot)、[CasaOS](https://astrbot.app/deploy/astrbot/casaos.html)、[手动部署](https://astrbot.app/deploy/astrbot/cli.html)等多方式拉起AstrBot服务。
3. 在浏览器中打开AstrBot控制面板。

<div style="text-align: center"><img src="asset/1.image" width="667px" /></div>


4. 点击左侧服务提供商，选择新增服务提供商，选择OpenAI配置。默认启用。


<div style="text-align: center"><img src="asset/2.image" width="715px" /></div>



5. 修改以下配置


<div style="text-align: center"><img src="asset/3.image" width="709px" /></div>


<div style="text-align: center"><img src="asset/4.image" width="722px" /></div>


* `ID (id) `：自定义名称，不能与已有冲突。例如，定义为ark。
* `API Key`：获取方舟的API Key，点击[这里](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey)。键入后回车，添加为标签后才生效。
* `Base URL`：https://ark.cn-beijing.volces.com/api/v1/
* `Model`：Model ID，获取模型 ID 点击[这里](https://www.volcengine.com/docs/82379/1330310#%E6%96%87%E6%9C%AC%E7%94%9F%E6%88%90)。例如，deepseek-v3-241226。



6. 点击保存。服务提供商列表中出现刚定义的ark。


<div style="text-align: center"><img src="asset/5.image" width="457px" /></div>



7. 使用AstrBot的功能，例如聊天：

<div style="text-align: center"><img src="asset/6.image" width="457px" /></div>


