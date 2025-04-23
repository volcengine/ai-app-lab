import logging
import requests
import random
import string
import uuid
import volcenginesdkcore
import volcenginesdkecs

from volcenginesdkcore.rest import ApiException
from abc import ABC
from .manager import (
    Manager,
    ManagerFactory,
    CreateSandboxRequest,
    DeleteSandboxRequest,
    DescribeSandboxesRequest,
    DescribeSandboxTerminalUrlRequest,
    ValidateVncTokenRequest,
)
from common.config import get_settings, Settings
from common.utils import snake_to_camel
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

class ECSCreateSandboxRequest(CreateSandboxRequest):
    instance_name: str = Field(Settings().instance_config.instance_name, description="The name of the instance", alias="InstanceName")
    instance_type: str = Field(Settings().instance_config.instance_type, description="The type of the instance", alias="InstanceType")
    zone: str = Field(Settings().instance_config.zone, description="The zone of the instance", alias="ZoneId")
    tag_key: str = Field(Settings().instance_config.tag_key, description="The key of the tag", alias="TagKey")
    tag_value: str = Field(Settings().instance_config.tag_value, description="The value of the tag", alias="TagValue")
    user_data: str = Field(Settings().instance_config.user_data, description="The user data of the instance", alias="UserData")
    image_id: str = Field(Settings().instance_config.image_id, description="The image id of the instance", alias="ImageId")
    project_name: str = Field(Settings().instance_config.project_name, description="The project name of the instance", alias="ProjectName")
    subnet_id: str = Field(Settings().instance_config.subnet_id, description="The subnet id of the instance", alias="SubnetId")
    security_group_ids: list[str] = Field(Settings().instance_config.security_group_ids, description="The security group ids of the instance", alias="SecurityGroupIds")
    password: str = Field(Settings().instance_config.password, description="The password of the instance", alias="Password")
    os_type: str = Field("Linux", description="The os type of the instance", alias="OsType")

class ECSDeleteSandboxRequest(DeleteSandboxRequest):
    sandbox_id: str = Field("", description="The sandbox id of the instance", alias="SandboxId")

class ECSDescribeSandboxesRequest(DescribeSandboxesRequest):
    sandbox_id: str = Field("", description="The sandbox ids of the instances", alias="SandboxId")

class ECSDescribeSandboxTerminalUrlRequest(DescribeSandboxTerminalUrlRequest):
    sandbox_id: str = Field("", description="The sandbox id of the instance", alias="SandboxId")

class ECSValidateVncTokenRequest(ValidateVncTokenRequest):
    token: str = Field("", description="The token of the instance", alias="Token")

class WindowsChangePasswordRequest(BaseModel):
    ip: str = Field("", description="The ip of the instance")
    username: str = Field("ecs", description="The username of the instance")
    password: str = Field("", description="The password of the instance")

