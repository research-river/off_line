#!/usr/bin/env python3
"""登録済みのGPX/KMLレイヤーを選んで main.js・sw.js・off_line_suijin_map.html から削除する。

使い方:
    python3 remove_layer.py

削除後の git add / commit / push は手動で行うこと。
"""
import sys

from layer_tools import (
    BASE_DIR,
    HTML_FILE,
    MAIN_JS,
    SW_JS,
    bump_cache_version,
    list_data_file_entries,
)


def remove_html_checkbox(html_text, layer_id):
    marker = f'data-layer-toggle="{layer_id}"'
    marker_index = html_text.find(marker)
    if marker_index == -1:
        print(f"警告: HTML内に id '{layer_id}' のチェックボックスが見つかりませんでした。", file=sys.stderr)
        return html_text

    label_start = html_text.rfind("<label", 0, marker_index)
    block_start = html_text.rfind("\n", 0, label_start) + 1

    closing_index = html_text.index("</label", marker_index)
    next_close_angle = html_text.index(">", closing_index)
    block_end = html_text.index("\n", next_close_angle) + 1

    return html_text[:block_start] + html_text[block_end:]


def remove_app_shell_entry(sw_js_text, filename):
    target = f"'./{filename}'"
    index = sw_js_text.find(target)
    if index == -1:
        print(f"警告: sw.js に {filename} が見つかりませんでした。", file=sys.stderr)
        return sw_js_text

    line_start = sw_js_text.rfind("\n", 0, index) + 1
    line_end = sw_js_text.index("\n", index) + 1
    return sw_js_text[:line_start] + sw_js_text[line_end:]


def main():
    main_js_text = MAIN_JS.read_text(encoding="utf-8")
    sw_js_text = SW_JS.read_text(encoding="utf-8")
    html_text = HTML_FILE.read_text(encoding="utf-8")

    entries = list_data_file_entries(main_js_text)
    if not entries:
        sys.exit("main.js に登録されているレイヤーがありません。")

    print("登録済みレイヤー一覧:")
    for index, entry in enumerate(entries, start=1):
        print(f"  {index}. {entry['file']}  (id={entry['id']})")

    choice = input(
        "削除する番号を入力してください（複数可、スペース区切り。中止はEnter）: "
    ).strip()
    if not choice:
        print("中止しました。")
        return

    try:
        indices = sorted({int(token) for token in choice.split()}, reverse=True)
    except ValueError:
        sys.exit("番号は半角数字で入力してください。")

    targets = []
    for index in indices:
        if not 1 <= index <= len(entries):
            sys.exit(f"番号 {index} は範囲外です。")
        targets.append(entries[index - 1])

    delete_files = (
        input("対応するGPX/KMLファイル自体も削除しますか？ [y/N]: ").strip().lower() == "y"
    )

    # main.js: 後ろのエントリから順に削除（spanのずれを防ぐため）
    # 行頭インデントも含めて削除し、空白だけの行が残らないようにする
    for entry in sorted(targets, key=lambda e: e["span"][0], reverse=True):
        start, end = entry["span"]
        line_start = main_js_text.rfind("\n", 0, start) + 1
        main_js_text = main_js_text[:line_start] + main_js_text[end:]

    for entry in targets:
        html_text = remove_html_checkbox(html_text, entry["id"])
        sw_js_text = remove_app_shell_entry(sw_js_text, entry["file"])

    sw_js_text = bump_cache_version(sw_js_text)

    MAIN_JS.write_text(main_js_text, encoding="utf-8")
    SW_JS.write_text(sw_js_text, encoding="utf-8")
    HTML_FILE.write_text(html_text, encoding="utf-8")

    removed_files = []
    for entry in targets:
        print(f"削除しました: id={entry['id']} / file={entry['file']}")
        if delete_files:
            path = BASE_DIR / entry["file"]
            if path.exists():
                path.unlink()
                removed_files.append(entry["file"])
                print(f"  ファイルも削除: {path.name}")

    print()
    print("次のコマンドでコミット・pushしてください:")
    if removed_files:
        git_rm = " ".join(f'"{name}"' for name in removed_files)
        print(f"  git rm {git_rm}")
    print("  git add main.js sw.js off_line_suijin_map.html")
    print('  git commit -m "ルートを削除"')
    print("  git push")


if __name__ == "__main__":
    main()
