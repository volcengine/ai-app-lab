#!/usr/bin/env python
# -*- encoding: utf-8 -*-
'''
@File    :   run.py
@Time    :   2025/06/04 10:13:07
@Author  :   zhouyiming.duncan 
@Version :   1.0
@Contact :   zhouyiming.duncan@BYTEDANCE.COM
@License :   (C)Copyright 2025 BYTEDANCE
@Desc    :   None
'''

# here put the import lib

from volcenginesdkarkruntime import Ark
import streamlit as st
import time
import re, os
from tqdm import tqdm
import subprocess, json
from moviepy.editor import *
from byteplussdkarkruntime import Ark
import requests
import base64
import config
import imageio

sc_ep_id = config.sc_ep_id # 0228-character
pro_ep_id = config.pro_ep_id # doubao-pro 0115
API_KEY = config.volc_api_key


client = Ark(
    base_url="https://ark.cn-beijing.volces.com/api/v3",
    api_key=f"{API_KEY}",
)

def get_assistant_replay(messages, router='bp'):
    if router != 'bp':
        completion = client.chat.completions.create(
            model=pro_ep_id,
            messages=messages,
            temperature=1.0,
            top_p=0.7
        )
        return completion.choices[0].message.content
    else:
        client = Ark(
            api_key=config.bp_api_key,
            base_url="https://ark.ap-southeast.bytepluses.com/api/v3",
            region="cn-beijing"
        )
        completion = client.chat.completions.create(
        # Specify the Ark Inference Endpoint ID you created, which has been changed to your Inference Endpoint ID for you.
            model="skylark-pro-sc-preview",
            messages=messages,
        )
        return completion.choices[0].message.content

def get_plot_desc(reply, max_plot_num=3):
    messages = []
    messages.append({"role": "user", "content": f'''#任务目标#
    根据输入的内容，生成适用于拍摄的镜头描述信息

    #输入介绍#
    1. 输入的内容是一段文本，以主角的视角对用户的发言，输出了他的动作行为和语言发言，动作行为在（）中。
    2. 你需要先区分谁是主角，谁是用户
    3. 然后镜头代表的是用户，需要用用户的视角去描述镜头内容

    #任务要求#
    1. 输出要小于等于{max_plot_num}个镜头，每个镜头需要包含背景环境、主角动作、镜头的运镜，保证每个分镜的质量。
    2. 始终以用户的第一视角生成画面，在画面描写、动作描写，运镜中都不要出现用户
    3. 描述尽量简短，不要有人物发言内容 

    主角的发言：{reply}'''})
    completion = client.chat.completions.create(
        model=pro_ep_id,
        messages=messages,
        temperature=1.0,
        top_p=0.7
    )
    return completion.choices[0].message.content

def get_character_pic(role_desc):
    messages = [{"role" : "user", "content" : f"根据一段文本，抽取出角色的名字和对应的人物的外观描述，和当前所处的场景描述，如果没有场景描述，可以发挥\n 文本内容如下：{role_desc}\n注意：不要抽取角色的发言，和其他指令性内容，只需要角色的名字和外观描述和场景描述"}]

    completion = client.chat.completions.create(
        model=pro_ep_id,
        messages=messages,
        temperature=1.0, 
        top_p=0.7
    )
    desc = completion.choices[0].message.content

    imagesResponse = client.images.generate(
        model="doubao-seedream-3-0-t2i-250415",
        prompt=f"{desc}",
        watermark=False,
    )

    return imagesResponse.data[0].url

def request_seedance(prompt='写实风格，晴朗的蓝天之下，一大片白色的雏菊花田，镜头逐渐拉近，最终定格在一朵雏菊花的特写上，花瓣上有几颗晶莹的露珠。 --watermark false --ratio adaptive --dur 5', image_base64_code=None):
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}"
    }
    if image_base64_code is not None:
        data = {
            "model": "doubao-seedance-1-0-lite-i2v-250428",
            "content": [
                {
                    "type": "text",
                    "text": prompt
                },
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/jpeg;base64,{image_base64_code}"  
                    }
                }
            ]
        }
    else:
        data = {
            "model": "doubao-seedance-1-0-lite-t2v-250428",
            "content": [
                {
                    "type": "text",
                    "text": prompt
                }
            ]
        }
    command = [
        "curl",
        "-X", "POST",
        "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks"
    ]
    # 添加请求头
    for key, value in headers.items():
        command.extend(["-H", f"{key}: {value}"])

    # 添加请求体
    command.extend(["-d", json.dumps(data, ensure_ascii=False)])
    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        check=True,
        timeout=10  # 设置超时时间为10秒
    )
    result = json.loads(result.stdout)
    return result['id']

def get_video_task_status(task_id):
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}"
    }
    command = [
        "curl",
        "-X", "GET",
        f"https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{task_id}"
    ]
    # 添加请求头
    for key, value in headers.items():
        command.extend(["-H", f"{key}: {value}"])
    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        check=True,
        timeout=10  # 设置超时时间为10秒
    )
    result = json.loads(result.stdout)

    return result

