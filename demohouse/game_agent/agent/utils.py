import os
import re
import requests
import pandas as pd
from typing import *
import json
import subprocess
import re

def parse_assistant_message(text: str) -> list:
    """
    解析包含叙事标记（%旁白% 和 #角色名#）的文本字符串。
    使用 re.split() 来分割标记和内容。

    Args:
        text: 包含标记的输入字符串。

    Returns:
        一个字典列表，每个字典代表一个旁白或对话元素，
        格式类似于:
        [
            {"type": "pangbai", "content": "旁白内容..."},
            {"type": "dialogue", "role": "角色名", "content": "对话内容..."}
        ]
        元素顺序与在输入文本中的出现顺序一致。
    """
    if not text:
        return []

    # 正则表达式用于分割：%旁白% 或 #角色名#
    # 括号使其成为捕获组，re.split会保留分隔符
    marker_pattern_for_split = r"(%旁白%|%系统%|#\w+#)"
    
    parts = re.split(marker_pattern_for_split, text)
    # 例如: text = "%旁白%内容1#角色#内容2"
    # parts -> ['', '%旁白%', '内容1', '#角色#', '内容2']
    # 例如: text = "前导文本%旁白%内容1"
    # parts -> ['前导文本', '%旁白%', '内容1']

    results = []
    current_marker_info = None  # 用来存储当前解析到的标记信息

    for part in parts:
        if not part:  # re.split 可能会产生空字符串，例如当文本以分隔符开头或结尾时
            continue

        # 检查当前部分是否是一个标记
        is_marker = re.fullmatch(marker_pattern_for_split, part)

        if is_marker:
            # 如果当前部分是一个标记，我们记录它
            if part == "%旁白%":
                current_marker_info = {"type": "pangbai"}
            elif part == "%系统%":
                current_marker_info = {"type": "system"}
            elif part.startswith("#") and part.endswith("#"):
                role_name_match = re.fullmatch(r"#(\w+)#", part)
                if role_name_match:
                    role_name = role_name_match.group(1)
                    current_marker_info = {"type": "dialogue", "role": role_name}
                else:
                    # 理论上不应该发生，因为 marker_pattern_for_split 已经匹配了格式
                    current_marker_info = None 
            else:
                current_marker_info = None
        elif current_marker_info:
            # 如果当前部分不是标记，并且我们之前记录了一个标记，
            # 那么这个部分就是那个标记对应的内容
            content = part.strip()
            
            # 只有当内容非空时才添加，或者允许空内容（取决于需求，目前是允许的）
            # if content or current_marker_info.get("type") == "pangbai": # 示例：允许旁白内容为空
            
            entry = {"type": current_marker_info["type"]}
            if current_marker_info["type"] == "dialogue":
                entry["role"] = current_marker_info["role"]
            entry["content"] = content
            results.append(entry)
            
            current_marker_info = None  # 内容处理完毕，重置标记信息   
    return results


def convert_messages_to_chat_history(messages: List[Dict]) -> str:
    chat_history = ""
    for message in messages:
        if message["role"] == "system":
            continue
        elif message["role"] == "assistant":
            sub_msg = parse_assistant_message(message["content"])
            for sub_msg_item in sub_msg:
                if sub_msg_item["type"] == "pangbai":
                    chat_history += f"（旁白：{sub_msg_item['content']}）\n"
                elif sub_msg_item["type"] == "dialogue":
                    chat_history += f"{sub_msg_item['role']}：{sub_msg_item['content']}\n"
        elif message["role"] == "user":
            chat_history += f"用户：{message['content']}\n"
    return chat_history



volc_config_doubao_1_5_character_0228 = {
    "api_key": os.environ['VOLC_API_KEY'],
    "model": os.environ['VOLC_CHARACTER_MODEL_EP'],
    "top_p": 0.7,
    "temperature": 1
}

volc_config_doubao_1_5_thinking_pro_250415 = {
    "api_key": os.environ['VOLC_API_KEY'],
    "model": os.environ['VOLC_THINKING_MODEL_EP'],
    "top_p": 0.7,
    "temperature": 1
}


def request_volc(volc_config: Dict[str, Any], messages: List[Dict[str, Any]], tools: Optional[List] = None) -> Dict[str, Any]:
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {volc_config['api_key']}"
    }
    
    payload = {
        **volc_config,
        "messages": messages
    }

    if tools is not None:
        payload['tools'] = tools
    
    response = requests.post(
        "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
        headers=headers,
        data=json.dumps(payload)
    )
    
    if response.status_code == 200:
        result = response.json()
        return result
    else:
        raise Exception(f"API request failed with status code {response.status_code}: {response.text}")


def run_rpg_app(project_path: str, port: int):
    cmd = f"cd {project_path} && PORT={port} RPG_TYPE=rpg npm run dev"
    print(cmd)
    # 使用 subprocess.Popen 并设置 stdout 和 stderr 重定向到文件，使其在后台运行
    with open('/dev/null', 'w') as devnull:
        subprocess.Popen(cmd, shell=True, stdout=devnull, stderr=devnull, start_new_session=True)


def check_rpg_app_status(port: int):
    try:
        # 执行 lsof 命令查找指定端口的占用情况
        output = subprocess.check_output(['lsof', '-i', f':{port}'], stderr=subprocess.STDOUT, text=True)
        # 检查输出是否非空，非空则表示端口被占用
        return bool(output.strip())
    except subprocess.CalledProcessError as e:
        # 如果返回码不为 0，说明端口未被占用
        if e.returncode == 1:
            return False
        print(f"检查端口 {port} 状态时出错: {e.output}")
        return False
    except Exception as e:
        print(f"检查端口 {port} 状态时出错: {e}")
        return False


