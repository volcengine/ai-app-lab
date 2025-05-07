#!/bin/bash
set -ex
cd `dirname $0`

# A special check for CLI users (run.sh should be located at the 'root' dir)
if [ -d "output" ]; then
    cd ./output/
fi

# Default values for host and port
HOST="0.0.0.0"
PORT=${_BYTEFAAS_RUNTIME_PORT:-8000}
TIMEOUT=${_FAAS_FUNC_TIMEOUT}
export PYTHONPATH=$PYTHONPATH:./site-packages

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --port)
            PORT="$2"
            shift 2
            ;;
        --host)
            HOST="$2"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

exec python3 -m uvicorn main:app --host $HOST --port $PORT --timeout-graceful-shutdown $TIMEOUT
