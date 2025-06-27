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

import logging
from typing import Dict, List

from volcengine.tls.tls_requests import SearchLogsRequest

from mcp_server_tls.resources.tls import TlsResource

logger = logging.getLogger(__name__)


class TlsQueryResource(TlsResource):
    """
    火山引擎日志搜索类
    """

    def search_logs(
            self,
            topic_id: str,
            query: str,
            limit: int,
            start_time: int,
            end_time: int,
    ) -> List[Dict]:
        """
        创建app实例
        """
        search_logs_request = SearchLogsRequest(
            topic_id,
            query=query,
            limit=limit,
            start_time=start_time,
            end_time=end_time,
        )
        response = self.client.search_logs_v2(search_logs_request)

        return response.search_result.logs


# 实例化资源
tls_query_resource = TlsQueryResource()
