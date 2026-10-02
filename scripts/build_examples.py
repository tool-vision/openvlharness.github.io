"""Convert paper_examples bundles into a compact JS data file + resized images for the site.

Usage:
    # unzip every bundle from mini-vlm-toolkit/paper_examples into one folder, then
    python scripts/build_examples.py path/to/unzipped_bundles

Writes static/js/examples.js and static/examples/<id>/*.jpg. Requires Pillow.
"""
import glob, json, os, re, html, sys
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else 'paper_examples_unzipped'
SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG_OUT = os.path.join(SITE, 'static/examples')
JS_OUT = os.path.join(SITE, 'static/js/examples.js')
MAXDIM = 1000

MODEL = {'GPT-6-Sol': 'GPT-6 Sol', 'GPT-6-Luna': 'GPT-6 Luna', 'Qwen3-VL-32B': 'Qwen3-VL-32B'}
DATASET = {'V-star': 'V*', 'OdinW-13-PascalVOC': 'OdinW-13'}
DOMAIN = {'counting': 'count', 'grounding': 'count', 'counting-grounding': 'count', 'search': 'search', 'vqa': 'vqa', 'spatial': 'spatial'}
TOOL = {
    'Visual_Grounding_Tool': 'grounding', 'Zoom_In_Tool': 'zoom', 'OCR_Tool': 'ocr', 'Depth_Estimation_Tool': 'depth',
    'Camera_Trajectory_Tool': 'camera', 'Text_Search_Tool': 'tsearch', 'Image_Search_Tool': 'isearch',
    'Webpage_Visit_Tool': 'web', 'Python_Coding_Agent_Tool': 'code',
}


def save_thumb(src, dst, size=(112, 84)):
    """Small center-cropped WebP for the example strip and demo sample chips (shown at ~44x34)."""
    from PIL import ImageOps
    im = Image.open(src).convert('RGB')
    ImageOps.fit(im, size, Image.LANCZOS).save(dst, 'WEBP', quality=72, method=6)


def save_img(src, dst):
    im = Image.open(src)
    if im.mode in ('RGBA', 'LA', 'P'):
        im = im.convert('RGBA')
        bg = Image.new('RGB', im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1])
        im = bg
    else:
        im = im.convert('RGB')
    im.thumbnail((MAXDIM, MAXDIM), Image.LANCZOS)
    im.save(dst, 'JPEG', quality=80, optimize=True, progressive=True)
    return im.size


def latex_to_text(s):
    s = re.sub(r'\\begin\{CJK\}\{[^}]*\}\{[^}]*\}', '', s).replace('\\end{CJK}', '')
    reps = [('\\allowbreak{}', ''), ('\\\\{}', '\n'), ('\\mbox{}', ''), ('\\_', '_'), ('\\textquotesingle{}', "'"),
            ('\\textasciigrave{}', '`'), ('\\textless{}', '<'), ('\\textgreater{}', '>'), ('\\{', '{'), ('\\}', '}'),
            ('\\%', '%'), ('\\&', '&'), ('\\#', '#'), ('\\$', '$'), ('\\textasciitilde{}', '~'), ('\\textbackslash{}', '\\'),
            ('\\textasciicircum{}', '^'), ('``', '\u201c'), ("''", '\u201d'), ('---', '\u2014'), ('--', '\u2013')]
    for a, b in reps:
        s = s.replace(a, b)
    s = s.replace('~', ' ').replace('\\,', '\u202f')
    s = html.escape(s, quote=False)
    s = re.sub(r'\\textbf\{([^{}]*)\}', r'<b>\1</b>', s)
    s = re.sub(r'\\(?:emph|textit)\{([^{}]*)\}', r'<i>\1</i>', s)
    s = re.sub(r'\\texttt\{([^{}]*)\}', r'<code>\1</code>', s)
    s = re.sub(r'\$\\times\$', '\u00d7', s)
    s = re.sub(r'\$([^$]*)\$', r'\1', s)
    return s.strip()


def braced(s, start):
    """return content of the {...} starting at s[start] == '{'"""
    depth = 0
    for i in range(start, len(s)):
        if s[i] == '{' and (i == 0 or s[i - 1] != '\\'):
            depth += 1
        elif s[i] == '}' and s[i - 1] != '\\':
            depth -= 1
            if depth == 0:
                return s[start + 1:i]
    return ''


