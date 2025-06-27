# Copyright 2025 Bytedance Ltd. and/or its affiliates
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import hashlib
import json
import time

import httpx
from volcengine.ApiInfo import ApiInfo
from volcengine.auth.SignerV4 import SignerV4
from volcengine.tls.TLSService import TLSService
from volcengine.tls.const import *
from volcengine.tls.tls_exception import TLSException

from mcp_server_tls.config import config

HEADER_API_VERSION = "x-tls-apiversion"
API_VERSION_V_0_3_0 = "0.3.0"

API_INFO = {
    # APIs of log projects.
    "/CreateAppInstance": ApiInfo(HTTP_POST, "/CreateAppInstance", {}, {}, {}),
    "/DescribeAppInstances": ApiInfo(HTTP_GET, "/DescribeAppInstances", {}, {}, {}),
    "/CreateAppSceneMeta": ApiInfo(HTTP_POST, "/CreateAppSceneMeta", {}, {}, {}),
    "/DescribeSessionAnswer": ApiInfo(HTTP_POST, "/DescribeSessionAnswer", {}, {}, {}),
}


class TlsResource:
    """
    火山引擎tls日志资源类
    """

    client: TLSService = None

    def __init__(self):
        self.client = TLSService(
            endpoint=config.endpoint,
            region=config.region,
            access_key_id=config.access_key_id,
            access_key_secret=config.access_key_secret,
        )

        self.api_info = API_INFO

    def __prepare_request(
            self,
            api: str,
            params: dict = None,
            body: dict = None,
            request_headers: dict = None,
    ):
        if params is None:
            params = {}
        if body is None:
            body = {}

        request = self.client.prepare_request(self.api_info[api], params)

        if request_headers is None:
            request_headers = {CONTENT_TYPE: APPLICATION_JSON}
        request.headers.update(request_headers)

        if "json" in request.headers[CONTENT_TYPE] and api != WEB_TRACKS:
            request.body = json.dumps(body)
        else:
            request.body = body[DATA]

        if len(request.body) != 0:
            if isinstance(request.body, str):
                request.headers[CONTENT_MD5] = hashlib.md5(
                    request.body.encode("utf-8")
                ).hexdigest()
            else:
                request.headers[CONTENT_MD5] = hashlib.md5(request.body).hexdigest()

        SignerV4.sign(request, self.client.service_info.credentials)

        return request

    def custom_api_call(
            self,
            api: str,
            params: dict = None,
            body: dict = None,
            request_headers: dict = None,
    ):
        """
        自定义普通http请求火山TLS接口
        """
        if request_headers is None:
            request_headers = {HEADER_API_VERSION: API_VERSION_V_0_3_0}
        elif HEADER_API_VERSION not in request_headers:
            request_headers[HEADER_API_VERSION] = API_VERSION_V_0_3_0
        if CONTENT_TYPE not in request_headers:
            request_headers[CONTENT_TYPE] = APPLICATION_JSON
        request = self.__prepare_request(api, params, body, request_headers)

        method = self.api_info[api].method
        url = request.build()

        expected_quit_timestamp = int(time.time() * 1000 + 60 * 1500)
        try_count = 0
        while True:
            try_count += 1
            try:
                # if try_count == 1:
                #     self.__logger.info("TLS client is trying to request {}.".format(api))
                response = self.client.session.request(
                    method, url, headers=request.headers, data=request.body, timeout=60
                )
            except Exception as e:
                TLSService.increase_retry_counter_by_one()
                sleep_ms = TLSService.calc_backoff_ms(expected_quit_timestamp)
                if try_count < 5 and sleep_ms > 0:
                    # HTTP请求未响应, 尝试重试
                    time.sleep(sleep_ms / 1000)
                else:
                    # 已超出重试上限, 退出
                    raise TLSException(
                        error_code=e.__class__.__name__, error_message=e.__str__()
                    )
            else:
                if response.status_code == 200:
                    # self.__logger.info("TLS client successfully got the response for requesting {}".format(api))
                    TLSService.decrease_retry_counter_by_one()

                    if "json" in response.headers[CONTENT_TYPE]:
                        if response.text != "":
                            response = json.loads(response.text)
                        else:
                            response = {}
                    else:
                        response = {DATA: response.content}
                    return response

                elif try_count < 5 and response.status_code in [429, 500, 502, 503]:
                    TLSService.increase_retry_counter_by_one()
                    sleep_ms = TLSService.calc_backoff_ms(expected_quit_timestamp)
                    if sleep_ms > 0:
                        # HTTP请求未响应, 尝试重试
                        time.sleep(sleep_ms / 1000)
                    else:
                        raise TLSException(response)
                else:
                    raise TLSException(response)

    async def custom_api_sse_call(
            self,
            api: str,
            params: dict = None,
            body: dict = None,
            request_headers: dict = None,
    ):
        """
        自定义请求sse返回数据
        """
        if request_headers is None:
            request_headers = {HEADER_API_VERSION: API_VERSION_V_0_3_0}
        elif HEADER_API_VERSION not in request_headers:
            request_headers[HEADER_API_VERSION] = API_VERSION_V_0_3_0
        if CONTENT_TYPE not in request_headers:
            request_headers[CONTENT_TYPE] = APPLICATION_JSON
        request = self.__prepare_request(api, params, body, request_headers)

        method = self.api_info[api].method
        url = request.build()

        expected_quit_timestamp = int(time.time() * 1000 + 60 * 1500)
        try_count = 0
        async with httpx.AsyncClient() as client:
            while True:
                try_count += 1
                try:
                    response = await client.request(
                        method,
                        url,
                        headers=request.headers,
                        data=request.body,
                        timeout=60,
                    )
                except Exception as e:
                    TLSService.increase_retry_counter_by_one()
                    sleep_ms = TLSService.calc_backoff_ms(expected_quit_timestamp)
                    if try_count < 5 and sleep_ms > 0:
                        # HTTP请求未响应, 尝试重试
                        time.sleep(sleep_ms / 1000)
                    else:
                        # 已超出重试上限, 退出
                        raise TLSException(
                            error_code=e.__class__.__name__, error_message=e.__str__()
                        )
                else:
                    if response.status_code == 200:
                        TLSService.decrease_retry_counter_by_one()
                        return response

                    elif try_count < 5 and response.status_code in [429, 500, 502, 503]:
                        TLSService.increase_retry_counter_by_one()
                        sleep_ms = TLSService.calc_backoff_ms(expected_quit_timestamp)
                        if sleep_ms > 0:
                            # HTTP请求未响应, 尝试重试
                            time.sleep(sleep_ms / 1000)
                        else:
                            raise TLSException(response)
                    else:
                        raise TLSException(response)
