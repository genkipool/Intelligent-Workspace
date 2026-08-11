import re

with open('src/ui/pages/about/About.svelte', 'r', encoding='utf-8') as f:
    content = f.read()

# Regex to find material icon feature items
# <div class="feature-item">\s*<span class="material-icons-sharp feature-icon"[^>]*>([^<]+)</span>\s*<span[^>]*>\s*\{\$t\(\'([^\']+)\'\)\}\s*</span\s*>\s*</div>
material_pattern = re.compile(
    r'<div class="feature-item">\s*<span class="material-icons-sharp feature-icon"[^>]*>([^<]+)</span>\s*<span[^>]*>\s*\{\$t\(\'([^\']+)\'\)\}\s*</span\s*>\s*</div>',
    re.MULTILINE
)

def repl_material(m):
    icon_name = m.group(1).strip()
    text_key = m.group(2).strip()
    return f'<FeatureItem isMaterial={{true}} iconName="{icon_name}" textKey="{text_key}" />'

content = material_pattern.sub(repl_material, content)

svg_pattern = re.compile(
    r'<div class="feature-item">\s*<span class="feature-icon"\s*>\s*<svg.*?</svg>\s*</span\s*>\s*<span[^>]*>\s*\{\$t\(\'([^\']+)\'\)\}\s*</span\s*>\s*</div>',
    re.MULTILINE | re.DOTALL
)

svg_map = {
    'feature_duplicateRemoval': 'icon-duplicates',
    'feature_splitScreen': 'icon-split-screen',
    'feature_openInPanel': 'icon-open-panel',
    'featureAIAssistant': 'icon-gemini',
    'feature_youtubeIntegration': 'icon-play-solid',
    'feature_fileDownloader': 'icon-download',
    'feature_readerView': 'icon-reader',
    'feature_v100_core_rule_management': 'icon-rules',
    # Others will just get icon-star or something similar, which we can fix later
}

def repl_svg(m):
    text_key = m.group(1).strip()
    svg_id = svg_map.get(text_key, 'icon-star') 
    return f'<FeatureItem isMaterial={{false}} svgId="{svg_id}" textKey="{text_key}" />'

content = svg_pattern.sub(repl_svg, content)

with open('src/ui/pages/about/About.svelte', 'w', encoding='utf-8') as f:
    f.write(content)
