# 动物识别专家

## 应用介绍
这是一款面向动物爱好者与自然科普场景的智能动物图片检索应用。基于 VikingDB 向量数据库与 TOS 对象存储服务，用户输入动物图片或文字描述，即可快速找到对应的动物图片，也支持用户上传自己的图片进行检索。应用还结合豆包视觉大模型（VLM），实现对动物图片的理解与介绍，帮助用户更便捷地探索自然世界。开发者可参考本示例，将图片检索和视觉理解能力复用到更多垂直场景，优化产品体验，推动业务创新。

### 直接体验
访问并登录 [火山方舟控制台](https://console.volcengine.com/ark/region:ark+cn-beijing/application/detail?id=bot-multiplequery-procode-preset&prev=application)体验。

### 关联模型及云产品
#### 模型
| **相关服务** | **描述** | **计费说明** |
| --- | --- | --- |
| Doubao-1.5-vision-pro-32k | 读取并理解检索出的图片，生成图片中动物的介绍。 | [查看详情](https://www.volcengine.com/docs/82379/1099320) |
#### 云产品
| **相关服务**                                                      | **描述** | **计费说明**                                              |
|---------------------------------------------------------------| --- |-------------------------------------------------------|
| [向量数据库VikingDB](https://www.volcengine.com/product/VikingDB) | 基于火山引擎的云基础设施搭建，用于生产、存储、索引和分析来自机器学习模型产生的海量向量数据的数据库系统 | [查看详情](https://www.volcengine.com/docs/84313/1414459) |
| [对象存储](https://www.volcengine.com/product/TOS) |基于先进分布式技术，帮助用户存储并管理海量非结构化数据。| [查看详情](https://www.volcengine.com/docs/6349/78455)|
| [函数服务](https://www.volcengine.com/product/vefaas)             | 事件驱动的无服务器函数托管计算平台 | [查看详情](https://www.volcengine.com/docs/6662/107454)   |
| [API网关](https://www.volcengine.com/product/apig)              | 基于云原生、高扩展、高可用的云上网关托管服务 | [查看详情](https://www.volcengine.com/docs/6569/185249)   |
| [日志服务](https://www.volcengine.com/product/tls)                | 提供针对日志类数据的一站式服务 | [查看详情](https://www.volcengine.com/docs/6470/1215813)  |


## 环境准备

### 基础依赖

- Python 版本要求大于等于 3.9，小于 3.12
- Node 18.0 或以上版本
- PNPM 8.10 或以上版本

### 账号与服务

1. 获取火山方舟 API Key [参考文档](https://www.volcengine.com/docs/82379/1399008#b00dee71)
2. 开通VikingDB向量库（华北）[参考文档](https://www.volcengine.com/docs/84313/1254444)
3. 创建 AK/SK 及子账号权限策略  [参考文档](https://www.volcengine.com/docs/84313/1254467)
4. 开通对象存储服务，并参考以下配置 ：
   - 创建名为`animal-recognition-test`的存储桶（区域选择华北）
   - 上传动物图片数据集至该桶
   - 为 VikingDB 配置 TOS 访问权限（[权限配置指引](https://console.volcengine.com/iam/service/attach_role/?ServiceName=ml_platform)）

## 快速开始

1. 下载代码库

   ```bash
    git clone https://github.com/volcengine/ai-app-lab.git
    cd demohouse/animal_recognition
   ```
2. 修改配置

   - 修改run.sh中配置，填入刚刚获取的AK、SK、方舟API Key和火山账号ID

   - 修改frontend/src/constants.ts，填入获取的AK、SK、火山账号ID
   - 如需修改向量库数据集和索引名称，在backend/src/config.py文件中修改COLLECTION_NAME和INDEX_NAME

3. 安装后端依赖

   ```bash
   cd demohouse/animal_recognition/backend
   # 以下命令需要在backend目录执行
   python -m venv .venv
   source .venv/bin/activate
   # 执行pip时，需要保证对应python版本大于等于3.9.0，小于3.12
   pip install poetry==1.6.1
   
   poetry install
   ```
4. 启动后端

   ```bash
   cd demohouse/deepdoubao/backend
   bash run.sh
   # 运行run.sh脚本后，根据提示命令操作，
   # 首先通过create_index创建向量库数据集和索引，在向量库页面验证创建索引成功后，执行start_server命令，
   # 启动后端服务
   ```
   
5. 启动前端

   ```bash
   # 以下命令需要在frontend目录执行
   cd ../frontend
   pnpm install
   pnpm run dev
   ```

## 技术实现
1. 核心架构与能力整合
   - 本项目通过VikingDB向量库高效的多模态检索能力、豆包Doubao-1.5-vision-pro-32k模型优秀的视觉理解能力构建了一套多模态检索系统。
2. 技术实现路径
   - 图片理解：利用Doubao-1.5-vision-pro-32k模型，对上传的图片的背景环境、主体特征、主体外观等内容进行描述，并对图片中的动物种类生成清晰、有趣的科普知识。
   - 向量存储：将图片和图片的文字描述通过VikingDB进行向量化编码，存入向量库，在检索时，在库中检索与输入图片最相似的向量，根据相似度由高到低排序，实现高效的多模态检索。

## 目录结构
```text
├── README.md
├── backend
│   ├── src
│   │   ├── __init__.py
│   │   ├── vikingdb_prepare.py   # 创建向量库数据集和索引
│   │   ├── config.py             # 配置文件
│   │   ├── handler.py            # 业务处理
│   │   ├── main.py               # 入口函数
│   ├── poetry.lock             
│   ├── pyproject.toml            
│   ├── run.sh                    # 启动脚本    
├── frontend

```

## 常见问题
- 环境变量配置错误导致的鉴权问题：
  - 鉴权时需要用到run.sh中的AK、SK、ARK_API_KEY等变量，请参见环境准备和快速开始正确配置。