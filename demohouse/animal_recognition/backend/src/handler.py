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

from volcengine.viking_db import *
from volcenginesdkarkruntime import Ark
from config import *
import tos
import json
from tos import HttpMethodType
from concurrent.futures import ThreadPoolExecutor
import threading


def get_tos_url_signed(tos_path):
    bucket_name, object_key = tos_path.split("//")[1].split("/", 1)
    client = tos.TosClientV2(AK, SK, ENDPOINT, REGION)
    signed_url = client.pre_signed_url(HttpMethodType.Http_Method_Get, bucket_name, object_key)
    return signed_url.signed_url


def get_tos_url_signed_list_handler(tos_path_list):
    code = 200
    msg = ""
    err_msg = ""
    logger.info("get_tos_url_signed_list_handler")
    logger.info("tos_path_list: %s", tos_path_list)
    signed_url_list = []
    err_tos_list = []
    client = tos.TosClientV2(AK, SK, ENDPOINT, REGION)
    for tos_path in tos_path_list:
        try:
            bucket_name, object_key = tos_path.split("//")[1].split("/", 1)
            if bucket_name != "animal-images-5400":
                continue
            signed_url = client.pre_signed_url(HttpMethodType.Http_Method_Get, bucket_name, object_key)
            signed_url_list.append(signed_url.signed_url)
        except Exception as e:
            # 操作失败，捕获客户端异常，一般情况为非法请求参数或网络异常
            logger.error('fail with client error, message:{}, cause: {}'.format(e.message, e.cause))
            err_tos_list.append(tos_path)
    if len(err_tos_list) > 0:
        code = 500
        msg = json.dumps(err_tos_list)
        err_msg = "get_tos_url_signed_list_handler failed"
    return code, msg, err_msg, signed_url_list


def get_description_introduction(image_tos_path):
    image_url_signed_url = get_tos_url_signed(image_tos_path)

    # 并行处理两个请求
    def _generate_content(prompt):
        client = Ark(api_key=ARK_API_KEY)  # 每个线程创建独立客户端
        return client.chat.completions.create(
            model=VISON_MODEL,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": image_url_signed_url}}
                ],
            }]
        )

    with ThreadPoolExecutor(max_workers=1) as executor:
        # 风控
        future_risk = executor.submit(_generate_content, UPSERT_IMAGE_RISK_PROMPT)
        future_desc = executor.submit(_generate_content, DESCRIPTION_PROMPT)
        future_intro = executor.submit(_generate_content, INTRODUCTION_PROMPT)
        # 获取结果
        response_risk = future_risk.result()
        response_description = future_desc.result()
        response_introduction = future_intro.result()

    return (
        response_risk.choices[0].message.content,
        response_description.choices[0].message.content,
        response_introduction.choices[0].message.content
    )


def upsert_image_handler(user_id: int, image_tos_path_list: list[str], upload_time: int):
    code = 200
    msg = ""
    err_msg = ""

    user_already_upload_len = len(list_user_image(user_id, IMAGE_USER_MAX_UPLOAD_COUNT))
    if user_already_upload_len + len(image_tos_path_list) > IMAGE_USER_MAX_UPLOAD_COUNT:
        logger.warning("user: {} already uploaded {} images, upto the limit".format(
            user_id, IMAGE_USER_MAX_UPLOAD_COUNT))
        code = 403
        msg = ""
        err_msg = "user already upload max count images"
        return code, msg, err_msg

    err_image_list = []
    lock = threading.Lock()
    vikingdb_service = VikingDBService(host=DOMAIN, region=REGION, connection_timeout=30, socket_timeout=30)
    vikingdb_service.set_ak(AK)
    vikingdb_service.set_sk(SK)
    collection = vikingdb_service.get_collection(COLLECTION_NAME)

    def _process_image(image_tos_path):
        try:
            # 获取AI生成内容
            logger.info("get image description for {}".format(image_tos_path))
            risk, desc, intro = get_description_introduction(image_tos_path)

            risk = json.loads(risk)
            if risk["animal"] == "0":
                logger.info("image: {} is not animal, skip".format(image_tos_path))
                with lock:
                    # err_item = {
                    #     "image_tos_path": image_tos_path,
                    #     "err_msg": "image is not animal"
                    # }
                    err_image_list.append(image_tos_path)
                return
            # 构建数据对象
            data = Data({
                "user_id": user_id,
                "upload_time": upload_time,
                "image_description": desc,
                "image_tos_path": image_tos_path,
                "image_introduction": intro,
            }, TTL=30 * 24 * 60 * 60)

            collection.upsert_data(data)
            logger.info("upsert \"{}\" image success".format(image_tos_path))
        except Exception as e:
            logger.error(f"处理图片失败: {image_tos_path}, 错误: {str(e)}")
            with lock:
                # err_item = {
                #     "image_tos_path": image_tos_path,
                #     "err_msg": "generate description or introduction failed: "+str(e)
                # }
                err_image_list.append(image_tos_path)

    # 使用线程池并发处理
    with ThreadPoolExecutor(max_workers=UPSERT_VIKINGDB_MAX_THREAD_POOL_SIZE) as executor:
        executor.map(_process_image, image_tos_path_list)

    if len(err_image_list) > 0:
        logger.error(err_image_list)
        code = 500
        msg = json.dumps(err_image_list)
        err_msg = "upsert image failed"
    return code, msg, err_msg


