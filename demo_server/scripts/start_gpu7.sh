#!/usr/bin/env bash
# Start all GPU 7 tool services. OCR first: vLLM checks free memory at startup and reserves a
# fixed slice; SAM3 and DA3 then grow only up to their per-process caps.
D=${OVH_DEPLOY:?set OVH_DEPLOY to the deployment directory (envs/, cache/, logs/)}
wait_for() { until curl -sf "$1" >/dev/null; do sleep 3; done; echo "up: $1"; }
nohup "$(dirname "$0")"/run_ocr.sh > $D/logs/ocr_server.log 2>&1 &
wait_for http://127.0.0.1:8085/health
nohup "$(dirname "$0")"/run_sam3.sh > $D/logs/sam3_server.log 2>&1 &
wait_for http://127.0.0.1:8086/health
nohup "$(dirname "$0")"/run_da3.sh > $D/logs/da3_server.log 2>&1 &
wait_for http://127.0.0.1:8087/health
nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader -i 7
