const { version } = require('../guitar-app/package.json');
const fs = require('fs');
fs.writeFileSync(
  './src/version.ts',
  `export const APP_VERSION = '${version}';\n`
);
