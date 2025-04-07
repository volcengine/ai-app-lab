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

import pdb
import time
import random
import asyncio
import logging
import gradio as gr
from gradio import ChatMessage
from typing import Any, Generator

from config import (ARK_API_ADDR, LLM_MODEL_NAME,
                    WEB_SERVER_IP, WEB_SERVER_PORT)
from quant_trading_dispatcher import QuantTradingDispatcher


init_message = "哈喽，我可以帮你预测今天该买哪些股票，回答股票相关问题。"
system_item = {"role": "system", "content": "你是股票量化交易智能助手"}


block_css = """.importantButton {
    background: linear-gradient(45deg, #7e0570,#5d1c99, #6e00ff) !important;
    border: none !important;
}
.importantButton:hover {
    background: linear-gradient(45deg, #ff00e0,#8500ff, #6e00ff) !important;
    border: none !important;
}"""

default_theme_args = dict(
    font=["Source Sans Pro", 'ui-sans-serif', 'system-ui', 'sans-serif'],
    font_mono=['IBM Plex Mono', 'ui-monospace', 'Consolas', 'monospace'],
)


def user_input(message, chat_history):
    print("user_input: ", chat_history)
    return "", chat_history + [[message, None]]


def bot(history):
    # pdb.set_trace()
    print("bot: ", history)
    history[-1][1] = ""

    qt_obj = QuantTradingDispatcher()
    for char in qt_obj.run(history[-1][0]):
        history[-1][1] += char
        yield history
        # print(char, end='', flush=True)


def clear(chat_history):
    chat_history = [system_item]
    return chat_history


# if __name__ == "__main__":
with gr.Blocks(css=block_css, theme=gr.themes.Default(**default_theme_args)) as demo:

    gr.Markdown('# Arkitect 股票 AI 量化交易助手')

    with gr.Column(scale=10):
        chatbot = gr.Chatbot([[None, init_message]],
                             elem_id="chat-box",
                             label="聊天历史")
        query = gr.Textbox(label="输入问题",
                           placeholder="请输入提问内容，按回车进行提交")
        clear_button = gr.Button("重新对话", visible=True)

    # pdb.set_trace()
    query.submit(user_input, [query, chatbot], [query, chatbot], queue=False)  \
        .then(bot, chatbot, chatbot)
    clear_button.click(fn=clear,
                    inputs=[chatbot],
                    outputs=[chatbot])

# 启动应用
demo.launch(server_name="0.0.0.0", server_port=WEB_SERVER_PORT)
