#!/bin/bash
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

set -e
# shellcheck disable=SC2046
cd `dirname $0`
source ./.venv/bin/activate > /dev/null 2>&1

export VOLC_ACCESSKEY="<YOUR ACCESS KEY>"
export VOLC_SECRETKEY="<YOUR SECRET KEY>"
export ARK_API_KEY="<YOUR ARK API KEY>"
export DEFAULT_USER_ID="<YOUR ACCOUNT ID>"

# you can change port to start with another port
export _FAAS_RUNTIME_PORT=8888

echo "请输入命令："
echo "create_index: 创建向量库数据集和索引"
echo "start_server: 启动动物识别专家服务"
echo "quit: 退出"
while true; do
  read user_input
  if [ "$user_input" == "create_index" ]; then
    echo "创建向量库collection和index"
    python3 src/vikingdb_prepare.py
  elif [ "$user_input" == "start_server" ]; then
    echo "启动动物识别专家服务"
    exec python3 src/main.py
  elif [ "$user_input" == "quit" ]; then
    echo "退出程序"
    break
  else
    echo "无效的命令，请重新输入"
  fi
done
