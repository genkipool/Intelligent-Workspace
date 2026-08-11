import re
import os

with open('src/ui/pages/listGroup/ListGroup.svelte', 'r', encoding='utf-8') as f:
    content = f.read()

# The bookmarks-view-container is closed somewhere.
# To find it reliably, we can use a stack based approach to find the closing tag
start_index = content.find('<div id="bookmarks-view-container"')
if start_index == -1:
    print("Could not find bookmarks-view-container")
    exit()

stack = []
end_index = -1
i = start_index
while i < len(content):
    if content[i:i+4] == '<div':
        stack.append('div')
    elif content[i:i+5] == '</div':
        if stack and stack[-1] == 'div':
            stack.pop()
            if not stack:
                end_index = i + 6
                break
    i += 1

if end_index != -1:
    bookmarks_html = content[start_index:end_index]
    
    svelte_component = f"""<script>
    import {{ t }} from '../../stores/i18nStore.js';
</script>

{bookmarks_html}
"""
    os.makedirs('src/ui/components/bookmarks', exist_ok=True)
    with open('src/ui/components/bookmarks/BookmarksView.svelte', 'w', encoding='utf-8') as f:
        f.write(svelte_component)
        
    new_content = content[:start_index] + "\n<BookmarksView />\n" + content[end_index:]
    
    # Add import
    import_stmt = "import BookmarksView from '../../components/bookmarks/BookmarksView.svelte';\n"
    if "import BookmarksView" not in new_content:
        new_content = new_content.replace("import Icons from '../../components/Icons.svelte';", "import Icons from '../../components/Icons.svelte';\n    " + import_stmt)
        
    with open('src/ui/pages/listGroup/ListGroup.svelte', 'w', encoding='utf-8') as f:
        f.write(new_content)
        
    print("Extracted BookmarksView.svelte")
else:
    print("Could not find closing tag")
