#!/usr/bin/env bash
# SAM3 raw server on GPU 7 (port 8086).
D=${OVH_DEPLOY:?set OVH_DEPLOY to the deployment directory (envs/, cache/, logs/)}
export CUDA_VISIBLE_DEVICES=7 HF_HOME=$D/cache/huggingface HF_HUB_OFFLINE=1 TMPDIR=$D/cache/tmp MPLCONFIGDIR=$D/cache/mpl
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
# Hard cap ~8.2 GB (measured peak 6.8 GB on a 132-mask image at the demo's 1536 px input cap).
export GPU_MEM_FRACTION=${SAM3_GPU_FRACTION:-0.17}
exec $D/envs/sam3/bin/python $(dirname "$0")/../gpu_capped.py openvlharness.services.tools.sam3_segment.server:app 8086