def kill_process_by_port(port: int):
    """
    根据端口号找到对应的PID并杀死进程。
    仅适用于 macOS 和 Linux 系统。
    """
    try:
        find_pid_command = f"lsof -i :{port}"
        result = subprocess.check_output(find_pid_command, shell=True, text=True, stderr=subprocess.STDOUT)
        
        pid_to_kill = None
        lines = result.strip().split('\n')
        if len(lines) > 1: # 第一行是表头
            for line in lines[1:]: # 从第二行开始是进程信息
                parts = line.split()
                if len(parts) > 1 and parts[1].isdigit(): # PID 通常在第二列
                    if "(LISTEN)" in line or "LISTEN" in parts:
                        pid_to_kill = parts[1]
                        break
        if pid_to_kill:
            print(f"找到端口 {port} 的进程 PID: {pid_to_kill}，正在尝试终止...")
            kill_command = f"kill -9 {pid_to_kill}"
            subprocess.run(kill_command, shell=True, check=True)
            print(f"进程 PID: {pid_to_kill} 已被终止。")
            return True
        else:
            print(f"未找到在端口 {port} 上监听的进程。")
            return False
            
    except subprocess.CalledProcessError as e:
        # 如果 lsof 命令没有找到任何进程，它可能会返回非零退出码
        if e.returncode == 1 and not e.output.strip(): # lsof 在没找到时通常返回1且无输出
             print(f"未找到在端口 {port} 上监听的进程。")
        else:
            print(f"执行命令时出错: {e}")
            print(f"命令输出: {e.output}")
        return False
    except Exception as e:
        print(f"发生未知错误: {e}")
        return False


# 新增函数 is_port_occupied，用于替代原 L265 的注释
def is_port_occupied(port: int) -> bool:
    try:
        # 执行 lsof 命令查找指定端口的占用情况
        # lsof -i :{port} 会列出使用该端口的进程
        # 如果没有进程使用该端口，lsof 会返回退出码 1 并且通常没有标准输出内容
        # 如果有进程使用该端口，lsof 会返回退出码 0 并且输出进程信息
        output = subprocess.check_output(
            ['lsof', '-i', f':{port}'],
            stderr=subprocess.STDOUT,  # 将错误输出重定向到标准输出，以便捕获所有信息
            text=True
        )
        return bool(output.strip())
    except subprocess.CalledProcessError as e:
        # 如果 lsof 返回码为 1，并且标准输出为空，表示没有找到占用该端口的进程
        if e.returncode == 1 and not e.output.strip():
            return False  # 端口未被占用
        # 其他返回码或有输出但返回码非0，表示 lsof 执行出错或异常情况
        print(f"执行 lsof 检查端口 {port} 时出错 (返回码 {e.returncode}): {e.output.strip()}")
        return False  # 视为未占用或错误，具体行为可根据需求调整
    except FileNotFoundError:
        # 如果 lsof 命令不存在
        print("错误: 'lsof' 命令未找到。请确保 lsof 已安装并且在系统的 PATH 环境变量中。")
        return False  # 假设未占用，但这可能不安全，建议确保lsof可用
    except Exception as e:
        # 其他未知错误
        print(f"检查端口 {port} 是否被占用时发生未知错误: {e}")
        return False  # 视为未占用或错误


def find_rpg_app_port():
    try:
        # 执行 ps -ef 命令获取所有进程信息
        ps_output = subprocess.check_output(['ps', '-ef'], text=True)
        # 筛选出包含 RPG_TYPE=rpg npm run dev 的进程
        rpg_processes = [line for line in ps_output.split('\n') if 'RPG_TYPE=rpg npm run dev' in line]

        ports = []
        for process in rpg_processes:
            # 使用正则表达式匹配 PORT= 后面的端口号
            match = re.search(r'PORT=(\d+)', process)
            if match:
                port = match.group(1)
                ports.append(int(port))
        
        return ports
    except Exception as e:
        print(f"查找端口时出错: {e}")
        return []

def generate_port():
    # 在端口范围 10000 到 100000 之间随机选择一个端口，但不能在used_ports中
    for i in range(3000, 4000):
        # 检验当前端口是否有占用
        if not is_port_occupied(i):
            return i
    return None
    

def cp_and_build_new_dir(new_dir: str):
    # 如果存在这个路径就删除
    if os.path.exists(new_dir):
        os.system(f'rm -rf {new_dir}')
    # 检查新目录是否存在
    if not os.path.exists(new_dir):
        # 如果不存在，创建新目录
        os.makedirs(new_dir)
        print(f"目录 {new_dir} 创建成功！")
    
    # 构建软链接的源路径和目标路径
    RPG_APP_PATH = os.environ.get('RPG_APP_PATH')
    source_path = os.path.join(RPG_APP_PATH, 'node_modules')
    target_path = os.path.join(new_dir, 'node_modules')
    try:
        # 创建软链接
        os.symlink(source_path, target_path)
        print(f"软链接 {target_path} 创建成功！")
    except FileExistsError:
        print(f"软链接 {target_path} 已存在，跳过创建。")
    except Exception as e:
        print(f"创建软链接 {target_path} 时出错: {e}")

    # 把RPG_APP_PATH目录下除去node_modules的所有文件复制到新目录下
    for file in os.listdir(RPG_APP_PATH):
        if file != 'node_modules':
            source_file = os.path.join(RPG_APP_PATH, file)
            target_file = os.path.join(new_dir, file)
            os.system(f'cp -r {source_file} {target_file}')