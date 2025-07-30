import datetime
import hashlib
import hmac
from typing import Optional, List, Literal
from urllib.parse import quote

import requests
from pydantic import BaseModel

from app.constants import ARK_SERVICE_NAME, REGION, ARK_API_VERSION, ARK_HOST, ARK_ACCESS_KEY, ARK_SECRET_KEY
from app.logger import INFO


def norm_query(params):
    query = ""
    for key in sorted(params.keys()):
        if type(params[key]) == list:
            for k in params[key]:
                query = (
                        query + quote(key, safe="-_.~") + "=" +
                        quote(k, safe="-_.~") + "&"
                )
        else:
            query = (query + quote(key, safe="-_.~") + "=" +
                     quote(params[key], safe="-_.~") + "&")
    query = query[:-1]
    return query.replace("+", "%20")


def _hmac_sha256(key: bytes, content: str):
    """
    sha256 非对称加密
    """
    return hmac.new(key, content.encode("utf-8"), hashlib.sha256).digest()


def _hash_sha256(content: str):
    """
    sha256 hash算法
    """
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


class TosLocation(BaseModel):
    BucketName: str
    ObjectKey: str


class TosConfig(BaseModel):
    BucketName: str
    PrefixPath: str


class Tag(BaseModel):
    Key: str
    Value: Optional[str]


class CreateVideoGenTaskRequest(BaseModel):
    Name: str
    TaskType: Literal["BasicMode"]
    ModelName: str
    ModelVersion: str
    FirstFrameImageTosLocation: TosLocation
    OutputTosConfig: TosConfig
    Prompt: Optional[str] = None
    ProjectName: Optional[str] = None
    Tags: Optional[List[Tag]] = None
    Ratio: Optional[str] = None
    FrameCount: Optional[int] = None
    FramesPerSecond: Optional[int] = None
    Resolution: Optional[str] = None
    CameraFixed: Optional[bool] = None


class IdOnlyBody(BaseModel):
    Id: str


class StatusModel(BaseModel):
    Phase: str
    PhaseTime: str
    RetryCount: Optional[int] = None
    Message: Optional[str] = None


class GetVideoGenTaskResponse(BaseModel):
    Id: str
    Name: str
    Prompt: Optional[str] = None
    TaskType: Literal["BasicMode"] = None
    Status: Optional[StatusModel] = None
    FirstFrameImageTosLocation: Optional[TosLocation] = None
    LastFrameImageTosLocation: Optional[TosLocation] = None
    OutputTosConfig: Optional[TosConfig] = None
    PreviousTaskId: Optional[str] = None
    ModelName: str
    ModelVersion: str
    ProjectName: Optional[str] = None
    Tags: Optional[List[Tag]] = None
    Ratio: Optional[str] = None
    FrameCount: Optional[int] = None
    FramesPerSecond: Optional[int] = None
    Resolution: Optional[str] = None
    CameraFixed: Optional[bool] = None
    QueuePosition: Optional[int] = None
    CreateTime: Optional[str] = None
    UpdateTime: Optional[str] = None


class ArkConsoleClient:
    service: str
    region: str
    access_key: str
    secret_key: str

    def __init__(self):
        self.service = ARK_SERVICE_NAME
        self.region = REGION
        self.access_key = ARK_ACCESS_KEY
        self.secret_key = ARK_SECRET_KEY

    def _request(self, action: str, body: str, query=None, header=None):
        # 创建身份证明。其中的 Service 和 Region 字段是固定的。ak 和 sk 分别代表
        # AccessKeyID 和 SecretAccessKey。同时需要初始化签名结构体。一些签名计算时需要的属性也在这里处理。
        # 初始化身份证明结构体
        if header is None:
            header = {}
        if query is None:
            query = {}
        method = "POST"
        credential = {
            "access_key_id": self.access_key,
            "secret_access_key": self.secret_key,
            "service": self.service,
            "region": self.region,
        }
        # 初始化签名结构体
        request_param = {
            "body": body,
            "host": ARK_HOST,
            "path": "/",
            "method": method,
            "content_type": "application/json",
            "date": datetime.datetime.now(datetime.timezone.utc),
            "query": {"Action": action, "Version": ARK_API_VERSION, **query},
        }
        if body is None:
            request_param["body"] = ""
        # 接下来开始计算签名。在计算签名前，先准备好用于接收签算结果的 signResult 变量，并设置一些参数。
        # 初始化签名结果的结构体
        x_date = request_param["date"].strftime("%Y%m%dT%H%M%SZ")
        short_x_date = x_date[:8]
        x_content_sha256 = _hash_sha256(request_param["body"])
        sign_result = {
            "Host": request_param["host"],
            "X-Content-Sha256": x_content_sha256,
            "X-Date": x_date,
            "Content-Type": request_param["content_type"],
        }
        # 计算 Signature 签名。
        signed_headers_str = ";".join(
            ["content-type", "host", "x-content-sha256", "x-date"]
        )
        # signed_headers_str = signed_headers_str + ";x-security-token"
        canonical_request_str = "\n".join(
            [request_param["method"].upper(),
             request_param["path"],
             norm_query(request_param["query"]),
             "\n".join(
                 [
                     "content-type:" + request_param["content_type"],
                     "host:" + request_param["host"],
                     "x-content-sha256:" + x_content_sha256,
                     "x-date:" + x_date,
                 ]
             ),
             "",
             signed_headers_str,
             x_content_sha256,
             ]
        )

        # 打印正规化的请求用于调试比对
        hashed_canonical_request = _hash_sha256(canonical_request_str)

        # 打印hash值用于调试比对
        credential_scope = "/".join([short_x_date, credential["region"],
                                     credential["service"], "request"])
        string_to_sign = "\n".join(
            ["HMAC-SHA256", x_date, credential_scope, hashed_canonical_request])

        # 打印最终计算的签名字符串用于调试比对
        k_date = _hmac_sha256(
            credential["secret_access_key"].encode("utf-8"), short_x_date)
        k_region = _hmac_sha256(k_date, credential["region"])
        k_service = _hmac_sha256(k_region, credential["service"])
        k_signing = _hmac_sha256(k_service, "request")
        signature = _hmac_sha256(k_signing, string_to_sign).hex()

        sign_result["Authorization"] = "HMAC-SHA256 Credential={}, SignedHeaders={}, Signature={}".format(
            credential["access_key_id"] + "/" + credential_scope,
            signed_headers_str,
            signature,
        )
        header = {**header, **sign_result}

        request_body = request_param["body"]
        INFO(f"Request Body: {request_body}")

        r = requests.request(method=method,
                             url="https://{}{}".format(
                                 request_param["host"], request_param["path"]),
                             headers=header,
                             params=request_param["query"],
                             data=request_param["body"],
                             )
        resp = r.json()

        response_metadata = resp.get("ResponseMetadata")
        INFO(f"Response Metadata: {response_metadata}")
        return resp

    def create_video_gen_task(self, req: CreateVideoGenTaskRequest) -> IdOnlyBody:
        resp = self._request("CreateVideoGenTask", req.model_dump_json())
        return IdOnlyBody.model_validate(resp.get("Result", {}))

    def get_video_gen_task(self, req: IdOnlyBody) -> GetVideoGenTaskResponse:
        resp = self._request("GetVideoGenTask", req.model_dump_json())
        return GetVideoGenTaskResponse.model_validate(resp.get("Result", {}))
