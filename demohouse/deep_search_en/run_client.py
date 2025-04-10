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

from openai import OpenAI

client = OpenAI(base_url="http://localhost:8888/api/v3/bots", api_key="{API_KEY}")


def main():
    # stream run
    stream_resp = client.chat.completions.create(
        model="test",
        messages=[
            {
                "role": "user",
                "content": "research on latest trending projects related to LLM application development",
            }
        ],
        stream=True,
    )

    thinking = False

    for chunk in stream_resp:
        if chunk.choices[0].delta.model_extra.get("reasoning_content"):
            if not thinking:
                print("\n----Thinking Process----\n")
                thinking = True
            content = chunk.choices[0].delta.model_extra.get("reasoning_content", "")
            print(content, end="", flush=True)
        elif chunk.choices[0].delta.content:
            if thinking:
                print("\n----Final Answer----\n")
                thinking = False
            print(chunk.choices[0].delta.content, end="", flush=True)


if __name__ == "__main__":
    main()