class ECS(Manager):
    def __init__(self, 
        access_key: str = get_settings().mgr.access_key, 
        secret_key: str = get_settings().mgr.secret_key, 
        region: str = get_settings().mgr.region,
        host: str = get_settings().mgr.host
    ):
        super().__init__()
        self._access_key = access_key
        self._secret_key = secret_key
        self._region = region
        self._host = host
        self._api = self._init_volcengine_sdk()

    def _init_volcengine_sdk(self):
        configuration = volcenginesdkcore.Configuration()
        configuration.ak = self._access_key
        configuration.sk = self._secret_key
        configuration.region = self._region
        configuration.host = self._host
        volcenginesdkcore.Configuration.set_default(configuration)
        return volcenginesdkecs.ECSApi()

    def get_manager_request_name(self,action: str):
        return globals().get(f"ECS{snake_to_camel(action)}Request")
    

    def create_sandbox(self, request: ECSCreateSandboxRequest):
        try:
            # TODO: Validate AccountQuota in volcengine

            if request.os_type == "Windows":
                request.image_id = get_settings().instance_config.windows_image_id

            response = self._api.run_instances(volcenginesdkecs.RunInstancesRequest(
                instance_name=f"sandbox-{request.instance_name}",
                instance_type=request.instance_type,
                password=request.password,
                zone_id=request.zone,
                tags=[volcenginesdkecs.TagForRunInstancesInput(
                    key=request.tag_key,
                    value=request.tag_value,
                )],
                user_data=request.user_data,
                image_id=request.image_id,
                project_name=request.project_name,
                volumes=[volcenginesdkecs.VolumeForRunInstancesInput(
                    volume_type="ESSD_PL0",
                    size=40,
                )],
                network_interfaces=[volcenginesdkecs.NetworkInterfaceForRunInstancesInput(
                    subnet_id=request.subnet_id,
                    security_group_ids=request.security_group_ids,
                )],
            ))
        except ApiException as e:
            logger.error(f"Error creating sandbox: {e}")
            raise e
        return {"SandboxId": response.instance_ids[0]}

    def delete_sandbox(self, request: ECSDeleteSandboxRequest):
        try:
            response = self._api.delete_instance(volcenginesdkecs.DeleteInstanceRequest(
                instance_id=request.sandbox_id,
            ))
        except ApiException as e:
            logger.error(f"Error deleting sandbox: {e}")
            raise e
        return {"SandboxId": request.sandbox_id}
    
    def describe_sandboxes(self, request: ECSDescribeSandboxesRequest):
        try:
            req = volcenginesdkecs.DescribeInstancesRequest(
                project_name=get_settings().instance_config.project_name,
                tag_filters=[volcenginesdkecs.TagFilterForDescribeInstancesInput(
                    key=get_settings().instance_config.tag_key,
                    values=[get_settings().instance_config.tag_value],
                )],
            )
            if len(request.sandbox_id) > 0:
                req.instance_ids = [request.sandbox_id]
            response = self._api.describe_instances(req)
            ret = []
            for instance in response.instances:
                ret.append({
                    "SandboxId": instance.instance_id,
                    "PrimaryIp": instance.network_interfaces[0].primary_ip_address,
                    "Status": instance.status,
                    "OsType": instance.os_type,
                    "InstanceTypeId": instance.instance_type_id,
                })
        except ApiException as e:
            logger.error(f"Error describing sandbox: {e}")
            raise e
        return ret

    def describe_sandbox_terminal_url(self, request: ECSDescribeSandboxTerminalUrlRequest):
        try:
            response = self._api.describe_instances(volcenginesdkecs.DescribeInstancesRequest(
                instance_ids=[request.sandbox_id]
            ))
            if len(response.instances) == 0:
                raise Exception(f"Sandbox {request.sandbox_id} not found")
            instance = response.instances[0]
            if instance.status != "RUNNING":
                raise Exception(f"Sandbox {request.sandbox_id} is not running")
            ret = {}
            if instance.os_type == "Windows":
                response = self._api.describe_instance_ecs_terminal_url(volcenginesdkecs.DescribeInstanceECSTerminalUrlRequest(
                    instance_id=request.sandbox_id,
                ))
                ret["Url"] = response.ecs_terminal_url
                ret["OsType"] = "Windows"
                ret["WindowsKey"] = self._generate_random_password()
                logger.debug(f"Changing windows password for {instance} {ret}")
                self._change_windows_password(WindowsChangePasswordRequest(
                    ip=instance.network_interfaces[0].primary_ip_address,
                    username="ecs",
                    password=self._generate_random_password(),
                ))
            else:
                token = str(uuid.uuid4())
                _ = self._api.tag_resources(volcenginesdkecs.TagResourcesRequest(
                    resource_ids=[request.sandbox_id],
                    resource_type="instance",
                    tags=[volcenginesdkecs.TagForTagResourcesInput(
                        key="vnc-token",
                        value=token,
                    )],
                ))
                ret["Token"] = token
                ret["OsType"] = "Linux"
        except ApiException as e:
            logger.error(f"Error describing sandbox terminal url: {e}")
            raise e
        return ret
    
    def validate_vnc_token(self, request: ECSValidateVncTokenRequest):
        try:
            response = self._api.describe_instances(volcenginesdkecs.DescribeInstancesRequest(
                project_name=get_settings().instance_config.project_name,
                tag_filters=[volcenginesdkecs.TagFilterForDescribeInstancesInput(
                    key="vnc-token",
                    values=[request.token],
                )],
            ))
            if len(response.instances) == 0:
                raise Exception(f"Sandbox with token {request.token} not found")
            instance = response.instances[0]
            if instance.status != "RUNNING":
                raise Exception(f"Sandbox with token {request.token} is not running")
            _ = self._api.untag_resources(volcenginesdkecs.UntagResourcesRequest(
                resource_ids=[instance.instance_id],
                resource_type="instance",
                tag_keys=["vnc-token"],
            ))
        except ApiException as e:
            logger.error(f"Error validating vnc token: {e}")
            raise e
        return {"host": instance.network_interfaces[0].primary_ip_address, "port": 5905}

    
    def _change_windows_password(self, request: WindowsChangePasswordRequest):
        # TODO: Use New Params
        resp = requests.get(f"http://{request.ip}:8112?Action=ChangePassword&Version=2020-04-01&UserName={request.username}&NewPass={request.password}")
        if resp.status_code != 200:
            raise Exception(f"Error changing windows password: {resp.text}")
        return resp.text

    def _generate_random_password(self):
        return ''.join(random.choices(string.ascii_letters + string.digits, k=16))

    
class ECSManagerFactory(ManagerFactory):
    @classmethod
    def create_manager(cls) -> Manager:
        return ECS()
