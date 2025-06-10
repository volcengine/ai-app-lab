# 获取当前文件的文件夹，然后cd ..
root_path=$(realpath $(dirname $(dirname $0)))

# 获取绝对路径并输出
echo ${root_path}
source ${root_path}/.venv/bin/activate

# 运行前端环境
RPG_APP=${root_path}/rpg-app
RPG_APP_PATH=${RPG_APP} streamlit run agent/app_final_demo.py