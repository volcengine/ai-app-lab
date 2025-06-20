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

import time

from typing import AsyncIterable
from arkitect.core.component.llm.model import ArkChatRequest, ArkChatResponse, Response

from arkitect.core.errors import Error
from arkitect.launcher.local.serve import launch_serve
from arkitect.telemetry.trace import task
from arkitect.utils.context import get_reqid

from handler import *


def assemble_resp(status_code, message, error_flag=False, error_msg="", metadata=None):
    error = None
    if error_flag:
        error = Error(code=error_msg, code_n=status_code, message=message)

    return ArkChatResponse(
        error=error,
        id=get_reqid(),
        choices=[],
        model="",
        created=int(time.time()),
        object="chat.completion",
        metadata=metadata,
    )


def upsert_image(request: ArkChatRequest):
    user_id = request.metadata.get("user_id")
    image_tos_path_list = request.metadata.get("image_tos_path_list")
    upload_time = request.metadata.get("upload_time")
    if not user_id or not image_tos_path_list or not upload_time:
        return assemble_resp(400, "user_id or image_tos_path or upload_time is None", error_flag=True,
                             error_msg="user_id or image_tos_path or upload_time is None")
    if len(image_tos_path_list) > IMAGE_USER_MAX_UPLOAD_COUNT:
        return assemble_resp(403, "forbid upload more than 100 images", error_flag=True,
                             error_msg="forbid upload more than 100 images")
    code, msg, err_msg = upsert_image_handler(user_id, image_tos_path_list, upload_time)
    if code != 200:
        return assemble_resp(code, msg, error_flag=True, error_msg=err_msg)
    return assemble_resp(code, msg, metadata={})


def search_image(request: ArkChatRequest):
    user_id = request.metadata.get("user_id")
    if not user_id:
        return assemble_resp(400, "user_id is None", error_flag=True, error_msg="user_id is None")
    query = request.metadata.get("query", "")
    image_tos_path = request.metadata.get("image_tos_path", "")
    if query == "" and image_tos_path == "":
        return assemble_resp(400, "query and image_tos_path is None", error_flag=True,
                             error_msg="query and image_tos_path is None")
    code, msg, err_msg, image_tos_path_list = search_image_handler(query, user_id, image_tos_path)
    if code != 200:
        return assemble_resp(code, msg, error_flag=True, error_msg=err_msg)
    return assemble_resp(200, "search image success", metadata={"image_tos_path_list": image_tos_path_list})


def list_image(request: ArkChatRequest):
    user_id = request.metadata.get("user_id")
    if not user_id:
        return assemble_resp(400, "user_id is None", error_flag=True, error_msg="user_id is None")
    image_tos_data = list_image_handler(user_id)
    return assemble_resp(200, "list image success", metadata={"image_tos_path_list": image_tos_data})


def signed_tos_list_to_url_list(request: ArkChatRequest):
    image_tos_path_list = request.metadata.get("image_tos_path_list")
    if not image_tos_path_list:
        return assemble_resp(400, "image_tos_path_list is None", error_flag=True,
                             error_msg="image_tos_path_list is None")
    code, msg, err_msg, image_url_list = get_tos_url_signed_list_handler(image_tos_path_list)
    if code != 200:
        return assemble_resp(code, msg, error_flag=True, error_msg=err_msg)
    return assemble_resp(200, "signed_tos_list_to_url_list success", metadata={"image_url_list": image_url_list})


TYPE_MAP_FUNC = {
    "list_image": list_image,
    "upsert_image": upsert_image,
    "search_image": search_image,
    "signed_tos_list_to_url_list": signed_tos_list_to_url_list,
}


def default_model_calling(
        request: ArkChatRequest,
) -> ArkChatResponse:
    request_type = request.metadata.get("type")
    assert request_type is not None

    func = TYPE_MAP_FUNC.get(request_type)
    assert func is not None
    return func(request)


@task()
async def main(request: ArkChatRequest) -> AsyncIterable[Response]:
    try:
        yield default_model_calling(request)
    except Exception as e:
        logger.error("process request error: {}".format(e))
        yield assemble_resp(500, "InternalServiceError", error_flag=True, error_msg=str(e))


if __name__ == "__main__":
    env_port = os.getenv("_FAAS_RUNTIME_PORT")
    try:
        port = int(env_port)
    except Exception as exp:
        logger.warning("can not convert {} port to int, error: {}".format(env_port, exp))
        port = 8888
    launch_serve(
        package_path="main",
        port=port,
        health_check_path="/v1/ping",
        endpoint_path="/api/v3/bots/chat_multi_modal/animal_recognition",
        clients={},
    )
