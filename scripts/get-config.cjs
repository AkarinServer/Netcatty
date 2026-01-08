const fs = require('fs');
const path = require('path');

const pkgPath = path.resolve(__dirname, '../package.json');
const builderPath = path.resolve(__dirname, '../electron-builder.json');

try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    let builder = {};
    if (fs.existsSync(builderPath)) {
        builder = JSON.parse(fs.readFileSync(builderPath, 'utf8'));
    }

    const safe = (str) => (str || '').replace(/"/g, '\\"');

    console.log(`APP_NAME="${safe(pkg.name)}"`);
    console.log(`VERSION="${safe(pkg.version)}"`);
    console.log(`PRODUCT_NAME="${safe(builder.productName || pkg.name)}"`);
    console.log(`APP_ID="${safe(builder.appId || 'com.example.app')}"`);
    console.log(`DESCRIPTION="${safe(pkg.description || '')}"`);
    console.log(`AUTHOR="${safe(pkg.author || '')}"`);
    console.log(`MAINTAINER="${safe(pkg.author || '')}"`);
    
    // Linux specific
    const linux = builder.linux || {};
    console.log(`CATEGORY="${safe(linux.category || 'Utility')}"`);
    
} catch (e) {
    console.error('Error reading config:', e);
    process.exit(1);
}