def parse_header(base):
    hs = glob.glob(os.path.join(base, 'appendix_latex', '*header.tex'))
    if not hs:
        return {}
    s = open(hs[0]).read()
    out = {}
    i = s.find('\\exOverview{')
    if i >= 0:
        ov = braced(s, i + len('\\exOverview'))
        parts = {}
        for para in re.split(r'\n\s*\n', ov):
            m = re.match(r'\s*\\textbf\{([^}]*)\}\s*(.*)', para, re.S)
            if m:
                parts[m.group(1).strip().rstrip('.').lower()] = latex_to_text(m.group(2))
        out['overview'] = parts
    m = re.search(r'\\exLabel\{Without tools\}\{([^}]*)\}\s*\\begin\{exverb\}(.*?)\\end\{exverb\}', s, re.S)
    if m:
        out['notool'] = latex_to_text(m.group(2))
    return out


def clean_say(t):
    if not t:
        return ''
    t = re.sub(r'</?thinking>', '', t)
    t = re.sub(r'<tool_call>.*?</tool_call>', '', t, flags=re.S)
    t = re.sub(r'<answer>.*?</answer>', '', t, flags=re.S)
    return t.strip()


def model_says(traj):
    """text the model emitted alongside each tool call, in call order; and the final answer text.
    Responses-API logs store the assistant text right after the function_call it accompanies;
    chat-format logs put it in the same message as tool_calls."""
    says, final = [], ''
    for m in traj['messages']:
        typ, role = m.get('type'), m.get('role')
        if typ == 'message' and role == 'assistant':
            txt = '\n'.join(c['text'] for c in (m.get('content') or []) if isinstance(c, dict) and c.get('text'))
            if '<answer>' in txt or not says:
                final = txt if '<answer>' in txt else final
                if not says and '<answer>' not in txt:
                    says.append(None)  # text before any call: keep slot-free
                    says.pop()
                continue
            says[-1] = (says[-1] + '\n' if says[-1] else '') + clean_say(txt)
        elif typ == 'function_call':
            says.append('')
        elif typ is None and role == 'assistant':
            content = m.get('content') or ''
            if isinstance(content, list):
                content = '\n'.join(c.get('text', '') for c in content if isinstance(c, dict))
            if m.get('tool_calls'):
                for j, _ in enumerate(m['tool_calls']):
                    says.append(clean_say(content) if j == 0 else '')
            elif typ is None and 'tool_calls' not in m:
                final = content
    return says, final


def unwrap(text):
    text = text.strip()
    text = re.sub(r'^Tool `[^`]+` \(tool_call_id=[^)]*\) returned:\s*', '', text)
    if text.startswith('{') and '"result"' in text:
        try:
            j = json.loads(text)
            if isinstance(j, dict) and 'result' in j:
                r = j['result']
                if j.get('error'):
                    r = (r or '') + '\nError: ' + str(j['error'])
                return (r or '').strip()
        except Exception:
            pass
    return text


def split_code(text):
    m = re.search(r'```python\n(.*?)```', text, re.S)
    code = m.group(1).rstrip() if m else ''
    rest = text[m.end():].strip() if m else text
    rest = re.sub(r'^Execution output:\s*', '', rest)
    return code, rest


def answer_text(s):
    s = str(s)
    m = re.search(r'<answer>(.*?)</answer>', s, re.S)
    if m:
        s = m.group(1)
    return s.strip().strip('`').strip()


BOX_RE = re.compile(r'\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]')


def full_boxes(text):
    """All [x1, y1, x2, y2] boxes (0-1000 scale) listed after 'are:' in a grounding output."""
    i = text.find('are:')
    return [[round(float(v)) for v in m.groups()] for m in BOX_RE.finditer(text[i:] if i >= 0 else text)]


def clip(s, n):
    return s if len(s) <= n else s[:n].rstrip() + ' …'


