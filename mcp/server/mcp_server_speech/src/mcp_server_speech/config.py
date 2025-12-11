import logging
import os
from pathlib import Path

log_dir = Path(__file__).resolve().parent.parent.parent / "logs"
log_dir.mkdir(exist_ok=True)

log_formatter = logging.Formatter(
    "%(asctime)s - %(name)s - [%(filename)s:%(lineno)d]- %(levelname)s - %(message)s"
)

console_handler = logging.StreamHandler()
console_handler.setFormatter(log_formatter)

# Create file handler
log_file = os.getenv("LOG_FILE_PATH", str(log_dir / "speech.log"))
file_handler = logging.FileHandler(log_file, encoding="utf-8")
file_handler.setFormatter(log_formatter)

# Configure root logger
root_logger = logging.getLogger()
root_logger.setLevel(logging.INFO)
root_logger.addHandler(console_handler)

# Enable file logging based on environment variable
if os.getenv("ENABLE_FILE_LOGGING", "false").lower() == "true":
    root_logger.addHandler(file_handler)

logger = logging.getLogger(__name__)

# load environment variables

VOLC_APPID = None
VOLC_TOKEN = None
VOLC_CLUSTER = None
VOLC_VOICE_TYPE = None


def load_config():
    global VOLC_APPID, VOLC_TOKEN, VOLC_CLUSTER, VOLC_VOICE_TYPE

    VOLC_APPID = os.getenv("VOLC_APPID")
    logger.info(f"VOLC_APPID loaded: {VOLC_APPID}")  # Log loaded value
    VOLC_TOKEN = os.getenv("VOLC_TOKEN")
    logger.info(f"VOLC_TOKEN loaded: {VOLC_TOKEN}")  # Log loaded value
    VOLC_CLUSTER = os.getenv("VOLC_CLUSTER")
    logger.info(f"VOLC_CLUSTER loaded: {VOLC_CLUSTER}")  # Log loaded value
    VOLC_VOICE_TYPE = os.getenv("VOLC_VOICE_TYPE", "zh_female_meilinvyou_moon_bigtts")
    logger.info(f"VOLC_VOICE_TYPE loaded: {VOLC_VOICE_TYPE}")  # Log loaded value

    # Check if required environment variables are set
    if not all([VOLC_APPID, VOLC_TOKEN, VOLC_CLUSTER]):
        logger.error(
            "Missing required environment variables: VOLC_APPID, VOLC_TOKEN, VOLC_CLUSTER"
        )
        raise ValueError(
            "Missing required environment variables: VOLC_APPID, VOLC_TOKEN, VOLC_CLUSTER"
        )


load_config()
