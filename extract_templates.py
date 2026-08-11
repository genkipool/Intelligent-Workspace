import re
import os

with open('src/ui/pages/listGroup/ListGroup.svelte', 'r', encoding='utf-8') as f:
    content = f.read()

# Find all <template ...> ... </template> blocks that don't have nested templates
# Actually, <template> tags can't be nested in standard HTML (well they can, but usually aren't here)
# Some templates have data-template-id="overflow-actions-template" without closing tag?
# Wait, `<template data-template-id="overflow-actions-template"></template>` are empty placeholders!
# The ones we want to extract are the ones with id="..."

templates = re.findall(r'(<template[^>]*>.*?</template>)', content, flags=re.DOTALL)

if not templates:
    print("No templates found")
    exit()

extracted_html = "\n\n".join(templates)

svelte_component = f"""<script>
    import {{ t }} from '../../stores/i18nStore.js';
</script>

{extracted_html}
"""

os.makedirs('src/ui/components/listGroup', exist_ok=True)
with open('src/ui/components/listGroup/VanillaTemplates.svelte', 'w', encoding='utf-8') as f:
    f.write(svelte_component)

# Remove the extracted templates from ListGroup.svelte
new_content = content
for t in templates:
    # Only remove if it's an exact match
    new_content = new_content.replace(t, '')

# Add import
import_stmt = "import VanillaTemplates from '../../components/listGroup/VanillaTemplates.svelte';\n"
if "import VanillaTemplates" not in new_content:
    new_content = new_content.replace("import Icons from '../../components/Icons.svelte';", "import Icons from '../../components/Icons.svelte';\n    " + import_stmt)

# Insert <VanillaTemplates /> before </main> or at the end of <div id="app">
if '<VanillaTemplates />' not in new_content:
    if '</main>' in new_content:
        new_content = new_content.replace('</main>', '<VanillaTemplates />\n</main>')
    else:
        new_content += "\n<VanillaTemplates />\n"

with open('src/ui/pages/listGroup/ListGroup.svelte', 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f"Extracted {len(templates)} templates into VanillaTemplates.svelte")
