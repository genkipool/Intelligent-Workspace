with open('src/ui/pages/listGroup/ListGroup.svelte', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
in_svg_defs = False
svg_lines = 0

for i, line in enumerate(lines):
    if line.startswith('<svg style="display: none;" aria-hidden="true">'):
        in_svg_defs = True
        svg_lines += 1
        continue
        
    if in_svg_defs:
        svg_lines += 1
        if '</svg>' in line and svg_lines > 500: # heuristic to find the end of the giant block
            in_svg_defs = False
        continue
        
    if "import { initListGroup } from './listGroup.js';" in line:
        new_lines.append(line)
        new_lines.append("    import Icons from '../../components/Icons.svelte';\n")
        continue
        
    if "</script>" in line:
        new_lines.append(line)
        new_lines.append("\n<Icons />\n")
        continue

    new_lines.append(line)

with open('src/ui/pages/listGroup/ListGroup.svelte', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f"Removed {svg_lines} lines of SVG defs.")
