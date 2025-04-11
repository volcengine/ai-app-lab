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
from util.trivials import check_dir, check_and_read_file

from prompt import WEBSITE_META_PROMPT, VLM_OCR_PROMPT, LLM_STOCK_NEWS_PROMPT, \
    NEWS_PREDICTON_HEADER, NEWS_SUMMERIZE_HEADER_PROMTP, NEWS_SUMMERIZE_PROMTP, \
    MONEY_PREDICTON_HEADER, LLM_STOCK_MONEY_PROMPT, MONEY_NEWS_SUMMERIZATION_PREDICTON_HEADER 
from .base_api import BaseAPI


DIR_PATH = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
HISTORY_DIR_PATH = os.path.join(DIR_PATH, "history_data")


class StocksPredictionTask(BaseAPI):
    def __init__(self, ):
        super().__init__()
        self.gs_obj = GetScreenshot()

    def run(self):
        today = get_today()
        for char in self.run_news_prediction():
            yield char

        time.sleep(3)
        file_path = f"{today}/news/predicted_stocks_from_news.txt"
        predicted_stocks_from_news = check_and_read_file(os.path.join(HISTORY_DIR_PATH, file_path))
        for char in self.run_money_prediction(website_news=predicted_stocks_from_news):
            yield char


    def run_news_prediction(self):
        today = get_today()

        # 消息侧股票预测, header
        for char in NEWS_PREDICTON_HEADER.render(today=today):
            yield char

        # step 1: get screenshots
        directory = self.gs_obj.get_all_screenshots("news")

        ocr_response_dict = {}
        all_content_string = []
        # step 2: call vlm
        news_image_file_list = os.listdir(directory)
        for idx, image_file in enumerate(news_image_file_list):
            image_base64 = BaseAPI._read_image_2_base64(
                os.path.join(directory, image_file))

            # to extract news
            ocr_response = self.call_vlm(image_base64, VLM_OCR_PROMPT)

            key = image_file.split('.')[0]
            meta_info = self.gs_obj._get_website_page_meta(key)
            # pdb.set_trace()

            ocr_response_dict.update(
                {key: [WEBSITE_META_PROMPT.render(
                    website_page_num=idx,
                    website_page_name=meta_info['name'],
                    website_page_url=meta_info['url']
                ), ocr_response]}
            )

            # step 3: call llm
            for char in WEBSITE_META_PROMPT.render(
                website_page_num=idx+1,
                website_page_name=meta_info['name'],
                website_page_url=meta_info['url']
            ):
                all_content_string.append(char)
                yield char

            for char in self.call_llm(LLM_STOCK_NEWS_PROMPT.render(website_news=ocr_response)):
                all_content_string.append(char)
                yield char

        # step 4: summerize all news and stocks.
        for char in NEWS_SUMMERIZE_HEADER_PROMTP:
            yield char

        all_content_string = "".join(all_content_string)
        predicted_stocks_from_news = []
        for char in self.call_llm(NEWS_SUMMERIZE_PROMTP.render(website_news=all_content_string)):
            predicted_stocks_from_news.append(char)
            yield char
        predicted_stocks_from_news = ''.join(predicted_stocks_from_news)
        
        file_path = f"{today}/news/predicted_stocks_from_news.txt"
        check_dir(os.path.join(HISTORY_DIR_PATH, os.path.dirname(file_path)))
        with open(os.path.join(HISTORY_DIR_PATH, file_path), 'w', encoding="utf-8") as fw:
            fw.write(predicted_stocks_from_news)

        file_path = f"{today}/news/{meta_info['name']}.txt"
        file_content = WEBSITE_META_PROMPT.render(
            website_page_num=idx,
            website_page_name=meta_info['name'],
            website_page_url=meta_info['url']) + ocr_response
        with open(os.path.join(HISTORY_DIR_PATH, file_path), 'w', encoding='utf-8') as fw:
            fw.write(file_content)

    def run_money_prediction(self, website_news="null"):
        today = get_today()

        # 资金侧预测
        for char in MONEY_PREDICTON_HEADER.render(today=today):
            yield char

        # step 1: get screenshots
        directory = self.gs_obj.get_all_screenshots("money")

        ocr_response_list = []
        # step 2: call vlm
        money_image_file_list = os.listdir(directory)
        for idx, image_file in enumerate(money_image_file_list):
            # read meta data
            key = image_file.split('.')[0]
            meta_info = self.gs_obj._get_website_page_meta(key)
            # pdb.set_trace()

            file_path = f"{today}/money/{meta_info['key']}.txt"
            res = check_and_read_file(os.path.join(HISTORY_DIR_PATH, file_path))
            if res != False:
                ocr_response_list.append(res)
                continue

            check_dir(os.path.join(HISTORY_DIR_PATH, os.path.dirname(file_path)))

            image_base64 = BaseAPI._read_image_2_base64(
                os.path.join(directory, image_file))

            # to extract stock price table
            ocr_response = self.call_vlm(image_base64, VLM_OCR_PROMPT)

            file_content = WEBSITE_META_PROMPT.render(
                website_page_num=idx,
                website_page_name=meta_info['name'],
                website_page_url=meta_info['url']) + ocr_response
            with open(os.path.join(HISTORY_DIR_PATH, file_path), 'w', encoding='utf-8') as fw:
                fw.write(file_content)

            ocr_response_list.append(file_content)

        ocr_all_response_content = ''.join(ocr_response_list)

        # step 3: call llm to analyze and summerize which stock would increase
        for char in MONEY_NEWS_SUMMERIZATION_PREDICTON_HEADER.render(today=today):
            yield char

        predicted_stocks_from_money = []
        for char in self.call_llm(LLM_STOCK_MONEY_PROMPT.render(
                website_news=website_news, website_money=ocr_all_response_content)):
            predicted_stocks_from_money.append(char)
            yield char


if __name__ == "__main__":

    qt_obj = StocksPredictionTask()
    for char in qt_obj.run():
        # for char in output:
        print(char, end='', flush=True)
