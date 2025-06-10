import streamlit as st
from streamlit.components.v1 import iframe
from agent_game_create_stream import game_agent
import random
import string
import os
import time

from utils import (
    run_rpg_app, 
    generate_port, 
    kill_process_by_port,
    parse_assistant_message,
    cp_and_build_new_dir,
    request_volc,
    volc_config_doubao_1_5_character_0228
)
from prompt import SYSTEM_PROMPT_CHARACTER


markdown_split_line_with_css = """<style>
hr {
  border-style: solid !important; /* 确保边框是实线 */
  border-color: #888 !important;   /* 设置边框颜色，例如灰色 */
  border-width: 6px 0 0 0 !important; /* 设置顶部边框的粗细，其他方向为0 */
  height: 0 !important;           /* 确保元素本身没有高度，粗细完全由边框决定 */
  margin-top: 0.5em;              /* 可选：调整上边距 */
  margin-bottom: 0.5em;           /* 可选：调整下边距 */
}
</style>"""

# 1. 页面配置
st.set_page_config(page_title="Game Editor", layout="wide")

def display_chat_msg(message):
    if message["role"] == "assistant":
        # 需要进行解析
        sub_message = parse_assistant_message(message["content"])
        message["sub_msg"] = sub_message
    if message["role"] not in ["user", "assistant"]:
        return
    with st.chat_message(message["role"]):
        if message["role"] == "user":
            st.markdown(message["content"])
        elif message["role"] == "assistant":
            for sub_msg in message["sub_msg"]:
                content = sub_msg["content"]
                if sub_msg["type"] == "pangbai":
                    st.markdown(f"```旁白：{content}```")
                elif sub_msg["type"] == "system":
                    st.markdown(f"```系统：{content}```")
                else:
                    role_name = sub_msg["role"]
                    role_content = sub_msg["content"]
                    # 使用 HTML 的 <u> 标签来添加下划线
                    st.markdown(f"**<u>{role_name}</u>**: {role_content}", unsafe_allow_html=True)


def main():
    # 新增：初始化游戏状态
    if "game_running" not in st.session_state:
        st.session_state.game_running = False

    # 初始化聊天状态
    if "messages" not in st.session_state:
        st.session_state.messages = [{
            'role': 'system',
            'content': SYSTEM_PROMPT_CHARACTER
        }]

    # 新增：初始化GameAgentRunner
    if "agent_runner" not in st.session_state:
        st.session_state.agent_runner = None

    # 新增：用于触发 iframe 刷新的会话状态变量
    if "iframe_refresh_trigger" not in st.session_state:
        st.session_state.iframe_refresh_trigger = 0

    # 页面主标题
    st.title("LLM 游戏智能体交互界面")

    # 4. 主区域布局: 聊天区 | 游戏区
    # 您可以调整这里的比例，例如 [2, 1] 表示聊天区是游戏区的两倍宽
    col_chat, col_game = st.columns([3, 2])

    
    # 5. 聊天界面
    with col_chat:
        st.header("聊天窗口")
        # 实时聊天
        prompt = st.chat_input("chat...")
        
        if prompt:
            st.session_state.messages.append({
                'role':'user',
                'content': prompt
            })
            
            # 请求模型得到结果(角色分支模型)
            response = request_volc(volc_config_doubao_1_5_character_0228, st.session_state.messages)
            content = response['choices'][0]['message']['content']
            st.session_state.messages.append({
                'role':'assistant',
                'content': content
            })
            
        chat_placeholder = st.empty()
        with chat_placeholder.container(height=900):
            for msg in st.session_state.messages:
                display_chat_msg(msg)

        if st.button("生成游戏并启动"):
            # 生成游戏端口
            if hasattr(st.session_state, 'port'):
                kill_process_by_port(st.session_state.port)
            port = generate_port()
            st.session_state.port = port
            st.session_state.game_url = f"http://localhost:{port}"
        
            # 6. 游戏嵌入区域 (右侧列)
            with col_game:
                st.header("游戏agent调用")
                # 临时存储的文件夹
                temp_dir = '/tmp/game_demo'
                cp_and_build_new_dir(temp_dir)
                os.environ['TEMP_GAME_DIR_PATH'] = temp_dir
                agent = game_agent(temp_dir) 
                print("[debug] initialize agent...")
                agent.initialize(chat_history_messages=st.session_state.messages)

                while not agent.is_finished:
                    result = st.write_stream(agent.get_next_message())
                    st.markdown("---")
        
            # >>>>> 启动并加载游戏
            run_rpg_app(temp_dir, st.session_state.port)
            st.session_state.iframe_refresh_trigger += 1
            game_url_to_display = f"{st.session_state.game_url}?_streamlit_refresh={st.session_state.iframe_refresh_trigger}"
            # 将 time.sleep(3) 替换为进度条
            progress_bar = st.progress(0)
            status_text = st.empty() # 用于显示进度的文本
            for i in range(100):
                # 模拟加载过程
                time.sleep(0.03) # 总共大约3秒
                progress_bar.progress(i + 1)
                status_text.text(f"游戏加载中... {i+1}%")
            status_text.text("加载完成!") # 可选：完成后更新文本
            progress_bar.empty() # 可选：完成后移除进度条
            status_text.empty() # 可选: 完成后移除状态文本
            # <<<<<< 启动并加载游戏
            # iframe(game_url_to_display, width=900, height=900, scrolling=False)
            iframe_id = st.session_state.iframe_refresh_trigger
            game_html_content = f"""
            <style>
                #fullscreen-button-container {{
                    margin-bottom: 10px; /* 按钮和iframe之间的间距 */
                }}
                #fullscreen-button-container button {{
                    padding: 8px 15px;
                    font-size: 14px;
                    color: #fff;
                    background-color: #007bff; /* 按钮颜色，可根据主题调整 */
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                }}
                #fullscreen-button-container button:hover {{
                    background-color: #0056b3; /* 按钮悬停颜色 */
                }}
            </style>
            <div id="fullscreen-button-container">
                <button onclick="openFullscreen('{iframe_id}')">全屏模式</button>
            </div>
            <iframe id="{iframe_id}" src="{game_url_to_display}" width="900" height="900" style="border:none;" scrolling="no"></iframe>
            <script>
            function openFullscreen(elemId) {{
                var elem = document.getElementById(elemId);
                if (elem.requestFullscreen) {{
                    elem.requestFullscreen();
                }} else if (elem.mozRequestFullScreen) {{ /* Firefox */
                    elem.mozRequestFullScreen();
                }} else if (elem.webkitRequestFullscreen) {{ /* Chrome, Safari & Opera */
                    elem.webkitRequestFullscreen();
                }} else if (elem.msRequestFullscreen) {{ /* IE/Edge */
                    elem.msRequestFullscreen();
                }}
            }}
            </script>
            """
            # st.components.v1.html 的高度需要适应按钮和 iframe
            # 假设按钮高度约 40px + 10px 边距，iframe 高度 900px，总高度约 950px
            st.components.v1.html(game_html_content, height=960) # 调整组件高度

if __name__ == '__main__':
    # 运行streamlit应用
    # 在终端中使用 `streamlit run app.py` 命令来启动
    main() # 调用新的main函数