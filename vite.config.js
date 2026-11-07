import {defineConfig} from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import {Script} from 'node:vm';
import {writeReleaseManifest} from './server/release.js';
import {precacheFiles} from './scripts/offline-assets.js';
let outputDirectory='dist',projectRoot='';
const buildId=String(Date.now());
export default defineConfig({
  server:{watch:{ignored:['**/.tools/**','**/artifacts/**']}},
  optimizeDeps:{include:['three/addons/loaders/GLTFLoader.js','three/addons/loaders/KTX2Loader.js','three/addons/libs/meshopt_decoder.module.js']},
  // Hosted build agents may refuse a bulk rm of an existing output directory.
  // Emitting in place is deterministic: Vite rewrites index.html (including the
  // injected build id) and every hashed asset, and the release manifest below
  // lists only files emitted by *this* build, so stale files are never shipped.
  build:{emptyOutDir:false,rollupOptions:{output:{manualChunks:{three:['three']}}}},
  plugins:[{name:'offline-game',
    configResolved(config){projectRoot=config.root;outputDirectory=path.resolve(config.root,config.build.outDir);},
    transformIndexHtml(){return [{tag:'meta',attrs:{name:'frontier-build',content:buildId},injectTo:'head'}];},
    // writeBundle runs only after a successful emit. closeBundle is also
    // invoked from Rollup's finally on failure, where a release error would
    // mask the actual build failure.
    writeBundle(options,bundle){
      const emitted=Object.keys(bundle).filter(file=>file.startsWith('assets/')).map(file=>'/'+file);
      const assets=emitted.length?emitted:fs.readdirSync(path.join(outputDirectory,'assets')).map(f=>'/assets/'+f);
      const fonts=fs.existsSync(path.join(outputDirectory,'fonts'))?fs.readdirSync(path.join(outputDirectory,'fonts')).map(f=>'/fonts/'+f):[];
      // Emitting in place means an old sample pack can linger in dist. Publish
      // exactly the cues named by the authored manifest and prune the rest.
      const audio=[];{
        const manifestPath=path.join(projectRoot,'public','audio','manifest.json');
        if(fs.existsSync(manifestPath)){
          const cues=JSON.parse(fs.readFileSync(manifestPath,'utf8')).cues||{};
          const expected=new Set(['manifest.json',...Object.values(cues).map(cue=>cue.file)]);
          audio.push('/audio/manifest.json',...Object.values(cues).map(cue=>'/audio/'+cue.file));
          const directory=path.join(outputDirectory,'audio');
          if(fs.existsSync(directory))for(const file of fs.readdirSync(directory))if(!expected.has(file))fs.unlinkSync(path.join(directory,file));
        }
      }
      const version='frontier-'+assets.join('').split('').reduce((a,c)=>(a*31+c.charCodeAt(0))>>>0,0);
      const files=['/index.html','/manifest.webmanifest','/icon.svg','/icon-192.png','/icon-512.png','/apple-touch-icon.png','/ICON_LICENSES.txt','/AUDIO_LICENSES.txt','/sw.js','/version.json',...assets,...fonts,...audio];
      const source=fs.readFileSync('scripts/sw-template.js','utf8').replace('__CACHE__',JSON.stringify(version)).replace('__FILES__',JSON.stringify(precacheFiles(['/',...files])));
      new Script(source,{filename:'sw.js'});
      fs.writeFileSync(path.join(outputDirectory,'sw.js'),source);
      const packageVersion=JSON.parse(fs.readFileSync('package.json','utf8')).version;
      fs.writeFileSync(path.join(outputDirectory,'version.json'),JSON.stringify({buildId,version:packageVersion}));
      writeReleaseManifest(outputDirectory,{buildId,version:packageVersion,commit:process.env.RENDER_GIT_COMMIT||process.env.GITHUB_SHA,files});
    }}],
});
