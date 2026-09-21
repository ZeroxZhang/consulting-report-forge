"""固定源字体转换与逐稿字符子集；只有构建时需要 fonttools[woff]。"""
import base64
import hashlib
import io
import json
import os
import pathlib
import sys
import tempfile
import time
import urllib.request
import fontTools
from html.parser import HTMLParser
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset

ROOT = pathlib.Path(__file__).resolve().parents[1]
REVISION = '5e35378e6bda803962ee6fd257e444a7d459660d'
BASE = f'https://raw.githubusercontent.com/google/fonts/{REVISION}/ofl/'
SOURCES = [
    ('notoserifsc', 'NotoSerifSC[wght].ttf', 'Deck Noto Serif SC', [('noto-serif-sc-600', 600), ('noto-serif-sc-700', 700)]),
    ('notosanssc', 'NotoSansSC[wght].ttf', 'Deck Noto Sans SC', [('noto-sans-sc-400', 400), ('noto-sans-sc-600', 600)]),
    ('inter', 'Inter[opsz,wght].ttf', 'Deck Inter', [('inter-400', 400), ('inter-500', 500), ('inter-600', 600)]),
    ('dmseriftext', 'DMSerifText-Regular.ttf', 'Deck DM Serif Text', [('dm-serif-text-400', 400)]),
    ('playfairdisplay', 'PlayfairDisplay[wght].ttf', 'Deck Playfair Display', [('playfair-display-500', 500), ('playfair-display-700', 700)]),
]

def sha(data):
    return hashlib.sha256(data).hexdigest()

def read_cache(file):
    """摘要与内容同文件，避免并发写入的半成品；损坏缓存仅触发重建。"""
    try:
        raw = file.read_bytes()
        return raw[65:] if raw[64:65] == b'\n' and raw[:64] == sha(raw[65:]).encode() else None
    except FileNotFoundError:
        return None

def write_cache(file, data):
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=file.parent, delete=False) as stream:
            temporary = pathlib.Path(stream.name)
            stream.write(sha(data).encode() + b'\n' + data)
        os.replace(temporary, file)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()

def decoded_font(data, cache_dir):
    # WOFF2 glyf 重建是逐页新增字符时的主要成本。按源摘要与真实工具版本复用 SFNT，
    # 不缓存覆盖检查结论；每次仍校验源字体、cmap 和两条角色字体链。
    key = sha(data + ('sfnt-v1-' + fontTools.__version__).encode())
    file = cache_dir / (key + '.sfnt')
    binary = read_cache(file)
    hit = binary is not None
    if not hit:
        font = TTFont(io.BytesIO(data), recalcTimestamp=False)
        font.flavor = None
        out = io.BytesIO()
        font.save(out)
        font.close()
        binary = out.getvalue()
        write_cache(file, binary)
    return TTFont(io.BytesIO(binary), recalcTimestamp=False), hit

class RoleText(HTMLParser):
    """按真正的标题容器分流；不执行 JavaScript，不把字体自身的许可当正文。"""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.texts = {'title': [], 'body': []}

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        for key in ('data-spec', 'data-opt'):
            if attrs.get(key):
                value = json.loads(attrs[key])
                # HTML实体在属性解析时已解码；JSON解析再还原\\u等转义，不求值JS。
                self.texts['body'].append(json.dumps(value, ensure_ascii=False))
        parent = self.stack[-1][1:] if self.stack else ('body', False)
        role = 'title' if set(attrs.get('class', '').split()) & {'slide__title', 'cover-title', 'divider-name'} else parent[0]
        skip = parent[1] or tag in {'script', 'style'}
        if tag not in {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}:
            self.stack.append((tag, role, skip))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        role, skip = self.stack[-1][1:] if self.stack else ('body', False)
        if not skip:
            self.texts[role].append(data)

def prepare(requested=None):
    dest = ROOT / 'assets/fonts'
    dest.mkdir(exist_ok=True)
    previous = json.loads((dest / 'manifest.json').read_text()) if (dest / 'manifest.json').exists() else {'faces': []}
    known = {name for _, _, _, instances in SOURCES for name, _ in instances}
    if requested and set(requested) - known:
        raise ValueError('未知字体实例: ' + ', '.join(sorted(set(requested) - known)))
    entries = [e for e in previous['faces'] if e['id'] not in set(requested or known)]
    for directory, filename, family, instances in SOURCES:
        instances = [(name, weight) for name, weight in instances if not requested or name in requested]
        if not instances:
            continue
        url = BASE + directory + '/' + urllib.parse.quote(filename)
        raw = urllib.request.urlopen(url, timeout=90).read()
        expected = {e['source_sha256'] for e in previous['faces'] if e['source'] == url}
        if expected and sha(raw) not in expected:
            raise ValueError('固定上游源摘要不符: ' + url)
        license_text = urllib.request.urlopen(BASE + directory + '/OFL.txt', timeout=90).read()
        (dest / (directory + '-OFL.txt')).write_bytes(license_text)
        for name, weight in instances:
            font = TTFont(io.BytesIO(raw), recalcTimestamp=False)
            if 'fvar' in font:
                axes = {'wght': weight}
                if any(a.axisTag == 'opsz' for a in font['fvar'].axes):
                    axes['opsz'] = 14
                font = instantiateVariableFont(font, axes, inplace=True)
            # 保留原字体内部名称与版权；CSS 使用专用别名避免受本机同名字体影响。
            font.flavor = 'woff2'
            output = io.BytesIO()
            font.save(output)
            data = output.getvalue()
            (dest / (name + '.woff2')).write_bytes(data)
            entries.append({'id': name, 'family': family, 'weight': weight, 'file': name + '.woff2',
                            'sha256': sha(data), 'bytes': len(data), 'source': url, 'source_sha256': sha(raw),
                            'license': directory + '-OFL.txt', 'upstream_revision': REVISION})
            print(name, len(data), flush=True)
    (dest / 'manifest.json').write_text(json.dumps({'version': '1.1.0', 'faces': entries}, ensure_ascii=False, indent=2) + '\n')

