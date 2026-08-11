import fs from 'fs';
import path from 'path';

function resolveAndFixImports(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    const fileDir = path.dirname(filePath);
    const subdirs = ['rules', 'customize_hints', 'offscreen', 'selection-preview', 'pomodoro-dashboard', 'listGroup'];
    const srcDir = path.resolve('src');

    // Find all relative imports
    const importRegex = /from\s+['"]([^'"]+)['"]/g;
    let modified = false;

    content = content.replace(importRegex, (match, importPath) => {
        if (importPath.startsWith('.')) {
            if (importPath.includes('utils/') || importPath.includes('lib/') || importPath.includes('styles/')) {
                let targetBase = '';
                if (importPath.includes('utils/')) targetBase = 'utils';
                else if (importPath.includes('lib/')) targetBase = 'lib';
                else if (importPath.includes('styles/')) targetBase = 'ui/styles';

                const targetDir = path.join(srcDir, targetBase);
                const importFile = importPath.split('/').pop();

                let correctRelativePath = path.relative(fileDir, path.join(targetDir, importFile));
                if (!correctRelativePath.startsWith('.')) {
                    correctRelativePath = './' + correctRelativePath;
                }
                correctRelativePath = correctRelativePath.replace(/\\/g, '/');

                if (importPath !== correctRelativePath) {
                    modified = true;
                    return "from '" + correctRelativePath + "'";
                }
            }
        }
        return match;
    });

    // Handle dynamic imports import(...)
    const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    content = content.replace(dynamicImportRegex, (match, importPath) => {
        if (importPath.startsWith('.')) {
            if (importPath.includes('utils/') || importPath.includes('lib/') || importPath.includes('styles/')) {
                let targetBase = '';
                if (importPath.includes('utils/')) targetBase = 'utils';
                else if (importPath.includes('lib/')) targetBase = 'lib';
                else if (importPath.includes('styles/')) targetBase = 'ui/styles';

                const targetDir = path.join(srcDir, targetBase);
                const importFile = importPath.split('/').pop();

                let correctRelativePath = path.relative(fileDir, path.join(targetDir, importFile));
                if (!correctRelativePath.startsWith('.')) {
                    correctRelativePath = './' + correctRelativePath;
                }
                correctRelativePath = correctRelativePath.replace(/\\/g, '/');

                if (importPath !== correctRelativePath) {
                    modified = true;
                    return "import('" + correctRelativePath + "')";
                }
            }
        }
        return match;
    });

    if (filePath.endsWith('.html')) {
        const scriptRegex = /<script\s+([^>]*?)src=['"]([^'"]+)['"]/g;
        content = content.replace(scriptRegex, (match, p1, srcPath) => {
            if (srcPath.startsWith('.') && (srcPath.includes('utils/') || srcPath.includes('lib/'))) {
                let targetBase = '';
                if (srcPath.includes('utils/')) targetBase = 'utils';
                else if (srcPath.includes('lib/')) targetBase = 'lib';

                const targetDir = path.join(srcDir, targetBase);
                const importFile = srcPath.split('/').pop();

                let correctRelativePath = path.relative(fileDir, path.join(targetDir, importFile));
                if (!correctRelativePath.startsWith('.')) correctRelativePath = './' + correctRelativePath;
                correctRelativePath = correctRelativePath.replace(/\\/g, '/');

                if (srcPath !== correctRelativePath) {
                    modified = true;
                    return '<script ' + p1 + 'src="' + correctRelativePath + '"';
                }
            }
            return match;
        });
    }

    if (modified) {
        fs.writeFileSync(filePath, content);
        console.log('Fixed paths in:', filePath);
    }
}

function walkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walkDir(fullPath);
        } else if (fullPath.endsWith('.js') || fullPath.endsWith('.html')) {
            resolveAndFixImports(fullPath);
        }
    }
}

walkDir('src/ui/pages');
console.log('Path resolution complete.');
