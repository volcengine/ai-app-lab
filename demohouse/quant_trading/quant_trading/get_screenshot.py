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
import pdb
import time
import yaml
import asyncio

from selenium import webdriver
from selenium.webdriver.chrome.service import Service

from util.date_time import get_today, TimeIt
from util.trivials import check_dir
from functools import wraps


DIR_PATH = os.path.dirname(os.path.dirname(__file__))


def retry_decorator(max_retries=3, delay=1):
    """
    重试装饰器，用于在函数调用失败时进行重试

    :param max_retries: 最大重试次数，默认为3次
    :param delay: 每次重试之间的延迟时间（秒），默认为1秒
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            retries = 0
            while retries < max_retries:
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    retries += 1
                    if retries >= max_retries:
                        print(f"达到最大重试次数 ({max_retries}次)，请求失败。")
                        # raise  # 抛出异常，调用者可以处理
                    else:
                        print(f"请求失败，正在重试 ({retries}/{max_retries})...")
                        time.sleep(delay)
            return None  # 如果所有重试都失败，返回 None 或其他默认值
        return wrapper
    return decorator


class GetScreenshot(object):
    """
    get screenshot from various websites concerning stockmarket,
    you can define websites you are interested in, in `config.yaml`
    """
    def __init__(self):
        self.website_metadata = {}
        with open(os.path.join(DIR_PATH, 'info_config.yaml'), 'r') as file:
            self.website_metadata = yaml.safe_load(file)

        # pdb.set_trace()
        # print(self.website_metadata)

    def _get_website_page_meta(self, key):
        # get the meta info from key
        for k, value_list in self.website_metadata.items():
            for val in value_list:
                if key == val['key']:
                    return val
        return None

    def _get_type_website_keys(self, type_key):
        return [item['key'] for item in self.website_metadata[type_key]]

    @staticmethod
    @retry_decorator(max_retries=3, delay=1)
    def get_screenshot(website_item, today, type_key):
    # async def get_screenshot_async(website_item):

        url = website_item['url']
        print(website_item['key'], url)
        # url = "https://www.baidu.com"
        option = webdriver.ChromeOptions()
        option.add_argument('headless')

        service = Service(executable_path=os.path.join(DIR_PATH, 'chromedriver-linux64/chromedriver'))

        driver = webdriver.Chrome(options=option, service=service)

        # driver = webdriver.Chrome()
        # driver.execute_cdp_cmd(
        #     "Network.setExtraHTTPHeaders",
        #     {
        #         "headers": {
        #             "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6998.88 Safari/537.36",
        #             "Accept-Language": "en-US,en;q=0.9",
        #             "Accept-Encoding": "gzip, deflate, br"
        #         }
        #     }
        # )
        driver.set_page_load_timeout(20)  # 设置超时时间
        driver.get(url)
        width = driver.execute_script("return document.documentElement.scrollWidth")
        height = driver.execute_script("return document.documentElement.scrollHeight")

        driver.set_window_size(width, height)
        crop = website_item.get('crop', False)
        if crop:
            pass  # 截取图片的部分

        file_path = os.path.join(DIR_PATH, f"history_data/{today}/screenshot/{type_key}/{website_item['key']}.png")
        check_dir(os.path.dirname(file_path))
        driver.get_screenshot_as_file(file_path)
        driver.quit()
        
        return file_path

    def get_all_screenshots(self, type_key):

        today = get_today()
        directory = os.path.join(DIR_PATH, f"history_data/{today}/screenshot/{type_key}")
        if not os.path.exists(directory):
            os.makedirs(directory)

        if type_key not in self.website_metadata:
            raise ValueError(f"`{type_key}` is invalid.")

        for website_item in self.website_metadata[type_key]:
            website_key = website_item['key']
            if os.path.exists(os.path.join(DIR_PATH,
                    f"history_data/{today}/screenshot/{type_key}/{website_item['key']}.png")):
                continue

            with TimeIt(f'{website_key} screenshot') as ti:
                res = GetScreenshot.get_screenshot(website_item, today, type_key)

        return directory  # 表示已完成


if __name__ == "__main__":
    gs = GetScreenshot()
    gs.get_all_screenshots()