def _check_query_risk(text, image_tos_path):
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": QUERY_RISK_PROMPT}
            ],
        }
    ]
    if text:
        messages[0]["content"][0]["text"] = QUERY_RISK_PROMPT + "用户输入: " + text
    if image_tos_path:
        messages[0]["content"].append(
            {"type": "image_url", "image_url": {"url": get_tos_url_signed(image_tos_path)}})
    client = Ark(api_key=ARK_API_KEY)
    response = client.chat.completions.create(
        model=VISON_MODEL,
        messages=messages
    )
    query_risk = json.loads(response.choices[0].message.content)
    if query_risk["intention"] == "0":
        return False
    return True


def search_image_handler(text: str, user_id: int, image_tos_path: str):
    logger.info("search image for user_id: {}, search query: {}, search image path: {}".format(
        user_id, text, image_tos_path))
    code = 200
    msg = ""
    err_msg = ""
    vikingdb_service = VikingDBService(host=DOMAIN, region=REGION, connection_timeout=30, socket_timeout=30)
    vikingdb_service.set_ak(AK)
    vikingdb_service.set_sk(SK)
    index = vikingdb_service.get_index(COLLECTION_NAME, INDEX_NAME)
    if text == "":
        text = None
    if image_tos_path == "":
        image_tos_path = None

    if not _check_query_risk(text, image_tos_path):
        logger.warning("query or image forbidden to search")
        code = 403
        msg = ""
        err_msg = "query or image is forbidden"
        return code, msg, err_msg, []

    datas = index.search_with_multi_modal(
        text=text,  # 文本输入，表示查询的文本内容
        image=image_tos_path,
        limit=4,  # 设置返回的最大结果数为 4
        need_instruction=False,
        filter={
            "op": "or",
            "conds": [
                {
                    "op": "must",
                    "field": "user_id",
                    "conds": [user_id]
                },
                {
                    "op": "must",
                    "field": "user_id",
                    "conds": [DEFAULT_USER_ID]
                }
            ]
        }
    )
    result_list = [x.fields for x in datas]
    return code, msg, err_msg, result_list


def list_image_handler(user_id: int):
    user_tos_list = list_user_image(user_id, IMAGE_LIST_MAX_COUNT)
    tos_data = {
        'user': user_tos_list,
    }
    if len(user_tos_list) < IMAGE_LIST_MAX_COUNT:
        default_tos_list = list_default_image()
        tos_data['default'] = default_tos_list[:IMAGE_LIST_MAX_COUNT - len(user_tos_list)]
    return tos_data


def list_user_image(user_id: int, limit: int):
    logger.info("list_user_image")
    logger.info("user_id: %s", user_id)
    vikingdb_service = VikingDBService(host=DOMAIN, region=REGION, connection_timeout=30, socket_timeout=30)
    vikingdb_service.set_ak(AK)
    vikingdb_service.set_sk(SK)
    index = vikingdb_service.get_index(COLLECTION_NAME, INDEX_NAME)
    order = ScalarOrder("upload_time", Order.Desc)
    filter = {
        "op": "must",
        "field": "user_id",
        "conds": [user_id]
    }
    datas = index.search(order=order, filter=filter, limit=limit)

    user_tos_list = [x.fields for x in datas]
    return user_tos_list


DEFAULT_TOS_LIST = []


def list_default_image():
    global DEFAULT_TOS_LIST
    if len(DEFAULT_TOS_LIST) > 0:
        return DEFAULT_TOS_LIST
    vikingdb_service = VikingDBService(host=DOMAIN, region=REGION, connection_timeout=30, socket_timeout=30)
    vikingdb_service.set_ak(AK)
    vikingdb_service.set_sk(SK)
    index = vikingdb_service.get_index(COLLECTION_NAME, INDEX_NAME)
    filter_params = {
        "op": "must",
        "field": "user_id",
        "conds": [DEFAULT_USER_ID]
    }
    datas = index.search(filter=filter_params, limit=IMAGE_LIST_MAX_COUNT)
    DEFAULT_TOS_LIST = [x.fields for x in datas]
    return DEFAULT_TOS_LIST
