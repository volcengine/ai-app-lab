# Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
# Licensed under the 【火山方舟】原型应用软件自用许可协议
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#     https://www.volcengine.com/docs/82379/1433703
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import os

import logging.handlers

LOG_DIR = "logs"
if not os.path.exists(LOG_DIR):
    os.makedirs(LOG_DIR)
LOG_FILE = os.path.join(LOG_DIR, "log.log")
logger = logging.getLogger("animal_recognition")
logger.setLevel(logging.INFO)

if not logger.hasHandlers():
    file_handler = logging.handlers.RotatingFileHandler(
        LOG_FILE, maxBytes=10 * 1024 * 1024, backupCount=5, encoding='utf-8'
    )
    file_handler.setLevel(logging.DEBUG)

    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)

    formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(filename)s:%(lineno)d - %(message)s")

    file_handler.setFormatter(formatter)
    console_handler.setFormatter(formatter)

    logger.addHandler(file_handler)
    logger.addHandler(console_handler)


AK = os.environ.get("VOLC_ACCESSKEY")
SK = os.environ.get("VOLC_SECRETKEY")

ARK_API_KEY = os.environ.get("ARK_API_KEY")
DEFAULT_USER_ID = int(os.environ.get("DEFAULT_USER_ID"))

# 以华北2(北京)为例，endpoint 填写 tos-cn-beijing.volces.com
ENDPOINT = "tos-cn-beijing.volces.com"
REGION = "cn-beijing"
DOMAIN = "api-vikingdb.volces.com"

IMAGE_USER_MAX_UPLOAD_COUNT = 100
IMAGE_LIST_MAX_COUNT = 20

COLLECTION_NAME = "animal_images_5400"
INDEX_NAME = "animal_images_5400_index"


VISON_MODEL = "doubao-1.5-vision-pro-32k-250115"
UPSERT_VIKINGDB_MAX_THREAD_POOL_SIZE= 10

DESCRIPTION_PROMPT = """请详细地描述图片中的动物
输出参考如下格式：在XXXX（周围环境）XXXX的、XXXX（体态动作）XXXX的，XXXX（外观特点）XXXX的，XX（动物物种）XX
例如：在湖边草地上的、趴在地上目视远方的，金色毛比较长有点卷卷的，金毛巡回猎犬

如果图片中的主体不是动物，那么就描述主体的：
1. 背景环境；
2. 主体的动作特征；
3. 主体的外观特点；
4. 主体是什么；

例如:在客厅电视柜上的，歪斜着摆放的，很大但是很薄的，电视机
"""

INTRODUCTION_PROMPT = """
请你充当一位动物学专家，根据提供的图片简短地介绍其中的动物。请按照以下格式回答：
1. 动物种类（包括名称、科属、纲目等）
2. 主要特征（外观、大小、颜色等）
3. 习性（栖息地、食性、活动规律等）
4. 有趣的知识（有趣的行为、文化象征、特殊能力等）
请使用清晰、通俗易懂的语言进行描述，以便读者轻松理解。

如果图片中的主体不是动物，则回复用户如下内容：图片中的主体不是动物，请上传你的小动物再做检索吧！
"""

UPSERT_IMAGE_RISK_PROMPT = """
## 角色
你是一位图片判断专家，你会判断用户上传的图片是否是动物图片；

## 任务
检查用户上传的图片，判断图片中的内容是否包含动物；

## 要求
1. 如果用户的图片包含动物，则输出1，如果不包含则输出0，标准可以放宽一些；
2. 如果用户的图片包含政治敏感的人物、建筑、事件，则一定输出0，这个要很严格；
3. 输出格式要严格按照json格式输出，例如{“animal”: “1”}或{“animal”: “0”}；
4. 只能输出json的意图判断，其他任何多余内容和解释都禁止输出；

## 示例
用户输入: 熊猫图片
判断输出：{“animal”: “1”}

用户输入: 建筑图片
判断输出：{“animal”: “0”}

用户输入: 只包含人类图片
判断输出：{“animal”: “0”}

用户输入: 大量动物迁徙图片
判断输出：{“animal”: “1”}

用户输入: 动物和人类一起出现
判断输出：{“animal”: “1”}
"""

QUERY_RISK_PROMPT="""
## 角色
你是一位意图判断专家，你将根据用户输入的query，来解决判断用户的意图是否是想去搜索动物之类的意图；

## 任务
根据用户上传的内容（可能是文本，也可能是图片），也就是query，判断用户的意图，检查其意图是否是想去检索动物；

## 要求
1. 如果用户的query看起来是像要去检索动物的，则输出1，如果不是则输出0，标准可以放宽一些；
2. 如果用户的query包含政治敏感的人物、建筑、事件，则一定输出0，这个要很严格；
3. 输出格式要严格按照json格式输出，例如{“intention”: “1”}或{“intention”: “0”}
4. 只能输出json的意图判断，其他任何多余内容和解释都禁止输出；

## 示例
用户输入: "小熊猫"（无论是文本还是图片）
判断输出：{“intention”: “1”}

用户输入: "国家领导人"（无论是文本还是图片）
判断输出：{“intention”: “0”}

用户输入: "天安门"（无论是文本还是图片）
判断输出：{“intention”: “0”}

用户输入: "水生的"（无论是文本还是图片）
判断输出：{“intention”: “1”}

用户输入: "高大的"（无论是文本还是图片）
判断输出：{“intention”: “1”}
"""