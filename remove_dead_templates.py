with open('src/ui/pages/listGroup/ListGroup.svelte', 'r', encoding='utf-8') as f:
    content = f.read()

import re
# Remove <template id="group-item-template"> ... </template>
content = re.sub(r'<template id="group-item-template">.*?</template>', '', content, flags=re.DOTALL)

# Remove <template id="hidden-group-indicator-template"> ... </template>
content = re.sub(r'<template id="hidden-group-indicator-template">.*?</template>', '', content, flags=re.DOTALL)

# Remove <template id="domain-subgroup-template"> ... </template>
content = re.sub(r'<template id="domain-subgroup-template">.*?</template>', '', content, flags=re.DOTALL)

# Remove <template id="tab-item-template"> ... </template>
content = re.sub(r'<template id="tab-item-template">.*?</template>', '', content, flags=re.DOTALL)

with open('src/ui/pages/listGroup/ListGroup.svelte', 'w', encoding='utf-8') as f:
    f.write(content)
