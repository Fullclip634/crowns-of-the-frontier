// Camera QR scanning for nearby pairing. Uses the native BarcodeDetector when
// it supports QR codes and otherwise loads the bundled jsQR decoder on demand,
// so scanning keeps working offline in every browser with camera access.
export function cameraAvailable(){return !!globalThis.navigator?.mediaDevices?.getUserMedia&&globalThis.isSecureContext!==false;}

export async function startQrScanner(video,onResult){
  if(!cameraAvailable())throw new Error('The camera is not available here. Use the paste box instead.');
  let stream;
  try{stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}});}
  catch(error){throw new Error(error?.name==='NotAllowedError'?'Camera access was blocked. Allow the camera for this game, or use the paste box instead.':'The camera could not start. Use the paste box instead.');}
  let stopped=false,timer=0,detector=null,decode=null;
  const stop=()=>{if(stopped)return;stopped=true;clearTimeout(timer);for(const track of stream.getTracks())track.stop();video.srcObject=null;};
  try{
    video.setAttribute('playsinline','');video.muted=true;video.srcObject=stream;await video.play();
    if(typeof BarcodeDetector==='function'){try{if((await BarcodeDetector.getSupportedFormats()).includes('qr_code'))detector=new BarcodeDetector({formats:['qr_code']});}catch{}}
    if(!detector){const module=await import('jsqr');decode=typeof module.default==='function'?module.default:module.default?.default||module;}
  }catch(error){stop();throw new Error('The camera could not start. Use the paste box instead.');}
  const canvas=document.createElement('canvas'),context=canvas.getContext('2d',{willReadFrequently:true});
  const scan=async()=>{
    if(stopped)return;
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
