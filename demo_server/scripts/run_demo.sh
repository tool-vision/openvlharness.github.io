#!/usr/bin/env bash
# Demo backend (Gradio, port 7860). DEMO_ALLOW_PRIVATE_ENDPOINTS=1 only for local tests.
D=${OVH_DEPLOY:?set OVH_DEPLOY to the deployment directory (envs/, cache/, logs/)}
export TMPDIR=$D/cache/tmp MPLCONFIGDIR=$D/cache/mpl GRADIO_TEMP_DIR=$D/cache/gradio
export DEMO_TOOL_SERVER_URL=http://127.0.0.1:8101 DEMO_OUTPUT_DIR=$D/demo_out
export DEMO_ALLOW_PRIVATE_ENDPOINTS=${DEMO_ALLOW_PRIVATE_ENDPOINTS:-0}
exec $D/envs/router/bin/python $(dirname "$0")/../app.py
