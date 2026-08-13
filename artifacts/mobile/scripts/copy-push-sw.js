const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const source = path.join(projectRoot, 'public', 'push-sw.js');
const staticBuild = path.join(projectRoot, 'static-build');

if (!fs.existsSync(staticBuild)) {
  throw new Error('static-build does not exist; run the Expo build first.');
}

fs.copyFileSync(source, path.join(staticBuild, 'push-sw.js'));
console.log('Copied push-sw.js to static-build/');
