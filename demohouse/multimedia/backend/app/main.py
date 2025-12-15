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

import requests
import json
import traceback
import logging
import time
import os

test_dict = {
    "local": "http://localhost:8004/{}",  # 0: do not use
}

# 全局变量，用于存储 URL 模板
url_template = test_dict["local"]


def save_result(result, filename):
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=4)


def create_session(app_name, user_id):
    url = url_template.format(f"apps/{app_name}/users/{user_id}/sessions")

    payload = {}
    headers = {}

    response = requests.request("POST", url, headers=headers, data=payload)

    session_id = json.loads(response.text)["id"]
    logger.info(f"main output: session_id: {session_id}")
    return session_id


def pick_best_image(evaluate_image_result):
    best_image_list = []
    scored_image_list = evaluate_image_result["scored_image_list"]
    for shot in scored_image_list:
        # 从 images 列表中挑选最高分的那一张，将分数从字符串转换为浮点数
        best_image = max(shot["images"], key=lambda x: max(float(x.get("score")), 0))

        # 构造新的 shot 结构
        best_shot = {
            "shot_id": shot["shot_id"],
            "prompt": shot["prompt"],
            "action": shot["action"],
            "reference": shot["reference"],
            "words": shot["words"],
            "image": {"id": best_image["id"], "url": best_image["url"]},
        }

        best_image_list.append(best_shot)
    return best_image_list


def pick_best_video(evaluate_video_result):
    best_video_list = []
    scored_video_list = evaluate_video_result["scored_video_list"]

    for shot in scored_video_list:
        # 从 videos 列表中挑选最高分的那一张，将分数从字符串转换为浮点数
        best_video = max(shot["videos"], key=lambda x: max(float(x.get("score")), 0))

        # 构造新的 shot 结构
        best_shot = {
            "shot_id": shot["shot_id"],
            "prompt": shot["prompt"],
            "action": shot["action"],
            "reference": shot["reference"],
            "words": shot["words"],
            "video": {"id": best_video["id"], "url": best_video["url"]},
        }

        best_video_list.append(best_shot)
    return best_video_list


def run_sse(app_name, user_id, session_id, text):
    url = url_template.format("run_sse")
    # logger.info(f"main output: run_sse url: {url}")
    payload = json.dumps(
        {
            "app_name": app_name,
            "user_id": user_id,
            "session_id": session_id,
            "new_message": {"role": "user", "parts": [{"text": text}]},
        }
    )
    headers = {"Content-Type": "application/json"}

    try:
        # ❶ 去掉 stream=True，直接等完整响应
        response = requests.post(url, headers=headers, data=payload, timeout=6000)
        response.raise_for_status()  # 如果返回 4xx / 5xx，会抛出异常
        logger.info(f"原始响应: {response.text[:500]}...")  # 打印前500字符防止太长

        # ❷ 按行解析最后一个 data: 块（因为服务器仍返回 SSE 格式）
        data_lines = [
            line for line in response.text.splitlines() if line.startswith("data: ")
        ]
        if not data_lines:
            logger.warning("未找到任何 data: 块")
            return None

        last_data = data_lines[-1][6:]  # 去掉 'data: ' 前缀
        event = json.loads(last_data)
        logger.info(
            f"最后一个 event: {json.dumps(event, ensure_ascii=False, indent=2)}"
        )

        # ❸ 提取最终内容（如果结构固定）
        return event["content"]["parts"][0]["text"]

    except requests.exceptions.Timeout:
        logger.error("请求超时（超过6000秒）")
    except requests.exceptions.RequestException as e:
        logger.error(f"请求失败: {e}")
    except (KeyError, json.JSONDecodeError) as e:
        logger.error(f"解析响应失败: {e}")

    return None


