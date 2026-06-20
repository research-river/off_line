#!/usr/bin/env python3
"""新しいGPX/KMLファイルを main.js・sw.js・off_line_suijin_map.html に自動登録する。

使い方:
    python3 add_layer.py path/to/新しいルート.gpx
    python3 add_layer.py path/to/新しいルート.gpx --label "表示名" --id custom-id

登録後の git add / commit / push は手動で行うこと。
"""
import argparse
import hashlib
import re
import shutil
import sys
import xml.etree.ElementTree as ET

from layer_tools import (
    BASE_DIR,
    HTML_FILE,
    MAIN_JS,
    SW_JS,
    bump_cache_version,
    find_array_bounds,
    list_data_file_entries,
)
from pathlib import Path

# main.js の既存エントリと被らない配色を順番に割り当てる
COLOR_PALETTE = [
    ("#16a34a", "#16a34a"),
    ("#ca8a04", "#ca8a04"),
    ("#9333ea", "#9333ea"),
    ("#0891b2", "#0891b2"),
    ("#dc2626", "#dc2626"),
    ("#4338ca", "#4338ca"),
]


def slugify(text):
    slug = re.sub(r"[^0-9a-zA-Z\-_]+", "-", text).strip("-").lower()
    if not slug:
        slug = "layer-" + hashlib.sha1(text.encode("utf-8")).hexdigest()[:8]
    return slug


def detect_type(path):
    suffix = path.suffix.lower()
    if suffix == ".gpx":
        return "gpx"
    if suffix == ".kml":
        return "kml"
    raise ValueError("対応していないファイル形式です（.gpxまたは.kmlのみ）: " + path.name)


def validate_xml(path):
    try:
        ET.parse(path)
    except ET.ParseError as error:
        raise ValueError(f"{path.name} はXMLとして読み込めません: {error}")


def insert_data_file_entry(main_js_text, layer_id, filename, file_type, line_color, point_color):
    if re.search(r"id:\s*[\"']" + re.escape(layer_id) + r"[\"']", main_js_text):
        raise ValueError(f"id '{layer_id}' は main.js に既に存在します。別のidを指定してください。")

    _, close_index = find_array_bounds(main_js_text, "dataFiles")
    entry = (
        "  {\n"
        f"    id: \"{layer_id}\",\n"
        f"    file: \"{filename}\",\n"
        f"    type: \"{file_type}\",\n"
        f"    lineColor: \"{line_color}\",\n"
        f"    pointColor: \"{point_color}\",\n"
        "  },\n"
    )
    return main_js_text[:close_index] + entry + main_js_text[close_index:]


def insert_app_shell_entry(sw_js_text, filename):
    rel_path = f"'./{filename}'"
    if rel_path in sw_js_text:
        raise ValueError(f"sw.js に {filename} は既に登録されています。")

    _, close_index = find_array_bounds(sw_js_text, "APP_SHELL")
    entry = f"  {rel_path},\n"
    return sw_js_text[:close_index] + entry + sw_js_text[close_index:]


def insert_layer_panel_checkbox(html_text, layer_id, label):
    if f'data-layer-toggle="{layer_id}"' in html_text:
        raise ValueError(f"HTML に id '{layer_id}' のチェックボックスは既に存在します。")

    marker = '<div id="customLayerPanel"'
    marker_index = html_text.index(marker)
    line_start = html_text.rfind("\n", 0, marker_index) + 1
    checkbox_block = (
        "            <label\n"
        "                ><input\n"
        "                    type=\"checkbox\"\n"
        f"                    data-layer-toggle=\"{layer_id}\"\n"
        "                    checked\n"
        "                />\n"
        f"                {label}</label\n"
        "            >\n"
    )
    return html_text[:line_start] + checkbox_block + html_text[line_start:]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", help="登録するGPX/KMLファイルのパス")
    parser.add_argument("--id", help="レイヤーid（省略時はファイル名から自動生成）")
    parser.add_argument("--label", help="レイヤーパネルの表示名（省略時はファイル名）")
    parser.add_argument("--line-color", help="ライン色 #rrggbb（省略時は自動割り当て）")
    parser.add_argument("--point-color", help="マーカー色 #rrggbb（省略時は自動割り当て）")
    args = parser.parse_args()

    src_path = Path(args.file).expanduser().resolve()
    if not src_path.exists():
        sys.exit(f"ファイルが見つかりません: {src_path}")

    try:
        file_type = detect_type(src_path)
        validate_xml(src_path)

        main_js_text = MAIN_JS.read_text(encoding="utf-8")
        sw_js_text = SW_JS.read_text(encoding="utf-8")
        html_text = HTML_FILE.read_text(encoding="utf-8")

        layer_id = args.id or slugify(src_path.stem)
        label = args.label or src_path.stem

        if args.line_color and args.point_color:
            line_color, point_color = args.line_color, args.point_color
        else:
            palette_index = len(list_data_file_entries(main_js_text))
            line_color, point_color = COLOR_PALETTE[palette_index % len(COLOR_PALETTE)]

        main_js_text = insert_data_file_entry(
            main_js_text, layer_id, src_path.name, file_type, line_color, point_color
        )
        sw_js_text = insert_app_shell_entry(sw_js_text, src_path.name)
        sw_js_text = bump_cache_version(sw_js_text)
        html_text = insert_layer_panel_checkbox(html_text, layer_id, label)
    except ValueError as error:
        sys.exit(f"エラー: {error}")

    dest_path = BASE_DIR / src_path.name
    if dest_path.resolve() != src_path.resolve():
        shutil.copy2(src_path, dest_path)
        print(f"コピーしました: {dest_path}")

    MAIN_JS.write_text(main_js_text, encoding="utf-8")
    SW_JS.write_text(sw_js_text, encoding="utf-8")
    HTML_FILE.write_text(html_text, encoding="utf-8")

    print(f"登録完了: id={layer_id} / label={label} / file={src_path.name}")
    print()
    print("次のコマンドでコミット・pushしてください:")
    print(f"  git add {src_path.name} main.js sw.js off_line_suijin_map.html")
    print('  git commit -m "ルートを追加: ' + label + '"')
    print("  git push")


if __name__ == "__main__":
    main()