def package(payload):
    started = time.perf_counter()
    timing = {'faces': []}
    cache_dir = pathlib.Path(os.environ.get('FONT_CACHE_DIR') or pathlib.Path(tempfile.gettempdir()) / 'consulting-font-cache-v2')
    cache_dir.mkdir(parents=True, exist_ok=True)
    dest = pathlib.Path(payload.get('assetDir') or ROOT / 'assets/fonts')
    manifest = json.loads((dest / 'manifest.json').read_text())
    ids = set(payload['faces'])
    fonts = []
    chars = set(payload['text'])
    ignored = {'\n', '\r', '\t', '\u200b', '\ufeff'}
    chars.difference_update(ignored)
    parser = RoleText()
    parser.feed(payload.get('html', ''))
    role_chars = {role: set(''.join(parts)) - ignored for role, parts in parser.texts.items()}
    role_chars['body'].update(set(payload.get('supportText', '')) - ignored)
    # HTMLParser完整解码命名/数字实体；角色门禁与实际子集必须使用同一份可见字符。
    for visible_chars in role_chars.values():
        chars.update(visible_chars)
    role_covered = {role: set() for role in role_chars}
    covered = set()
    for entry in manifest['faces']:
        if entry['id'] not in ids:
            continue
        data = (dest / entry['file']).read_bytes()
        if sha(data) != entry['sha256']:
            raise ValueError('字体资源校验失败: ' + entry['id'])
        decoded_at = time.perf_counter()
        font, decoded_hit = decoded_font(data, cache_dir)
        decoded_seconds = time.perf_counter() - decoded_at
        cmap = font.getBestCmap()
        present = {c for c in chars if ord(c) in cmap}
        for role in role_chars:
            if entry['family'] in payload.get('roleFamilies', {}).get(role, []):
                role_covered[role].update(c for c in role_chars[role] if ord(c) in cmap)
        # 中文标题字体也保留西文供极少数缺字回退；常规西文由角色字体优先接管。
        covered.update(present)
        if not present:
            font.close()
            continue
        sample = ''.join(sorted(present))
        cache_file = cache_dir / (sha(data + sample.encode() + ('subset-v2-all-features-' + fontTools.__version__).encode()) + '.woff2')
        subset_at = time.perf_counter()
        binary = read_cache(cache_file)
        subset_hit = binary is not None
        if not subset_hit:
            options = subset.Options()
            options.layout_features = ['*']
            options.name_IDs = ['*']
            options.name_legacy = True
            sub = subset.Subsetter(options=options)
            sub.populate(unicodes=[ord(c) for c in present])
            sub.subset(font)
            font.flavor = 'woff2'
            out = io.BytesIO()
            font.save(out)
            binary = out.getvalue()
            write_cache(cache_file, binary)
        fonts.append({**entry, 'platform_families': list(dict.fromkeys(filter(None, [font['name'].getDebugName(1), font['name'].getDebugName(16)]))),
                      'postscript_name': font['name'].getDebugName(6), 'data': base64.b64encode(binary).decode(), 'subset_sha256': sha(binary),
                      'subset_bytes': len(binary), 'sample': sample})
        timing['faces'].append({'id': entry['id'], 'decodedCacheHit': decoded_hit, 'subsetCacheHit': subset_hit,
                                'decodeSeconds': round(decoded_seconds, 4), 'subsetSeconds': round(time.perf_counter() - subset_at, 4)})
        font.close()
    if chars - covered:
        raise ValueError('缺失字形 glyph: ' + ', '.join(f'U+{ord(c):04X}' for c in sorted(chars - covered)))
    for role in role_chars:
        if role_chars[role] - role_covered[role]:
            raise ValueError(role + ' 字体链缺失字形: ' + ', '.join(f'U+{ord(c):04X}' for c in sorted(role_chars[role] - role_covered[role])))
    if ids - {f['id'] for f in manifest['faces']}:
        raise ValueError('字体资源不完整')
    licenses = {f['license']: (dest / f['license']).read_text() for f in fonts}
    timing['totalSeconds'] = round(time.perf_counter() - started, 4)
    return {'faces': fonts, 'licenses': licenses, 'timing': timing}

if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'prepare':
        prepare(sys.argv[2:] or None)
    else:
        try:
            print(json.dumps(package(json.load(sys.stdin)), ensure_ascii=False))
        except Exception as exc:
            sys.exit(str(exc))
