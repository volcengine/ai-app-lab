## MoneyPrinterTurbo
Github：https://github.com/harry0703/MoneyPrinterTurbo
只需提供一个视频 **主题** 或 **关键词** ，就可以全自动生成视频文案、视频素材、视频字幕、视频背景音乐，然后合成一个高清的短视频。

## **方舟**上的准备


1. 获取 API Key 点击[这里](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey)。
2. 开通方舟模型点击[这里](https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement)。
3. 获取模型 ID 点击[这里](https://www.volcengine.com/docs/82379/1330310#%E6%96%87%E6%9C%AC%E7%94%9F%E6%88%90)。


## 部署及调用方舟


1. 打开一个本地Teminal，Git clone代码到本地`git clone https://github.com/harry0703/MoneyPrinterTurbo.git`
2. 打开clone到的文件夹，一般应在`/User/{user_name}`路径下，在`MoenyPrinterTurbo`文件夹中，找到`config.example.toml`文件复制一份，命名为`config.toml`。

<div style="text-align: center"><img src="asset/1.image" width="457px" /></div>


3. 在任意的编辑器中打开`config.toml`，修改以下配置并保存。
* openai_api相关，用于关键词生成视频文案与字幕功能；

<div style="text-align: center"><img src="asset/2.image" width="457px" /></div>

   * `openai_api_key`：获取方舟的API Key，点击[这里](https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey)。
   * `openai_base_url`：https://ark.cn-beijing.volces.com/api/v1/
   * `openai_model_name`：Model ID，获取模型 ID 点击[这里](https://www.volcengine.com/docs/82379/1330310#%E6%96%87%E6%9C%AC%E7%94%9F%E6%88%90)。例如，deepseek-v3-241226。
* 登录[pexels](https://www.pexels.com/api/)网站获取pexels_api_key或pixabay_api_keys，这将用于生产视频。

<div style="text-align: center"><img src="asset/3.image" width="457px" /></div>


4. 回到Terminal，进行部署，此处以Docker部署为例，更多部署方式可参考[这里](https://github.com/harry0703/MoneyPrinterTurbo/blob/main/README.md)。
   * `cd MoneyPrinterTurbo`
   * `docker-compose up`

<div style="text-align: center"><img src="asset/4.image" width="763px" /></div>


   * 回到Docker页面，点击上面可进入web页面。

<div style="text-align: center"><img src="asset/5.image" width="601px" /></div>


   * web页面分为基础设置和其他两个部分。基础设置点击展开后可以看到之前在toml配置中的项目。如果在前端进行修改，那么`config.toml`文件中的配置也将会同步修改。

<div style="text-align: center"><img src="asset/6.image" width="601px" /></div>

<div style="text-align: center"><img src="asset/7.image" width="601px" /></div>


5. 在web页面中输入视频主题，例如A lonely person，下面会生成对应文案，说明通过方舟的DeepSeek模型部署成功。


<div style="text-align: center"><img src="asset/8.image" width="601px" /></div>


