#!/usr/bin/env bash
# DA3 depth + pose raw server on GPU 7 (port 8087).
D=${OVH_DEPLOY:?set OVH_DEPLOY to the deployment directory (envs/, cache/, logs/)}
export CUDA_VISIBLE_DEVICES=7 HF_HOME=$D/cache/huggingface HF_HUB_OFFLINE=1 TMPDIR=$D/cache/tmp MPLCONFIGDIR=$D/cache/mpl
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
# Hard cap ~30.5 GB (measured peak 28.8 GB for 4-frame pose at 1536 px).
export GPU_MEM_FRACTION=${DA3_GPU_FRACTION:-0.63}
exec $D/envs/da3/bin/python $(dirname "$0")/../gpu_capped.py openvlharness.services.tools.depth_estimation.server:app 8087
