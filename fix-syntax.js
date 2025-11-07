const fs = require('fs');
const path = require('path');

// Files to fix
const files = [
    'src/services/locationService.ts',
    'src/services/transportService.ts',
    'src/services/userService.ts'
];

files.forEach(filePath => {
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');

        // Fix common patterns
        content = content.replace(/Promise < /g, 'Promise<');
        content = content.replace(/\?: /g, '?: ');
        content = content.replace(/\) catch\(/g, ') catch (');
        content = content.replace(/} catch\(/g, '} catch (');
        content = content.replace(/catch\(error\)/g, 'catch (error: any)');
        content = content.replace(/if\(!([^)]+)\)/g, 'if (!$1)');

        // Fix function declarations that are not properly indented
        content = content.replace(/^(\s*)async ([^{]+): Promise<([^>]+)> \{\s*$/gm, '$1async $2: Promise<$3> {');

        // Fix try blocks that are not properly indented
        content = content.replace(/^(\s*)try \{$/gm, '$1try {');

        fs.writeFileSync(filePath, content);
        console.log(`Fixed syntax in ${filePath}`);
    }
});

console.log('Syntax fixes applied');