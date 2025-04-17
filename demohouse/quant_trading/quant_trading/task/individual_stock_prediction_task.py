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
import json
import time
import base64

from get_screenshot import GetScreenshot
from util.date_time import get_today
from util.trivials import check_dir, check_and_read_file, write_to_file

from prompt import WEBSITE_META_PROMPT, VLM_OCR_PROMPT, \
    STOCK_PREDICTON_HEADER, STOCK_PREDICTION_PROMPT
from .base_api import BaseAPI


DIR_PATH = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
HISTORY_DIR_PATH = os.path.join(DIR_PATH, "history_data")


class IndividualStockPredictionTask(BaseAPI):
    def __init__(self, ):
        super().__init__()
        self.response_dict = {}
        self.gs_obj = GetScreenshot()

    def run_get_screenshot_and_ocr(self, stock_item, type):
        # step: get news screenshot and text
        today = get_today()

        # step 1: analyze the stock name and id
        website_item = self.gs_obj.website_metadata['individual_stock'][type][0]
        website_item['url'] = website_item['url'].format(stock_item['stock_id'])
        type_key = stock_item['stock_id']

        # step 2: get news screenshot
        news_image_file = self.gs_obj.get_screenshot(website_item, today, type_key)

        # step 3: call vlm
        image_base64 = BaseAPI._read_image_2_base64(news_image_file)
        # to extract news
        ocr_response = self.call_vlm(image_base64, VLM_OCR_PROMPT)

        self.response_dict.update(
            {website_item['key']: [WEBSITE_META_PROMPT.render(
                website_page_num=type_key,
                website_page_name=website_item['name'],
                website_page_url=website_item['url']
            ), ocr_response]}
        )

        for char in WEBSITE_META_PROMPT.render(
            website_page_num="{} {}".format(stock_item["stock_name"], type_key),
            website_page_name="{} {}".format(stock_item["stock_name"], website_item['name']),
            website_page_url=website_item['url']
        ):
            yield char

    def run(self, stock_item):
        today = get_today()
        self.response_dict = {}
        stock_meta = "{} {}".format(stock_item['stock_name'], stock_item['stock_id'])
        # 个股预测提示等待
        for char in STOCK_PREDICTON_HEADER.render(stock_meta=stock_meta, today=today):
            yield char

        # step 1: get news screenshot and text
        for char in self.run_get_screenshot_and_ocr(stock_item, "news"):
            yield char

        # step 2: get money screenshot and text
        for char in self.run_get_screenshot_and_ocr(stock_item, "money"):
            yield char

        # step 3: call llm

        news_website_meta = self.gs_obj.website_metadata['individual_stock']['news'][0]
        money_website_meta = self.gs_obj.website_metadata['individual_stock']['money'][0]

        stock_prediction_prompt = STOCK_PREDICTION_PROMPT.render(
            website_news=self.response_dict[news_website_meta['key']][1],
            website_money=self.response_dict[money_website_meta['key']][1],
            today=today,
            stock_meta=stock_meta
        )
        predicted_result_list = []
        for char in self.call_llm(stock_prediction_prompt):
            predicted_result_list.append(char)
            yield char


        write_to_file(
            os.path.join(HISTORY_DIR_PATH, f"{today}/{stock_item['stock_id']}/predicted_result.txt"),
            ''.join(predicted_result_list))
        write_to_file(
            os.path.join(HISTORY_DIR_PATH, f"{today}/{stock_item['stock_id']}/news_ocr_result.txt"),
            self.response_dict[news_website_meta['key']][1])
        write_to_file(
            os.path.join(HISTORY_DIR_PATH, f"{today}/{stock_item['stock_id']}/money_ocr_result.txt"),
            self.response_dict[money_website_meta['key']][1])


if __name__ == "__main__":

    qt_obj = IndividualStockPredictionTask()
    stock_item = {'stock_name': '山西焦煤', 'stock_id': '000983'}
    for char in qt_obj.run(stock_item):
        # for char in output:
        print(char, end='', flush=True)
