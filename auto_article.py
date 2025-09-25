import os

BLOG_DIR = os.path.dirname(os.path.abspath(__file__))
PUMA_CATEGORY_FILE = os.path.join(BLOG_DIR, 'category_puma.html')
ADIDAS_CATEGORY_FILE = os.path.join(BLOG_DIR, 'category_adidas.html')

def get_category_files(prefix):
    return [f for f in os.listdir(BLOG_DIR)
            if f.lower().startswith(prefix.lower()) and f.endswith('.html')]

def extract_title_from_html(filepath):
    try:
        with open(filepath, encoding='utf-8') as f:
            for line in f:
                if '<title>' in line:
                    return line.split('<title>')[1].split('</title>')[0].strip()
    except Exception:
        pass
    return os.path.basename(filepath).replace('.html', '')

def make_category_list(files, brand, color, hover_color, existing_titles):
    items = []
    for f in files:
        filepath = os.path.join(BLOG_DIR, f)
        title = extract_title_from_html(filepath)
        if title in existing_titles:
            continue
        items.append(f'<div class="rounded-2xl shadow-sm overflow-hidden bg-white p-4 border" data-category="{brand}">\n'
                    f'  <h3 class="text-lg font-bold mb-2">{title}</h3>\n'
                    f'  <a href="{f}" class="inline-block px-4 py-2 {color} text-white rounded-lg font-semibold shadow {hover_color}">記事を読む</a>\n'
                    f'</div>')
    return '\n'.join(items)

def extract_existing_titles(html, marker):
    # marker以降の部分から<h3>タグのタイトルを抽出
    after_marker = html.split(marker)[1] if marker in html else ''
    import re
    return set(re.findall(r'<h3[^>]*>(.*?)</h3>', after_marker))

def update_category_html(category_file, prefix, brand, color, hover_color, marker):
    with open(category_file, encoding='utf-8') as f:
        html = f.read()
    files = get_category_files(prefix)
    existing_titles = extract_existing_titles(html, marker)
    list_html = make_category_list(files, brand, color, hover_color, existing_titles)
    # 記事リスト部分を置換
    new_html = html.split(marker)[0] + marker + '\n' + list_html + '\n' + html.split(marker)[1]
    with open(category_file, 'w', encoding='utf-8') as f:
        f.write(new_html)

if __name__ == '__main__':
    update_category_html(PUMA_CATEGORY_FILE, 'PUMA', 'プーマ', 'bg-orange-500', 'hover:bg-orange-600', '<!-- PUMA記事自動挿入 -->')
    update_category_html(ADIDAS_CATEGORY_FILE, 'adidas', 'アディダス', 'bg-blue-500', 'hover:bg-blue-600', '<!-- adidas記事自動挿入 -->')
