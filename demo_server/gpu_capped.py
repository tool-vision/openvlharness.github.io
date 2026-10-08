"""Run a raw tool server under a hard PyTorch memory cap so several services can share one GPU.

  GPU_MEM_FRACTION=0.17 python gpu_capped.py openvlharness.services.tools.sam3_segment.server:app 8086

The cap is set before the server module is imported (importing it loads the model). A request
that would exceed the cap raises CUDA OOM inside this process only, and the endpoint returns an
error; the other services on the GPU keep their memory.
"""
import os
import sys

import torch

fraction = float(os.environ["GPU_MEM_FRACTION"])
torch.cuda.set_per_process_memory_fraction(fraction, 0)

import uvicorn  # noqa: E402

uvicorn.run(sys.argv[1], host="127.0.0.1", port=int(sys.argv[2]))
