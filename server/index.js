import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createGameServer} from './http-app.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const {server,rooms,readiness}=createGameServer({root});
if(!readiness.ready)throw new Error(`Game package is not ready (${readiness.failures.join(', ')}). Run npm run build before starting the server.`);
const port=Number(process.env.PORT)||4173;server.listen(port,'0.0.0.0',()=>console.log(`Crowns of the Frontier · http://localhost:${port} · Wi-Fi multiplayer enabled · build ${readiness.release.buildId} · commit ${readiness.release.commit||'local'}`));
function shutdown(){rooms.close();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),1000).unref();}process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
