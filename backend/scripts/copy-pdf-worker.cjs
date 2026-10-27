const {copyFileSync,mkdirSync}=require('node:fs');
const {resolve}=require('node:path');
copyFileSync(resolve(__dirname,'../src/services/pdf-renderer.worker.mjs'),resolve(__dirname,'../dist/services/pdf-renderer.worker.mjs'));

mkdirSync(resolve(__dirname,'../dist/assets'),{recursive:true});
copyFileSync(resolve(__dirname,'../assets/logo.png'),resolve(__dirname,'../dist/assets/logo.png'));
