#!/usr/bin/env bash
# PaddleOCR-VL-1.5 via vLLM on GPU 7 (port 8085). Same options as the repo launcher except a
# smaller memory fraction so it can share the GPU with SAM3 and DA3 (OCR_GPU_UTIL, default 0.12).
D=${OVH_DEPLOY:?set OVH_DEPLOY to the deployment directory (envs/, cache/, logs/)}
export CUDA_VISIBLE_DEVICES=7 HF_HOME=$D/cache/huggingface HF_HUB_OFFLINE=1 TMPDIR=$D/cache/tmp
export VLLM_CACHE_ROOT=$D/cache/vllm XDG_CACHE_HOME=$D/cache/xdg TRITON_CACHE_DIR=$D/cache/triton
SNAP=$D/cache/huggingface/hub/models--PaddlePaddle--PaddleOCR-VL-1.5/snapshots/2a4195faa5e7914c12f2fc601d72c81caf8d2da5
exec $D/envs/vllm/bin/python -m vllm.entrypoints.openai.api_server --model "$SNAP" \
    --served-model-name PaddlePaddle/PaddleOCR-VL-1.5 --trust-remote-code \
    --max-num-batched-tokens 16384 --no-enable-prefix-caching --mm-processor-cache-gb 0 \
    --max-model-len 16384 --gpu-memory-utilization "${OCR_GPU_UTIL:-0.12}" --enforce-eager \
    --host 127.0.0.1 --port 8085 "$@"
