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


def check_dir(dir_path):
    if not os.path.exists(dir_path):
        os.mkdir(dir_path)


def check_and_read_file(file_path):
    if os.path.exists(file_path):
        with open(file_path, 'r', encoding="utf-8") as fr:
            content = fr.read()
        return content
    else:
        return False
    
def write_to_file(file_path, content):
    dir_path = os.path.dirname(file_path)
    check_dir(dir_path)
    with open(file_path, 'w', encoding="utf-8") as fw:
        fw.write(content)