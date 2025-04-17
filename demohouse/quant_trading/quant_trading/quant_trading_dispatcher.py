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
import re
import pdb
import json
import time
import base64

from openai import OpenAI
from get_screenshot import GetScreenshot
from util.date_time import get_today
from util.trivials import check_dir, check_and_read_file

from config import VLM_MODEL_NAME, LLM_MODEL_NAME, ARK_API_KEY
from prompt import WEBSITE_META_PROMPT, VLM_OCR_PROMPT, LLM_STOCK_NEWS_PROMPT, \
    DISPATCHER_TASK_PROMPT, NEWS_SUMMERIZE_HEADER_PROMTP, NEWS_SUMMERIZE_PROMTP
from task.base_api import BaseAPI
from task import StocksPredictionTask, IndividualStockPredictionTask

DIR_PATH = os.path.dirname(os.path.dirname(__file__))
HISTORY_DIR_PATH = os.path.join(DIR_PATH, "history_data")


class QuantTradingDispatcher(BaseAPI):
    def __init__(self, ):
        super().__init__()
        with open(os.path.join(DIR_PATH, 'quant_trading/data/stock_dictionary.txt'), 'r', encoding='utf-8') as fr:
            content = fr.readlines()

        self.stock_name_id_dict = {}
        for item in content:
            stock_name, stock_id = item.strip().split('\t')
            if '-' in stock_name:
                stock_name = stock_name.split('-')[0]
            self.stock_name_id_dict.update({stock_name: stock_id})
        # pdb.set_trace()
        # self.stock_name_ptn = re.compile('(' + '|'.join([item for item in list(self.stock_name_id_dict.keys())]) + ')')
        # self.stock_id_ptn = re.compile('(' + '|'.join([item.strip().split('\t')[1] for item in content]) + ')')
        self.task_dispater_ptn = re.compile('\d')

    def run(self, user_question):

        dispater_result_list = []
        for char in self.call_llm(DISPATCHER_TASK_PROMPT.render(user_question=user_question)):
            dispater_result_list.append(char)

        dispater_result = ''.join(dispater_result_list)

        matched_dispater_result = self.task_dispater_ptn.search(dispater_result)
        print("匹配结果：", matched_dispater_result)
        if matched_dispater_result is None:
            result_list = []
            for char in self.call_llm(user_question):
                yield char
                result_list.append(char)
        else:
            matched_dispater_result = matched_dispater_result.group()
            if matched_dispater_result == '1':
                spt_obj = StocksPredictionTask()
                for char in spt_obj.run():
                    yield char

            elif matched_dispater_result == '2':
                ispt_obj = IndividualStockPredictionTask()
                cur_stock_name = None
                for stock_name, stock_id in self.stock_name_id_dict.items():
                    if stock_name in user_question:
                        cur_stock_name = stock_name
                        break

                stock_meta = {'stock_name': cur_stock_name, 'stock_id': self.stock_name_id_dict[cur_stock_name]}
                # find the stock meta for the task
                # pdb.set_trace()
                for char in ispt_obj.run(stock_meta):
                    yield char
            else:
                result_list = []
                for char in self.call_llm(user_question):
                    result_list.append(char)
                    yield char



if __name__ == "__main__":

    qt_obj = QuantTradingDispatcher()
    user_input = "预测一下今天股票"  # 1
    user_input = "山西焦煤应该买吗？今天"  # 2
    for char in qt_obj.run(user_input):
        # for char in output:
        print(char, end='', flush=True)
