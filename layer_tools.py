"""add_layer.py / remove_layer.py が共通で使う main.js・sw.js 操作ヘルパー。"""
import re
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
MAIN_JS = BASE_DIR / "main.js"
SW_JS = BASE_DIR / "sw.js"
HTML_FILE = BASE_DIR / "off_line_suijin_map.html"

ENTRY_PATTERN = re.compile(
    r"\{\s*"
    r"id:\s*\"(?P<id>[^\"]+)\",\s*"
    r"file:\s*\"(?P<file>[^\"]+)\",\s*"
    r"type:\s*\"(?P<type>[^\"]+)\",\s*"
    r"lineColor:\s*\"(?P<lineColor>[^\"]+)\",\s*"
    r"pointColor:\s*\"(?P<pointColor>[^\"]+)\",\s*"
    r"\},?[ \t]*\n?"
)


def find_array_bounds(text, var_name):
    match = re.search(r"const " + re.escape(var_name) + r" = \[", text)
    if not match:
        raise ValueError(f"{var_name} 配列が見つかりません。")
    close_index = text.index("];", match.end())
    return match.end(), close_index


def list_data_file_entries(main_js_text):
    """dataFiles配列内の各エントリを、全文中の位置(span)付きで返す。"""
    start, end = find_array_bounds(main_js_text, "dataFiles")
    entries = []
    for match in ENTRY_PATTERN.finditer(main_js_text, start, end):
        entry = match.groupdict()
        entry["span"] = (match.start(), match.end())
        entries.append(entry)
    return entries


def bump_cache_version(sw_js_text):
    def replacer(match):
        return f"const CACHE = 'suijin-map-v{int(match.group(1)) + 1}';"

    new_text, count = re.subn(r"const CACHE = 'suijin-map-v(\d+)';", replacer, sw_js_text)
    if count == 0:
        raise ValueError("sw.js に CACHE バージョン定義が見つかりません。")
    return new_text
