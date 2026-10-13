import {defineConfig} from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import {Script} from 'node:vm';
let outputDirectory='dist';
const buildId=String(Date.now());
export default defineConfig({
  server:{watch:{ignored:['**/.tools/**','**/artifacts/**']}},
  optimizeDeps:{include:['three/addons/loaders/GLTFLoader.js','three/addons/libs/meshopt_decoder.module.js']},
  build:{rollupOptions:{output:{manualChunks:{three:['three']}}}},
  plugins:[{name:'offline-game',configResolved(config){outputDirectory=path.resolve(config.root,config.build.outDir);},transformIndexHtml(){return [{tag:'meta',attrs:{name:'frontier-build',content:buildId},injectTo:'head'}];},closeBundle(){
    const assets=fs.readdirSync(path.join(outputDirectory,'assets')).map(f=>'/assets/'+f);
    const fonts=fs.existsSync(path.join(outputDirectory,'fonts'))?fs.readdirSync(path.join(outputDirectory,'fonts')).map(f=>'/fonts/'+f):[];
    const version='frontier-'+assets.join('').split('').reduce((a,c)=>(a*31+c.charCodeAt(0))>>>0,0);
    const source=fs.readFileSync('scripts/sw-template.js','utf8').replace('__CACHE__',JSON.stringify(version)).replace('__FILES__',JSON.stringify(['/', '/index.html','/manifest.webmanifest','/icon.svg',...assets,...fonts]));
    new Script(source,{filename:'sw.js'});
    fs.writeFileSync(path.join(outputDirectory,'sw.js'),source);
    fs.writeFileSync(path.join(outputDirectory,'version.json'),JSON.stringify({buildId,version:JSON.parse(fs.readFileSync('package.json','utf8')).version}));
  }}],
});