def main(user_need):
    # step 0: create session
    try:
        logger.info("main output: 0. 创建 session...")
        session_id = create_session("demo_app", "user")
        save_result(session_id, tmp_json_dir + "0_session_id.json")
    except Exception as e:
        logger.info(f"main output: 0. create session failed: {e}")
        traceback.print_exc()
        return

    # step 1: generate video config
    try:
        logger.info("main output: 1. 生成视频配置...")
        generate_video_config_input = user_need + "\n生成视频配置"
        video_config = run_sse(
            "demo_app", "user", session_id, generate_video_config_input
        )
        logger.info(f"main output: 1. video_config: {video_config}")
        save_result(json.loads(video_config), tmp_json_dir + "1_video_config.json")
    except Exception as e:
        logger.info(f"main output: 1. run sse failed: {e}")
        traceback.print_exc()
        return

    # step 1.1: parse video_type
    try:
        logger.info("main output: 1.1 解析video_type...")
        logger.info(f"main output: 1.1 video_config: {video_config}")
        video_type = json.loads(video_config)["video_type"]
    except Exception as e:
        logger.info(f"main output: 1.1 get video_type failed: {e}")
        traceback.print_exc()
        return

    # step 2: generate shot list
    try:
        logger.info("main output: 2. 生成分镜脚本...")
        generate_shot_list_input = (
            "请根据如下video_config，生成分镜脚本\n\n" + video_config
        )
        shot_list = run_sse("demo_app", "user", session_id, generate_shot_list_input)
        logger.info(f"main output: 2. shot_list: {shot_list}")
        save_result(json.loads(shot_list), tmp_json_dir + "2_shot_list.json")
    except Exception as e:
        logger.info(f"main output: 2. run sse failed: {e}")
        traceback.print_exc()
        return

    # step 3: generate image list
    try:
        logger.info("main output: 3. 生成分镜图片...")
        generate_image_list_input = "请根据如下shot_list，生成分镜图片\n\n" + shot_list
        image_list = run_sse("demo_app", "user", session_id, generate_image_list_input)
        logger.info(f"main output: 3. image_list: {image_list}")
        save_result(json.loads(image_list), tmp_json_dir + "3_image_list.json")
    except Exception as e:
        logger.info(f"main output: 3. run sse failed: {e}")
        traceback.print_exc()
        return

    # step 4: evaluate image list
    try:
        logger.info("main output: 4. 评估分镜图片...")
        evaluate_image_list_input = (
            "请根据如下分镜图片列表image_list，评估分镜图片的质量\n\n" + image_list
        )
        evaluate_image_result = run_sse(
            "demo_app", "user", session_id, evaluate_image_list_input
        )
        logger.info(f"main output: 4. evaluate_image_result: {evaluate_image_result}")
        save_result(
            json.loads(evaluate_image_result),
            tmp_json_dir + "4_evaluate_image_list.json",
        )
    except Exception as e:
        logger.info(f"main output: 4. run sse failed: {e}")
        traceback.print_exc()
        return

    # step 4.1: pick best image
    try:
        logger.info("main output: 4.1 选择最佳分镜图片...")
        best_image_list = pick_best_image(json.loads(evaluate_image_result))
        save_result(best_image_list, tmp_json_dir + "4_1_selected_image_list.json")
        logger.info(f"main output: 4.1 best_image_list: {best_image_list}")
    except Exception as e:
        logger.info(f"main output: 4.1 pick best image failed: {e}")
        traceback.print_exc()
        return

    # step 5: generate video list
    try:
        logger.info("main output: 5. 生成分镜视频...")
        generate_video_list_input = (
            "请根据如下image_list，生成分镜视频、每个shot生成4个视频\n\n"
            + str(best_image_list)
        )
        video_list = run_sse("demo_app", "user", session_id, generate_video_list_input)
        logger.info(f"main output: 5. video_list: {video_list}")
        save_result(json.loads(video_list), tmp_json_dir + "5_video_list.json")
    except Exception as e:
        logger.info(f"main output: 5. run sse failed: {e}")
        traceback.print_exc()
        return

    # step 6: evaluate video list
    try:
        logger.info("main output: 6. 评估分镜视频...")
        evaluate_video_list_input = (
            "请根据如下分镜视频列表video_list，评估分镜视频的质量\n\n" + str(video_list)
        )
        logger.info(
            f"main output: 6. evaluate_video_list_input: {evaluate_video_list_input}"
        )
        evaluate_video_result = run_sse(
            "demo_app", "user", session_id, evaluate_video_list_input
        )
        logger.info(f"main output: 6. evaluate_video_result: {evaluate_video_result}")
        save_result(
            json.loads(evaluate_video_result),
            tmp_json_dir + "6_evaluate_video_list.json",
        )
    except Exception as e:
        logger.info(f"main output: 6. run sse failed: {e}")
        traceback.print_exc()
        return

    # step 6.1: pick best video
    try:
        logger.info("main output: 6.1 选择最佳分镜视频...")
        best_video_list = pick_best_video(json.loads(evaluate_video_result))
        save_result(best_video_list, tmp_json_dir + "6_1_selected_video_list.json")
        logger.info(f"main output: 6.1 best_video_list: {best_video_list}")
    except Exception as e:
        logger.info(f"main output: 6.1 pick best video failed: {e}")
        traceback.print_exc()
        return

    # step 7: generate final video
    try:
        logger.info("main output: 7. 生成最终视频...")
        generate_final_video_input = f"进行{video_type}视频的合成\n\n" + str(
            best_video_list
        )

        logger.info(f"main output: 7. session_id: {session_id}")
        logger.info(
            f"main output: 7. generate_final_video_input: {generate_final_video_input}"
        )

        final_video = run_sse(
            "demo_app", "user", session_id, generate_final_video_input
        )
        logger.info(f"main output: 7. final_video: {final_video}")
        save_result(final_video, tmp_json_dir + "7_final_video.json")
    except Exception as e:
        logger.info(f"main output: 7. run sse failed: {e}")
        traceback.print_exc()
        return


if __name__ == "__main__":
    # 设置默认运行模式为 local
    t_type = "local"

    # 创建临时目录
    time_start = t_type + "-" + str(time.time())
    tmp_json_dir = "tmp-json/" + str(time_start) + "/"
    os.makedirs(tmp_json_dir, exist_ok=True)

    # 设置日志
    log_name = time.time()
    log_file_path = tmp_json_dir + "full/"
    os.makedirs(log_file_path, exist_ok=True)
    log_file_name = log_file_path + str(log_name) + ".log"

    logging.basicConfig(
        level=logging.DEBUG,
        format="%(asctime)s [%(levelname)s]: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[
            logging.FileHandler(log_file_name, encoding="utf-8"),  # 写入文件
            logging.StreamHandler(),  # 输出到控制台
        ],
    )
    logger = logging.getLogger(__name__)

    user_need = "帮我生成杨梅饮料的宣传视频（商品展示视频），图片素材为：https://ark-tutorial.tos-cn-beijing.volces.com/multimedia/%E6%9D%A8%E6%A2%85%E9%A5%AE%E6%96%99.jpg"
    logger.info(f"!!!! main output: test_type:{t_type}, url_template: {url_template}")

    # 调用主函数
    main(user_need)
