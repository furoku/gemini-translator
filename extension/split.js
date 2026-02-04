const fs = require('fs');
const content = fs.readFileSync('content.js', 'utf8');

const uiMarker = '// --- Floating Panel UI Construction ---';
const translationMarker = '// --- Translation Logic (Same as before, adapted for Panel) ---';

const uiIndex = content.indexOf(uiMarker);
const translationIndex = content.indexOf(translationMarker);

if (uiIndex === -1 || translationIndex === -1) {
    console.error('Markers not found!');
    process.exit(1);
}

const coreCode = content.substring(0, uiIndex);
const uiCode = content.substring(uiIndex, translationIndex);
const mainCode = content.substring(translationIndex);

fs.writeFileSync('content-core.js', coreCode);
fs.writeFileSync('content-ui.js', uiCode);
fs.writeFileSync('content.js', mainCode);

console.log('Split completed successfully.');
