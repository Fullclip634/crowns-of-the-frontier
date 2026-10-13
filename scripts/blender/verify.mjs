import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const project = fileURLToPath(new URL('../../', import.meta.url));
const toolsDir = path.join(project, '.tools');
const qaDir = path.join(toolsDir, 'blender-qa');
await mkdir(qaDir, { recursive: true });
const env = {
  ...process.env,
  UV_CACHE_DIR: path.join(toolsDir, 'uv-cache'),
  UV_PYTHON_INSTALL_DIR: path.join(toolsDir, 'python'),
  UV_PYTHON_PREFERENCE: 'only-managed',
  UV_SYSTEM_CERTS: 'true',
  PYTHONIOENCODING: 'utf-8',
  PYTHONUTF8: '1',
  BLENDERMCP_ADDONS_DIR: path.join(toolsDir, 'blender-profile', 'scripts', 'addons'),
  BLENDER_HOST: '127.0.0.1',
  BLENDER_PORT: '9876',
  BLENDER_MCP_SAFE_MODE: '1',
};
const launcher = path.join(process.env.USERPROFILE, '.local', 'bin', 'uvx.exe');
const child = spawn(launcher, ['--python', '3.11', 'mcp-for-blender==2.1.9'], {
  cwd: project, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
});
let nextId = 1;
let buffer = '';
let stderr = '';
const pending = new Map();
child.stderr.setEncoding('utf8');
child.stderr.on('data', (chunk) => { stderr += chunk; });
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  buffer += chunk;
  let lineEnd;
  while ((lineEnd = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, lineEnd).trim();
    buffer = buffer.slice(lineEnd + 1);
    if (!line) continue;
    let message;
    try { message = JSON.parse(line); } catch { continue; }
    const request = pending.get(message.id);
    if (!request) continue;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  }
});
const rejectPending = (error) => {
  for (const request of pending.values()) {
    clearTimeout(request.timer);
    request.reject(error);
  }
  pending.clear();
};
child.on('error', rejectPending);
child.on('exit', (code) => rejectPending(new Error(`MCP process exited (${code}).`)));
child.stdin.on('error', rejectPending);
function request(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out: ${method}`));
    }, 90_000);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}
function textOf(result) {
  const text = (result.content ?? []).filter((item) => item.type === 'text')
    .map((item) => item.text).join('\n');
  if (result.isError) throw new Error(text);
  return text;
}

try {
  const initialized = await request('initialize', {
    protocolVersion: '2024-11-05', capabilities: {},
    clientInfo: { name: 'crowns-blender-verification', version: '1.0.0' },
  });
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  const toolList = await request('tools/list');
  const sceneTool = toolList.tools.find((tool) => tool.name === 'get_scene_info');
  const codeTool = toolList.tools.find((tool) => tool.name === 'execute_blender_code');
  if (!sceneTool || !codeTool) throw new Error('Expected Blender tools are missing.');
  console.log(JSON.stringify({ server: initialized.serverInfo, tools: toolList.tools.length }));
  const scene = textOf(await request('tools/call', { name: sceneTool.name, arguments: {} }));
  console.log(JSON.stringify({ scene }));

  const scriptIndex=process.argv.indexOf('--script');
  if(scriptIndex>=0){
    if(!process.argv[scriptIndex+1])throw new Error('A Blender script path is required.');
    const scriptPath=path.resolve(project,process.argv[scriptIndex+1]);
    const code=`__file__ = ${JSON.stringify(scriptPath.replaceAll('\\','/'))}\n${await readFile(scriptPath,'utf8')}`;
    const result=textOf(await request('tools/call',{name:codeTool.name,arguments:{code}}));
    console.log(JSON.stringify({scriptResult:result}));
  }

  if (process.argv.includes('--export')) {
    const source = await readFile(path.join(project, 'scripts', 'blender', 'verify-model.py'), 'utf8');
    const code = `output_dir = ${JSON.stringify(qaDir.replaceAll('\\', '/'))}\n${source}`;
    const result = textOf(await request('tools/call', {
      name: codeTool.name, arguments: { code },
    }));
    console.log(JSON.stringify({ exportResult: result }));
    const glbPath = path.join(qaDir, 'connector-check.glb');
    const bytes = await readFile(glbPath);
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const loaded = await new GLTFLoader().parseAsync(arrayBuffer, '');
    let meshes = 0;
    let triangles = 0;
    loaded.scene.traverse((object) => {
      if (!object.isMesh) return;
      meshes++;
      triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
    });
    if (!meshes || !loaded.animations.length) throw new Error('GLB geometry or animation is missing.');
    const report = {
      verified: true, server: initialized.serverInfo,
      glbBytes: bytes.length, meshes, triangles,
      animations: loaded.animations.map((clip) => ({ name: clip.name, duration: clip.duration })),
    };
    await writeFile(path.join(qaDir, 'verification.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report));
  }
} finally {
  rejectPending(new Error('Verification finished.'));
  child.stdin.end();
  child.kill();
  await writeFile(path.join(qaDir, 'mcp-stderr.log'), stderr);
}
