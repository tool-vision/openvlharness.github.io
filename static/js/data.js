/* All numbers transcribed from the paper.
   Table 1 (Qwen3-VL, GPT-6), Table 6 (GPT-5, Kimi K3), Table 2 (ablation),
   Table 8 (training-based baselines), Table 12 (reasoning effort), Table 20 (remedy channels). */
window.OVH = (function () {
  const DOMAINS = [
    { name: 'Counting & Grounding', short: 'Count & Ground', rows: ['FSC-147', 'CountQA', 'PixmoCount', 'OdinW-13', 'FSCD-147', 'FSCD-LVIS'] },
    { name: 'Visual Search & Deep Research', short: 'Search', rows: ['MMSearch', 'MMSearch-Plus', 'RealX-Bench', 'FVQA', 'HLE-VL', 'BC-VL'] },
    { name: 'General VQA & Hallucination', short: 'General VQA', rows: ['RealWorldQA', 'SimpleVQA', 'HallusionBench', 'FREAK-VQA', 'FREAK-MCQ', 'V*'] },
    { name: 'Spatial Understanding', short: 'Spatial', rows: ['MMSI-Bench', 'ERQA', 'EmbSpatial', 'SparBench', 'MindCube'] },
  ];

  // Backbone groups and their methods (column order as in the paper)
  const GROUPS = [
    { id: 'q8', name: 'Qwen3-VL-8B', methods: ['Base', 'OT', 'VS', 'Ours'], table: 1 },
    { id: 'q32', name: 'Qwen3-VL-32B', methods: ['Base', 'OT', 'VS', 'Ours'], table: 1 },
    { id: 'luna', name: 'GPT-6 Luna', methods: ['Base', 'VS', 'CX', 'Ours'], table: 1 },
    { id: 'sol', name: 'GPT-6 Sol', methods: ['Base', 'Ours'], table: 1 },
    { id: 'gpt5', name: 'GPT-5', methods: ['Base', 'Ours'], table: 6 },
    { id: 'kimi', name: 'Kimi K3', methods: ['Base', 'Ours'], table: 6 },
  ];

  // Raw strings keep the paper's precision. Order: q8(4) q32(4) luna(4) sol(2) gpt5(2) kimi(2)
  const RAW = `
FSC-147|15.32 11.26 9.41 37.71|18.97 12.44 12.35 39.42|28.69 27.84 25.74 40.82|38.72 44.40|22.16 42.92|36.78 42.07
CountQA|32.00 29.06 19.83 48.56|44.70 41.75 32.85 64.14|54.40 47.51 49.87 64.00|73.00 76.00|38.48 58.70|71.27 73.10
PixmoCount|74.53 66.60 68.69 85.21|79.59 78.75 75.33 87.64|78.65 82.96 78.46 89.70|89.14 91.20|76.03 90.07|91.39 90.45
OdinW-13|39.80 24.60 31.77 50.40|42.39 44.33 36.10 59.13|33.76 37.76 33.78 54.46|40.86 57.88|46.27 63.12|44.35 56.91
FSCD-147|1.79 0.93 1.41 23.52|2.88 2.55 2.30 28.45|5.56 7.07 4.33 25.61|8.36 29.42|0.16 28.09|7.88 29.11
FSCD-LVIS|1.47 1.36 2.49 27.37|1.79 3.91 4.57 31.63|2.95 5.84 2.90 28.96|5.17 35.22|2.04 33.22|7.15 33.60
MMSearch|14.04 9.94 14.62 51.46|20.47 18.13 18.71 62.57|40.94 31.58 33.92 68.42|55.56 77.78|36.84 56.14|67.25 86.55
MMSearch-Plus|1.29 3.54 4.18 14.79|2.57 3.54 5.14 17.68|5.79 6.75 11.25 22.83|16.72 45.66|10.93 31.19|23.47 55.31
RealX-Bench|22.16 26.80 22.16 34.71|24.74 26.80 29.90 40.21|20.62 25.77 19.59 40.72|36.08 51.55|34.54 40.72|51.03 65.98
FVQA|28.39 32.67 28.67 55.00|32.67 35.00 33.33 62.67|36.67 47.33 35.67 63.33|58.67 71.00|54.67 55.00|70.00 79.33
HLE-VL|6.36 7.58 4.24 10.30|10.00 9.09 6.67 11.52|25.15 17.27 23.33 25.45|36.67 43.33|20.00 24.85|41.52 46.67
BC-VL|21.05 15.79 10.53 32.33|28.82 19.55 15.04 33.08|39.10 21.30 40.85 50.13|43.86 58.90|42.11 52.38|51.63 64.66
RealWorldQA|71.37 69.67 69.15 72.67|78.82 76.21 74.38 80.52|72.81 75.56 72.42 76.21|84.58 87.45|82.80 83.13|83.8 86.9
SimpleVQA|54.33 46.27 42.81 70.00|59.00 51.75 49.58 70.33|42.67 46.07 42.96 67.70|60.30 76.40|66.33 68.33|81.33 82.33
HallusionBench|57.76 55.66 54.01 59.07|61.66 53.82 59.38 63.40|62.97 65.85 59.17 64.23|72.77 75.27|62.95 66.07|69.6 74.9
FREAK-VQA|44.68 38.80 33.04 37.05|44.06 45.06 37.92 48.19|44.81 44.56 42.05 50.56|54.94 64.08|45.93 51.44|52.6 59.6
FREAK-MCQ|36.42 31.39 35.31 36.82|44.06 38.73 38.33 45.77|49.40 50.40 45.47 54.73|61.77 70.32|44.37 52.82|52.9 63.1
V*|83.24 73.30 71.73 83.24|85.34 76.44 85.86 88.48|82.72 76.96 73.82 90.05|91.10 93.19|72.80 84.81|90.6 92.1
MMSI-Bench|31.60 27.90 28.10 33.00|35.00 36.60 32.40 38.00|36.30 37.20 36.40 45.30|49.80 57.40|41.20 49.80|46.5 57.7
ERQA|44.00 41.25 35.50 43.00|44.75 46.25 48.25 48.00|55.25 57.50 51.50 58.50|66.50 71.25|60.00 59.00|63.8 66.8
EmbSpatial|78.37 73.71 75.74 78.90|80.54 76.15 78.98 80.00|70.82 73.52 68.19 74.59|80.60 82.53|81.29 82.47|83.7 83.9
SparBench|39.55 38.32 34.63 43.73|46.98 45.29 44.69 46.76|45.51 43.66 44.32 55.29|55.36 62.66|50.12 60.09|60.5 63.8
MindCube|28.36 39.71 41.44 55.48|32.40 45.96 44.13 60.19|57.50 53.65 57.69 70.96|67.40 83.17|60.09 80.00|83.8 89.6
Average|35.99 33.31 32.15 47.14|40.10 38.61 37.66 52.51|43.18 42.78 41.46 55.76|54.26 65.48|45.74 57.15|57.95 67.15`;

  const TABLE = {}; // TABLE[dataset][groupId][method] = {s: "37.71", v: 37.71}
  RAW.trim().split('\n').forEach(line => {
    const [name, ...cols] = line.split('|');
    TABLE[name] = {};
    cols.forEach((c, gi) => {
      const g = GROUPS[gi];
      const vals = c.trim().split(/\s+/);
      TABLE[name][g.id] = {};
      g.methods.forEach((m, mi) => { TABLE[name][g.id][m] = { s: vals[mi], v: parseFloat(vals[mi]) }; });
    });
  });

  // Hero bar chart: averages over 23 benchmarks
  const BACKBONES = ['q8', 'q32', 'kimi', 'gpt5', 'luna', 'sol'].map(id => {
    const g = GROUPS.find(x => x.id === id);
    return { id, name: g.name, base: TABLE.Average[id].Base.v, ours: TABLE.Average[id].Ours.v };
  });

  // Table 12: GPT-6 Luna, 12 datasets, reasoning effort medium/high/xhigh/max
  const EFFORTS = ['medium', 'high', 'xhigh', 'max'];
  const EFFORT = [
    { key: 'base', name: 'Base', color: '--s-base', score: [49.65, 50.62, 55.31, 58.31], cost: [0.62, 0.89, 1.16, 2.92] },
    { key: 'codex', name: 'Codex', color: '--s-codex', score: [48.06, 52.96, 55.77, 57.43], cost: [1.33, 1.47, 1.62, 2.48] },
    { key: 'vs', name: 'Visual Sketchpad', color: '--s-vs', score: [55.62, 55.49, 56.36, 58.47], cost: [1.78, 2.09, 2.45, 4.28] },
    { key: 'ours', name: 'OpenVLHarness', color: '--s-ours', score: [62.89, 66.57, 67.00, 68.63], cost: [0.94, 1.14, 1.39, 2.45] },
  ];

  // Harness comparisons (Table 1 averages + Table 8)
  const HARNESS = [
    { id: 'q8', label: 'Qwen3-VL-8B', note: 'Training-free harnesses on the same backbone. Mean of three runs, 23 benchmarks.',
      bars: [['Base (no tools)', 35.99, '--s-base'], ['OctoTools', 33.31, '--s-octo'], ['Visual Sketchpad', 32.15, '--s-vs'], ['OpenVLHarness', 47.14, '--s-ours']] },
    { id: 'q32', label: 'Qwen3-VL-32B', note: 'Training-free harnesses on the same backbone. Mean of three runs, 23 benchmarks.',
      bars: [['Base (no tools)', 40.10, '--s-base'], ['OctoTools', 38.61, '--s-octo'], ['Visual Sketchpad', 37.66, '--s-vs'], ['OpenVLHarness', 52.51, '--s-ours']] },
    { id: 'luna', label: 'GPT-6 Luna', note: 'Codex runs in code mode with web search disabled. A coding-agent harness does not automatically help multimodal reasoning.',
      bars: [['Base (no tools)', 43.18, '--s-base'], ['Visual Sketchpad', 42.78, '--s-vs'], ['Codex', 41.46, '--s-codex'], ['OpenVLHarness', 55.76, '--s-ours']] },
    { id: 'q25', label: 'vs. fine-tuned (Qwen2.5-VL-7B)', note: 'AdaReasoner, PixelReasoner and DeepEyesV2 fine-tune the backbone for tool use; OpenVLHarness uses the same weights out of the box.',
      bars: [['AdaReasoner', 27.54, '--s-other', 'fine-tuned'], ['PixelReasoner', 29.34, '--s-other', 'fine-tuned'], ['DeepEyesV2', 26.66, '--s-other', 'fine-tuned'], ['OpenVLHarness', 35.58, '--s-ours', 'training-free']] },
  ];

  // Table 2 ablation
  const ABL_STEPS = ['No tools', '+ Tool', '+ Capability layer', '+ Textual memory', '+ Multimodal memory'];
  const ABLATION = {
    '8B': { Overall: [37.06, 40.84, 44.23, 44.93, 47.14], 'Count & Ground': [27.48, 41.70, 46.73, 47.27, 45.46], Search: [18.40, 21.44, 25.97, 26.92, 33.10], 'General VQA': [57.97, 52.41, 56.05, 57.54, 59.81], Spatial: [44.38, 47.83, 48.16, 47.98, 50.82] },
    '32B': { Overall: [41.29, 45.61, 48.80, 49.12, 52.51], 'Count & Ground': [31.72, 43.30, 46.20, 45.74, 51.74], Search: [23.34, 24.89, 32.74, 34.43, 37.96], 'General VQA': [62.16, 61.41, 63.63, 64.84, 66.12], Spatial: [47.93, 52.84, 52.63, 51.46, 54.59] },
  };

  // Table 20 remedy channels (%), Fig. 4d gains
  const REMEDY = [
    { name: 'ERQA', tool: 29, text: 71, none: 0, hs: 4.1, tg: 0.2 },
    { name: 'RealWorldQA', tool: 44, text: 56, none: 0, hs: 3.7, tg: 0.1 },
    { name: 'SparBench', tool: 75, text: 24, none: 1, hs: -0.5, tg: 8.2 },
    { name: 'FREAK-VQA', tool: 62, text: 35, none: 2, hs: -1.0, tg: 4.5 },
  ];

  return { DOMAINS, GROUPS, TABLE, BACKBONES, EFFORTS, EFFORT, HARNESS, ABL_STEPS, ABLATION, REMEDY };
})();
