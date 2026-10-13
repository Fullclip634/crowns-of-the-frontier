export function multiplayerEndpoint(page,configured='',staticHost=false){
  if(!configured){if(staticHost)return null;return `${page.protocol==='https:'?'wss:':'ws:'}//${page.host}/socket`;}
  const url=new URL(configured);if(url.username||url.password||url.hash||url.search)throw new Error('Use a multiplayer server URL without credentials or query parameters.');
  if(url.protocol==='https:')url.protocol='wss:';else if(url.protocol==='http:')url.protocol='ws:';
  if(!['ws:','wss:'].includes(url.protocol)||page.protocol==='https:'&&url.protocol!=='wss:')throw new Error('This site requires a secure multiplayer server URL (wss://).');
  if(url.pathname==='/')url.pathname='/socket';return url.href;
}