def download_video(url, output_path):
    try:
        # 获取文件大小
        response = requests.get(url, stream=True)
        response.raise_for_status()
        total_size = int(response.headers.get('content-length', 0))
        
        # 下载并显示进度条
        with open(output_path, 'wb') as f, tqdm(
            desc=output_path,
            total=total_size,
            unit='B',
            unit_scale=True,
            unit_divisor=1024,
        ) as bar:
            for data in response.iter_content(chunk_size=8192):
                size = f.write(data)
                bar.update(size)
                
        print(f"视频下载成功，保存至: {output_path}")
    except Exception as e:
        print(f"下载失败: {e}")

def download_image(url, output_path, chunk_size=8192):
    """下载图片 URL 并保存到本地"""
    try:
        # 发送 HTTP 请求
        response = requests.get(url, stream=True)
        response.raise_for_status()  # 检查请求是否成功
        
        # 写入文件
        with open(output_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=chunk_size):
                if chunk:  # 过滤空块
                    f.write(chunk)
        
        print(f"图片下载成功，保存至: {output_path}")
    except requests.exceptions.RequestException as e:
        print(f"下载失败: {e}")

def concatenate_videos(input_files, output_file, srt_text=None, method="compose"):
    """
    拼接多个视频文件
    
    参数:
    input_files: 视频文件路径列表
    output_file: 输出视频文件路径
    method: 拼接方法，"compose"（默认）或"chain"
    """
    # 加载视频片段
    clips = [VideoFileClip(file) for file in input_files]
    
    # 拼接视频
    final_clip = concatenate_videoclips(clips, method=method)
    
    # 添加字幕
    if len(srt_text) > 0:
        merge_list = [final_clip]
        duration = final_clip.duration
        duration_interval = duration / len(srt_text)
        for i, text in enumerate(srt_text):
            # 创建字幕文本
            subtitle = TextClip(text, fontsize=config.video_srt_size, font=config.video_srt_font_style,color=config.video_srt_color, bg_color=config.video_srt_background_color, method='caption', size=(final_clip.w*0.6, None))

            # 设置字幕的持续时间和位置
            subtitle = subtitle.set_duration(duration_interval).set_position(('center', 'bottom')).set_start(i*duration_interval)
            merge_list.append(subtitle)

        # 合并视频和字幕
        final_clip = CompositeVideoClip(merge_list)
    
    # 写入输出文件
    final_clip.write_videofile(output_file, codec="libx264", audio_codec="aac")
    
    # 关闭所有片段以释放资源
    for clip in clips:
        clip.close()
    final_clip.close()
    
    print(f"视频已成功拼接并保存至: {output_file}")

def video_to_base64(video_path):
    """将视频文件转换为Base64编码"""
    with open(video_path, "rb") as video_file:
        encoded = base64.b64encode(video_file.read()).decode()
    return encoded

def extract_last_frame(video_path, output_path="last_frame.jpg"):
    try:
        with VideoFileClip(video_path) as clip:
            # 获取视频总时长
            duration = clip.duration
            
            # 获取最后一帧（总时长前的一帧，避免超出范围）
            last_frame = clip.get_frame(duration - 0.1)
            
            # 保存为图片
            imageio.imwrite(output_path, last_frame)
            print(f"尾帧已保存至: {output_path}")
    except Exception as e:
        print(f"失败: {e}")

def image_to_base64(image_path):
    """将本地图片转换为 Base64 字符串"""
    with open(image_path, "rb") as image_file:
        encoded_string = base64.b64encode(image_file.read()).decode("utf-8")
    return encoded_string

def srt_to_base64_data_uri(srt_path):
    """将 SRT 字幕文件内容转换为 Base64 数据URI"""
    try:
        with open(srt_path, "r", encoding="utf-8") as srt_file:
            srt_content = srt_file.read()
        # MIME type for SRT is typically text/plain or application/x-subrip. Using text/plain for broader compatibility.
        # Browsers are generally lenient with data URIs for <track> elements.
        encoded_srt = base64.b64encode(srt_content.encode("utf-8")).decode("utf-8")
        return f"data:text/plain;charset=utf-8;base64,{encoded_srt}"
    except FileNotFoundError:
        print(f"SRT 文件未找到: {srt_path}")
        st.warning(f"字幕文件 '{srt_path}' 未找到。")
        return ""
    except Exception as e:
        print(f"处理 SRT 文件 {srt_path} 时出错: {e}")
        st.error(f"处理字幕文件 '{srt_path}' 时出错。")
        return ""

