#!/usr/bin/env python3
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
import sys
import zipfile
import argparse
import logging
from pathlib import Path

# 配置日志
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


def parse_args():
    """解析命令行参数"""
    parser = argparse.ArgumentParser(description="打包mobile-agent项目为zip文件")
    parser.add_argument(
        "--output", "-o", default="mobile-agent.zip", help="输出的zip文件名"
    )
    parser.add_argument("--upload", "-u", action="store_true", help="是否上传到云端")
    parser.add_argument("--cloud-path", default="", help="云端存储路径")
    return parser.parse_args()


def restore_config(backup_content):
    """恢复配置文件到原始状态"""
    if not backup_content:
        logger.warning("没有备份内容，无法恢复配置文件")
        return False

    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent
    config_path = project_root / "config.toml"

    try:
        with open(config_path, "w") as file:
            file.write(backup_content)
        logger.info("已恢复config.toml到原始状态")
        return True
    except Exception as e:
        logger.error(f"恢复配置文件时出错: {e}")
        return False


def create_zip_package(output_path):
    """创建zip包"""
    # 要打包的文件和目录列表
    files_to_package = [
        "mobile_agent",
        ".gitignore",
        "app.py",
        ".python-version",
        "bootstrap.sh",
        "build.sh",
        "run.sh",
        "config.toml",
        "pyproject.toml",
        "main.py",
        "requirements.txt",
        "README.md",
        "SECURITY.md",
        "uv.lock",
    ]

    # 获取项目根目录路径
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent

    # 需要忽略的目录和文件模式
    ignore_patterns = [
        "__pycache__",
        "mobile_agent.egg-info",
        "mobile-agent.zip",
        ".egg-info",
        "*.egg-info",
        ".pyc",
        ".pyo",
        ".pyd",
        ".venv",
        "venv",
        ".git",
        ".pytest_cache",
        "dist/",
        "build/",
    ]

    # 过滤掉根目录下匹配忽略模式的文件和目录
    filtered_files = []
    for file_path in files_to_package:
        full_path = project_root / file_path

        # 检查是否匹配忽略模式
        should_ignore = False
        for pattern in ignore_patterns:
            if pattern.startswith("*"):
                # 处理通配符模式
                if file_path.endswith(pattern[1:]):
                    should_ignore = True
                    break
            elif pattern in file_path or file_path == pattern:
                should_ignore = True
                break

        if not should_ignore and full_path.exists():
            filtered_files.append(file_path)
        elif should_ignore:
            logger.info(f"忽略文件/目录: {file_path}")

    # 检查过滤后是否还有缺失的文件
    missing_files = []
    for file_path in filtered_files:
        full_path = project_root / file_path
        if not full_path.exists():
            missing_files.append(file_path)

    if missing_files:
        logger.error(f"以下文件不存在: {', '.join(missing_files)}")
        return False

    output_path = "mobile-agent.zip"

    # 创建zip文件
    zip_path = project_root / output_path
    logger.info(f"正在创建zip包: {zip_path}")

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        for file_path in filtered_files:
            full_path = project_root / file_path

            if full_path.is_dir():
                # 如果是目录，递归添加所有文件
                for root, dirs, files in os.walk(full_path):
                    # 跳过忽略的目录
                    dirs_to_remove = []
                    for d in dirs:
                        should_ignore_dir = False
                        for pattern in ignore_patterns:
                            if pattern.startswith("*"):
                                # 处理通配符模式，如 *.egg-info
                                if d.endswith(pattern[1:]):
                                    should_ignore_dir = True
                                    break
                            elif pattern in d or d == pattern:
                                should_ignore_dir = True
                                break

                        if should_ignore_dir:
                            dirs_to_remove.append(d)
                            logger.debug(f"忽略目录: {Path(root) / d}")

                    for d in dirs_to_remove:
                        dirs.remove(d)

                    for file in files:
                        # 跳过忽略的文件
                        should_ignore_file = False
                        for pattern in ignore_patterns:
                            if pattern.startswith(".") and file.endswith(pattern):
                                should_ignore_file = True
                                break
                            elif pattern.startswith("*") and file.endswith(pattern[1:]):
                                should_ignore_file = True
                                break
                            elif pattern in file:
                                should_ignore_file = True
                                break

                        if should_ignore_file:
                            continue

                        file_full_path = Path(root) / file
                        arcname = file_full_path.relative_to(project_root)
                        logger.debug(f"添加: {arcname}")
                        zipf.write(file_full_path, arcname)
            else:
                # 如果是文件，直接添加
                arcname = full_path.relative_to(project_root)
                logger.debug(f"添加: {arcname}")
                zipf.write(full_path, arcname)

    logger.info(f"打包完成: {zip_path}")
    return zip_path


def main():
    """主函数"""
    args = parse_args()

    # 创建zip包
    zip_path = create_zip_package(args.output)

    if not zip_path:
        sys.exit(1)

    logger.info("打包完成!")
    sys.exit(0)


if __name__ == "__main__":
    main()
