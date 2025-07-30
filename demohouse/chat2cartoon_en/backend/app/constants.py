import os

REGION = "ap-southeast-1"
BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3"
ARK_SERVICE_NAME = os.getenv("ARK_SERVICE_NAME", "ark_stg")
ARK_API_VERSION = "2024-01-01"
ARK_HOST = "open.volcengineapi.com"
ARK_ACCESS_KEY = os.getenv("TOS_ACCESSKEY")
ARK_SECRET_KEY = os.getenv("TOS_SECRETKEY")
ARTIFACT_TOS_BUCKET = os.getenv("TOS_BUCKET", "ark-bot-child-story-demo-stg")

FILM_INTERACTION_TIMEOUT_TIME_IN_SECONDS = 60

LLM_ENDPOINT_ID = os.getenv("LLM_ENDPOINT_ID", "")
VLM_ENDPOINT_ID = os.getenv("VLM_ENDPOINT_ID", "")
CGT_ENDPOINT_ID = os.getenv("CGT_ENDPOINT_ID", "")
T2V_ENDPOINT_ID = os.getenv("T2V_ENDPOINT_ID", "")

API_KEY = os.getenv("API_KEY", "")

TTS_NAMESPACE = os.getenv("TTS_NAMESPACE", "")
TTS_DEFAULT_SPEAKER = os.getenv("TTS_SPEAKER", "zh_female_sajiaonvyou_moon_bigtts")
TTS_API_RESOURCE_ID = os.getenv("TTS_API_RESOURCE_ID", "")
TTS_APP_KEY = os.getenv("TTS_APP_KEY", "")
TTS_ACCESS_KEY = os.getenv("TTS_ACCESS_KEY", "")
TTS_BASE_URL = os.getenv("TTS_BASE_URL", "")
TTS_INT_SIZE = 4

ONE_DAY_IN_SECONDS = 60 * 60 * 24
IMAGE_SIZE_LIMIT = 10 * 1024 * 1024  # 10MB
MAX_STORY_BOARD_NUMBER = 15

DEFAULT_AUDIO_TONE = "zh_male_shaonianzixin_moon_bigtts"
VALID_TONES = [
    "zh_male_shaonianzixin_moon_bigtts",
    "zh_male_jingqiangkanye_moon_bigtts",
    "en_male_adam_mars_bigtts",
    "zh_male_wennuanahu_moon_bigtts",
    "zh_male_jieshuonansheng_mars_bigtts",
    "zh_male_silang_mars_bigtts",
    "en_male_smith_mars_bigtts",
    "en_male_dryw_mars_bigtts",
    "zh_female_mengyatou_mars_bigtts",
    "zh_female_qiaopinvsheng_mars_bigtts",
    "zh_female_linjia_mars_bigtts",
    "zh_female_shuangkuaisisi_moon_bigtts",
    "zh_female_cancan_mars_bigtts",
    "zh_female_tiexinnvsheng_mars_bigtts",
    "zh_female_jitangmeimei_mars_bigtts",
    "en_female_anna_mars_bigtts",
    "en_female_sarah_mars_bigtts",
    "zh_female_shaoergushi_mars_bigtts",
]