def extract_outside_parentheses(text):
    """提取中英文括号之外的文本，并按列表返回"""
    # 正则表达式匹配：
    # \( \) - 英文圆括号及其内容
    # （ ） - 中文圆括号及其内容
    # \[ \] - 英文方括号及其内容 (需要转义)
    # 【 】 - 中文方括号及其内容
    pattern = r"\([^)]*\)|（[^）]*）|\[[^\]]*\]|【[^】]*】"
    # 使用 re.split() 根据匹配到的括号内容分割字符串
    parts = re.split(pattern, text)
    # 过滤掉分割后可能产生的空字符串
    return [part for part in parts if part]

sp = config.sp
local_video_list = []
srt_text = []

# ---------------------------- 界面相关 ---------------------
# 页面配置
# 设置页面为宽屏模式
st.set_page_config(layout="wide")
col1, col2, col3 = st.columns([2, 1, 2])

with col2:
    if "image_base64_code" not in st.session_state:
        # 获取图片
        # pic_url = get_character_pic(sp)
        # 显示角色图片
        # download_image(pic_url, 'initial.jpg')
        image_base64_code = image_to_base64('initial.jpeg')
        st.session_state.image_base64_code = image_base64_code
    st.image("data:image/jpeg;base64," + st.session_state.image_base64_code, caption='故事海报', use_container_width=True)

# 获取用户输入
if prompt := st.chat_input("请输入你的问题..."):
    with col1:
        if "messages" not in st.session_state:
            st.session_state.messages = [{"role": "system", "content": sp}]
        # 显示历史聊天记录
        for message in st.session_state.messages:
            with st.chat_message(message["role"]):
                st.markdown(message["content"])
        # 将用户消息添加到聊天记录并显示
        st.session_state.messages.append({"role": "user", "content": prompt})
        with st.chat_message("user"):
            st.markdown(prompt)

        # 模拟大模型思考和回复
        with st.chat_message("assistant"):
            message_placeholder = st.empty()
            full_response = get_assistant_replay(st.session_state.messages)
            # 例如: response = your_llm_function(prompt)
            message_placeholder.markdown(full_response)

        # 将助手回复添加到聊天记录
        st.session_state.messages.append({"role": "assistant", "content": full_response})
        print(st.session_state.messages)
        # 获取镜头描述
        plot_desc = get_plot_desc(full_response, config.max_plot_num)
        # st.markdown(plot_desc)
        plot_desc = plot_desc.replace('镜头 ', '镜头')

        # 解析发言内容
        srt_text = extract_outside_parentheses(full_response)
        # 生成视频
        pattern1 = r"镜头\d+：\n(.*?)(?=\n镜头|$)"
        matches = re.findall(pattern1, plot_desc, re.DOTALL)
        pattern2 = r"镜头\d+：(.*?)(?=镜头|$)"
        if len(matches) == 0:
            pattern2 = r"镜头\d+：(.*?)(?=\n镜头|$)"
            matches = re.findall(pattern2, plot_desc, re.DOTALL)
        video_list = []
        for i, match in enumerate(matches, start=1):
            plot_desc = f"{match.strip()}" + f" --watermark {config.video_watermark} --resolution {config.video_resolution}"
            print(plot_desc)
            # 生成视频
            video_url = request_seedance(plot_desc, st.session_state.image_base64_code)
            print(video_url)
            # 等待视频生成完成
            while True:
                time.sleep(3)
                response = get_video_task_status(video_url)
                print(response)
                status = response['status']
                if status == 'succeeded':
                    video_list.append(response['content']['video_url'])
                    local_video_list.append(f"video{i}.mp4")
                    download_video(response['content']['video_url'], f"video{i}.mp4")
                    # 获取尾帧
                    extract_last_frame(f"video{i}.mp4", f"last_frame{i}.jpg")
                    st.session_state.image_base64_code = image_to_base64(f"last_frame{i}.jpg")
                    break
                if status == 'failed':
                    print('视频生成失败')
                    break
            st.markdown("视频生成进度：" + str(round(i / len(matches) * 100, 2)) + "%")
    with col3:
        video_placeholder = st.empty()
        # 拼接视频
        output_path = "concatenated_frames.mp4"  # 输出文件路径
        concatenate_videos(local_video_list, output_path, srt_text)
        encode_video = video_to_base64(output_path)
        video_html = f"""
            <video width="640" height="360" controls>
                <source src="data:video/mp4;base64,{encode_video}" type="video/mp4">
            </video>
            """
        video_placeholder.markdown(video_html, unsafe_allow_html=True)
    # if 'selected_indices' not in st.session_state:
    #     st.session_state.selected_indices = []
    # new_selected = []
    # for i, record in enumerate(st.session_state.messages):
    #     is_selected = st.checkbox("", key=f"chk_{i}")
    #     if is_selected:
    #         new_selected.append(i)
    # st.session_state.selected_indices = new_selected
    
# # 添加一个清除聊天记录的按钮（可选）
# if st.sidebar.button("清除聊天记录"):
#     st.session_state.messages = [
#         {"role": "system", "content": sp}
#     ]
#     st.rerun()