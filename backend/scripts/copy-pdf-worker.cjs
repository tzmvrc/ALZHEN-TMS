const {copyFileSync}=require('node:fs');
const {resolve}=require('node:path');
copyFileSync(resolve(__dirname,'../src/services/pdf-renderer.worker.mjs'),resolve(__dirname,'../dist/services/pdf-renderer.worker.mjs'));