def main():
    os.makedirs(IMG_OUT, exist_ok=True)
    examples = []
    for base in sorted(glob.glob(os.path.join(SRC, '*', '*', ''))):
        meta = json.load(open(os.path.join(base, 'meta.json')))
        traj = json.load(open(os.path.join(base, 'trajectory.json')))
        num = meta['example_number']
        eid = f'ex{int(num):02d}' if str(num).isdigit() else str(num)
        out_dir = os.path.join(IMG_OUT, eid)
        os.makedirs(out_dir, exist_ok=True)
        idmap = json.load(open(os.path.join(base, 'images', 'image_id_map.json')))
        sizes = {}

        def img(handle):
            if handle not in idmap:
                return None
            fn = handle.replace('tool_generated_image', 'tool').replace('input_image', 'input') + '.jpg'
            dst = os.path.join(out_dir, fn)
            if not os.path.exists(dst):
                sizes[handle] = save_img(os.path.join(base, 'images', idmap[handle]), dst)
            return {'h': handle, 'src': f'static/examples/{eid}/{fn}'}

        inputs = [img(h) for h in idmap if h.startswith('input_image')]
        if inputs:
            save_thumb(os.path.join(SITE, inputs[0]['src']), os.path.join(out_dir, 'thumb.webp'))
        says, final = model_says(traj)
        steps = []
        call_dirs = sorted(glob.glob(os.path.join(base, 'calls', '*', '')))
        for k, cd in enumerate(call_dirs):
            tool = re.sub(r'^\d+_', '', os.path.basename(cd.rstrip('/')))
            args = json.load(open(os.path.join(cd, 'args.json'))) if os.path.exists(os.path.join(cd, 'args.json')) else {}
            if isinstance(args, dict) and 'arguments' in args and isinstance(args['arguments'], (dict, str)):
                args = args['arguments']
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except Exception:
                    args = {'raw': args}
            raw = open(os.path.join(cd, 'transcript_output.txt')).read() if os.path.exists(os.path.join(cd, 'transcript_output.txt')) else ''
            text = unwrap(raw)
            produced = []
            for h in dict.fromkeys(re.findall(r'tool_generated_image_\d+', raw)):
                im = img(h)
                if im:
                    produced.append(im)
            step = {'tool': tool, 'cap': TOOL.get(tool, ''), 'args': args, 'imgs': produced}
            if k < len(says) and says[k]:
                step['say'] = clip(says[k], 1200)
            if tool == 'Python_Coding_Agent_Tool':
                code, rest = split_code(text)
                step['code'] = clip(code, 6000)
                step['out'] = clip(rest, 1500)
            else:
                step['out'] = clip(text, 2500)
            if tool == 'Visual_Grounding_Tool':
                step['boxes'] = full_boxes(text)  # every box; 'out' is clipped for display
            steps.append(step)

        hdr = parse_header(base)
        q = re.sub(r'^(Question:\s*)+', '', meta['question'].strip())
        ev = meta.get('eval') or {}
        pred, gt = answer_text(meta['prediction']), str(meta['ground_truth'])
        box_task = meta['dataset'] in ('OdinW-13-PascalVOC', 'FSCD-147')
        if box_task:
            try:
                pj = json.loads(pred)
                pred = f'{len(pj)} boxes'
            except Exception:
                pass
            try:
                gj = json.loads(gt.replace("'", '"')) if gt.strip().startswith('[') else None
                if gj is not None:
                    gt = f'{len(gj)} boxes'
            except Exception:
                gt = ''
        notool = hdr.get('notool', '').strip().strip('`').strip()
        if box_task and notool.startswith('['):
            try:
                notool = f'{len(json.loads(notool))} boxes'
            except Exception:
                notool = ''
        if not meta.get('in_paper'):
            notool = ''  # extras have no appendix entry
        examples.append({
            'id': eid, 'num': num, 'inPaper': bool(meta.get('in_paper')),
            'dataset': DATASET.get(meta['dataset'], meta['dataset']), 'model': MODEL.get(meta['model'], meta['model']),
            'domain': DOMAIN.get(meta['domain'], meta['domain']), 'tags': [t for t in meta['tags'] if t != 'composition'],
            'composition': 'composition' in meta['tags'],
            'slug': meta['slug'], 'question': q, 'pred': clip(pred, 400), 'gt': clip(gt, 300),
            'score': ev.get('score'), 'correct': ev.get('correct'),
            'overview': hdr.get('overview', {}), 'notool': clip(notool, 600),
            'final': clip(clean_say(final) or '', 1500),
            'inputs': [i for i in inputs if i], 'steps': steps,
        })
        print(eid, meta['dataset'], len(steps), 'steps', len(inputs), 'inputs', 'overview' if hdr.get('overview') else '-')

    js = '/* Generated by build_examples.py from the paper_examples bundles. Do not edit by hand. */\n'
    js += 'window.OVH_EXAMPLES = ' + json.dumps(examples, ensure_ascii=False, separators=(',', ':')) + ';\n'
    open(JS_OUT, 'w').write(js)
    print('wrote', JS_OUT, len(js) // 1024, 'KB')


if __name__ == '__main__':
    main()
