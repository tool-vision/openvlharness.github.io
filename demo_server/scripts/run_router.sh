#!/usr/bin/env bash
# Shared tool router (port 8101) for the GPU 7 tools and zoom; CPU only.
D=${OVH_DEPLOY:?set OVH_DEPLOY to the deployment directory (envs/, cache/, logs/)}
export TMPDIR=$D/cache/tmp MPLCONFIGDIR=$D/cache/mpl
exec $D/envs/router/bin/python -m openvlharness.services.server --config $(dirname "$0")/../configs/router_gpu.yaml
