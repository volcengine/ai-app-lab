#!/bin/bash
set -ex
# shellcheck disable=SC2046
cd `dirname $0`
export PYTHONPATH=$PYTHONPATH:/opt/bytefaas/site-packages
export ARK_API_KEY=<YOUR API KEY>
poetry run python code/main.py