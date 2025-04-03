from datetime import datetime


def get_env_info() -> str:
    return f"当前时间：{datetime.now().strftime('%Y年%m月%d日')}"
