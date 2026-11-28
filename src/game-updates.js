export async function currentGameUpdate(buildId,fetcher=fetch){
  try{
    const response=await fetcher('/version.json',{cache:'no-store'});if(!response.ok)return null;
    const data=await response.json();return typeof data.buildId==='string'&&/^\d{10,20}$/.test(data.buildId)&&data.buildId!==buildId?data:null;
  }catch{return null;}
}

export function installGameUpdates({buildId,canRefresh,beforeRefresh}){
  let latest=null,busy=false,refreshing=false;
  const notice=document.createElement('aside');notice.id='game-update';notice.className='game-update hidden';notice.setAttribute('role','status');
  notice.innerHTML='<div><strong>A game update is ready</strong><span>You can finish your match before refreshing.</span></div><button class="secondary">Save and refresh</button>';
  document.body.append(notice);const button=notice.querySelector('button'),hint=notice.querySelector('span');
  const check=async()=>{
    if(busy||navigator.onLine===false)return;busy=true;
    try{latest=await currentGameUpdate(buildId)||latest;if(latest){notice.classList.remove('hidden');button.disabled=refreshing||!canRefresh();button.textContent=canRefresh()?'Save and refresh':'Leave the room to update';}}finally{busy=false;}
  };
  button.onclick=async()=>{
    if(refreshing||!latest||!canRefresh())return;
    refreshing=true;
    button.disabled=true;
    hint.textContent='Saving your match before refreshing.';
    try{
      if(await beforeRefresh()===false){hint.textContent='Your match could not be saved. Finish it before refreshing.';return;}
      if(!canRefresh()){hint.textContent='Leave the room to update.';return;}
      const url=new URL(location.href);url.searchParams.set('build',latest.buildId);location.assign(url);
    }finally{
      refreshing=false;
      button.disabled=!canRefresh();
    }
  };
  if(!document.hidden)check();const timer=setInterval(()=>{if(!document.hidden)check();},30000);return {check,dispose(){clearInterval(timer);notice.remove();}};
}
