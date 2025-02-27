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

from dotenv import load_dotenv

load_dotenv("../.env")

REGION = "cn-beijing"
ARK_SERVICE_NAME = os.getenv("ARK_SERVICE_NAME", "ARK")
ARK_ACCESS_KEY = os.getenv("VOLC_ACCESSKEY")
ARK_SECRET_KEY = os.getenv("VOLC_SECRETKEY")
ARK_API_KEY = os.getenv("ARK_API_KEY")

ARTIFACT_TOS_BUCKET = os.getenv("TOS_BUCKET", "")

LLM_ENDPOINT_ID = os.getenv("LLM_ENDPOINT_ID", "")
VLM_ENDPOINT_ID = os.getenv("VLM_ENDPOINT_ID", "")
CGT_ENDPOINT_ID = os.getenv("CGT_ENDPOINT_ID", "")

TTS_API_RESOURCE_ID = os.getenv("TTS_API_RESOURCE_ID", "")
TTS_APP_KEY = os.getenv("TTS_APP_KEY", "")
TTS_ACCESS_KEY = os.getenv("TTS_ACCESS_KEY", "")
TTS_INT_SIZE = 4

ONE_DAY_IN_SECONDS = 60 * 60 * 24
IMAGE_SIZE_LIMIT = 10 * 1024 * 1024  # 10MB
MAX_STORY_BOARD_NUMBER = 15

DEFAULT_AUDIO_TONE = "zh_female_shuangkuaisisi_moon_bigtts"
VALID_TONES = [
    "zh_female_cancan_mars_bigtts",
    "zh_female_shuangkuaisisi_moon_bigtts",
    "zh_male_wennuanahu_moon_bigtts",
    "zh_female_linjianvhai_moon_bigtts",
    "zh_male_shaonianzixin_moon_bigtts",
    "zh_female_zhixingnvsheng_mars_bigtts",
    "zh_male_qingshuangnanda_mars_bigtts",
    "zh_male_yuanboxiaoshu_moon_bigtts",
    "zh_male_yangguangqingnian_moon_bigtts",
    "zh_female_tianmeixiaoyuan_moon_bigtts",
    "zh_female_qingchezizi_moon_bigtts",
    "zh_male_jieshuoxiaoming_moon_bigtts",
    "zh_female_kailangjiejie_moon_bigtts",
    "zh_male_linjiananhai_moon_bigtts",
    "zh_female_tianmeiyueyue_moon_bigtts",
    "zh_female_xinlingjitang_moon_bigtts",
    "zh_male_jingqiangkanye_moon_bigtts",
    "zh_female_wanwanxiaohe_moon_bigtts",
    "zh_female_wanqudashu_moon_bigtts",
    "zh_female_daimengchuanmei_moon_bigtts",
    "zh_male_guozhoudege_moon_bigtts",
    "zh_male_beijingxiaoye_moon_bigtts",
    "zh_male_haoyuxiaoge_moon_bigtts",
    "zh_male_guangxiyuanzhou_moon_bigtts",
    "zh_female_meituojieer_moon_bigtts",
    "zh_male_yuzhouzixuan_moon_bigtts",
    "zh_male_naiqimengwa_mars_bigtts",
    "zh_female_popo_mars_bigtts",
    "zh_female_gaolengyujie_moon_bigtts",
    "zh_female_sajiaonvyou_moon_bigtts",
    "zh_female_yuanqinvyou_moon_bigtts",
    "zh_male_dongfanghaoran_moon_bigtts",
    "zh_female_wenrouxiaoya_moon_bigtts",
    "zh_male_tiancaitongsheng_mars_bigtts",
    "zh_male_sunwukong_mars_bigtts",
    "zh_male_xionger_mars_bigtts",
    "zh_female_peiqi_mars_bigtts",
    "zh_female_yingtaowanzi_mars_bigtts",
    "zh_male_chunhui_mars_bigtts",
    "zh_female_shaoergushi_mars_bigtts",
    "zh_female_tiexinnvsheng_mars_bigtts",
    "zh_female_qiaopinvsheng_mars_bigtts",
]
