// Camera QR scanning for nearby pairing. Uses the native BarcodeDetector when
// it supports QR codes and otherwise loads the bundled jsQR decoder on demand,
// so scanning keeps working offline in every browser with camera access.
export function cameraAvailable(){return !!globalThis.navigator?.mediaDevices?.getUserMedia&&globalThis.isSecureContext!==false;}

const CAMERA_ATTEMPTS=[
  {audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}},
  {audio:false,video:{facingMode:'environment'}},
  {audio:false,video:true},
];

function stopTracks(stream){
  if(!stream)return;
  for(const track of stream.getTracks()){try{track.stop();}catch{}}
}

function waitForLiveFrame(video,timeoutMs=2800){
  if(video.readyState>=2&&video.videoWidth>0&&video.videoHeight>0)return Promise.resolve(true);
  return new Promise(resolve=>{
    let done=false;
    const finish=ok=>{
      if(done)return;done=true;
      clearTimeout(timer);
      video.removeEventListener('loadeddata',check);
      video.removeEventListener('playing',check);
      video.removeEventListener('resize',check);
      resolve(ok);
    };
    const check=()=>{if(video.readyState>=2&&video.videoWidth>0&&video.videoHeight>0)finish(true);};
    const timer=setTimeout(()=>finish(video.readyState>=2&&video.videoWidth>0&&video.videoHeight>0),timeoutMs);
    video.addEventListener('loadeddata',check);
    video.addEventListener('playing',check);
    video.addEventListener('resize',check);
    check();
  });
}

async function openLiveStream(video){
  let lastError=null;
  for(const constraints of CAMERA_ATTEMPTS){
    let stream=null;
    try{
      stream=await navigator.mediaDevices.getUserMedia(constraints);
    }catch(error){
      lastError=error;
      if(error?.name==='NotAllowedError'||error?.name==='PermissionDeniedError')throw error;
      continue;
    }
    try{
      video.autoplay=true;
      video.muted=true;
      video.playsInline=true;
      video.setAttribute('autoplay','');
      video.setAttribute('muted','');
      video.setAttribute('playsinline','');
      video.setAttribute('webkit-playsinline','');
      video.srcObject=stream;
      await video.play().catch(()=>{});
      const live=await waitForLiveFrame(video,2600);
      if(live)return stream;
      // Some Android Camera2 sensors open a black 0x0 auxiliary track for 1280x720; release and retry simpler constraints.
      stopTracks(stream);
      video.srcObject=null;
      lastError=new Error('NO_FRAMES');
    }catch(error){
      stopTracks(stream);
      video.srcObject=null;
      lastError=error;
    }
  }
  throw lastError||new Error('NO_FRAMES');
}

export async function startQrScanner(video,onResult,{onReady}={}){
  if(!cameraAvailable())throw new Error('The camera is not available here. Use the paste box instead.');
  let stream;
  try{
    stream=await openLiveStream(video);
  }catch(error){
    if(error?.name==='NotAllowedError'||error?.name==='PermissionDeniedError'){
      throw new Error('Camera access was blocked. Allow camera permission for this game, or use the paste box below.');
    }
    if(error?.message==='NO_FRAMES'){
      throw new Error('Camera opened without a video picture. Close other camera apps or check camera permissions, or use the paste box below.');
    }
    throw new Error('The camera could not start. Use the paste box below instead.');
  }
  let stopped=false,timer=0,detector=null,decode=null;
  const stop=()=>{if(stopped)return;stopped=true;clearTimeout(timer);stopTracks(stream);video.srcObject=null;};
  try{
    if(typeof BarcodeDetector==='function'){try{if((await BarcodeDetector.getSupportedFormats()).includes('qr_code'))detector=new BarcodeDetector({formats:['qr_code']});}catch{}}
    if(!detector){const module=await import('jsqr');decode=typeof module.default==='function'?module.default:module.default?.default||module;}
  }catch{stop();throw new Error('The camera scanner could not initialize. Use the paste box below instead.');}
  try{onReady?.();}catch{}
  const canvas=document.createElement('canvas'),context=canvas.getContext('2d',{willReadFrequently:true});
  const scan=async()=>{
    if(stopped)return;
    if(!video.isConnected){stop();return;}
    try{
      if(video.readyState>=2&&video.videoWidth){
        let text=null;
        if(detector){const codes=await detector.detect(video);text=codes.find(code=>code.rawValue)?.rawValue||null;}
        else{
          const scale=Math.min(1,960/Math.max(video.videoWidth,video.videoHeight));
          canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);
          context.drawImage(video,0,0,canvas.width,canvas.height);
          const image=context.getImageData(0,0,canvas.width,canvas.height);
          text=decode(image.data,image.width,image.height,{inversionAttempts:'attemptBoth'})?.data||null;
        }
        if(text&&!stopped){stop();onResult(text);return;}
      }
    }catch{}
    if(!stopped)timer=setTimeout(scan,140);
  };
  scan();
  return stop;
}
