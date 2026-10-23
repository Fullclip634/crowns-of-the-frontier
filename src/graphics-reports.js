const storageKey='crowns-graphics-report';
const limitNames=['maxTextureDimension2D','maxBufferSize','maxStorageBuffersPerShaderStage','maxSampledTexturesPerShaderStage','maxBindGroups'];
const text=(value,max=120)=>typeof value==='string'?value.replace(/\b(?:https?|wss?):\/\/[^\s<>"']+/gi,url=>{try{return new URL(url).origin+'/…';}catch{return '[address]';}}).replace(/\b(?:gh[pousr]_[A-Za-z0-9]{15,}|Bearer\s+[A-Za-z0-9._~+/-]+)/gi,'[redacted]').replace(/\b(token|api[_-]?key|password|authorization)\s*[:=]\s*["']?[^\s"'<>;,]+/gi,'$1=[redacted]').slice(0,max):'';
const number=value=>Number.isFinite(value)&&value>=0?value:null;

// Keep only support-relevant fields. Do not retain renderer objects, events,
// match state, room identifiers, page addresses or arbitrary stored properties.
function normalize(report){
  return {version:1,capturedAt:text(report.capturedAt,40),buildId:text(report.buildId,80),phase:text(report.phase,32),requested:text(report.requested,20),active:text(report.active,20),quality:text(report.quality,16),browser:text(report.browser,320),secure:report.secure===true,
    viewport:{width:number(report.viewport?.width),height:number(report.viewport?.height),pixelRatio:number(report.viewport?.pixelRatio)},
    gpu:{compatibilityMode:typeof report.gpu?.compatibilityMode==='boolean'?report.gpu.compatibilityMode:null,limits:Object.fromEntries(limitNames.map(name=>[name,number(report.gpu?.limits?.[name])]))},
    failure:report.failure?{type:text(report.failure.type,80),message:text(report.failure.message,1600)}:null};
}

export function graphicsReport({buildId,phase,requested,active,quality,browser,secure,viewport,renderer,failure}){
  const type=failure?.type||failure?.name||(failure?.deviceLost?'DeviceLost':failure?.backendError?'BackendError':'GraphicsError');
  return normalize({capturedAt:new Date().toISOString(),buildId,phase,requested,active,quality,browser,secure,viewport,gpu:{compatibilityMode:renderer?.backend?.compatibilityMode,limits:renderer?.backend?.device?.limits},failure:failure?{type,message:failure.message}:null});
}

export function rememberGraphicsFailure(storage,report){
  const safe=normalize(report);if(!safe.failure)return null;
  try{storage?.setItem(storageKey,JSON.stringify(safe));}catch{}
  return safe;
}

export function readGraphicsFailure(storage){
  try{const raw=storage?.getItem(storageKey);if(!raw||raw.length>12000)return null;const report=JSON.parse(raw);return report?.version===1&&report.failure&&typeof report.failure.message==='string'?normalize(report):null;}catch{return null;}
}

const escape=value=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function graphicsSupportMarkup({current,lastFailure}){
  const report=JSON.stringify({current:normalize(current),lastFailure:lastFailure?normalize(lastFailure):null},null,2);
  return `<details class="graphics-support"><summary>Graphics help</summary><p class="settings-note">If you need help with graphics, copy this report to include with your message. Nothing is sent automatically.</p><button class="secondary full" data-action="copy-graphics-report">Copy report</button><p id="graphics-report-status" class="settings-note" role="status" aria-live="polite"></p><details class="graphics-report-details"><summary>View technical details</summary><label class="field-label" for="graphics-report">GRAPHICS REPORT</label><textarea id="graphics-report" readonly spellcheck="false">${escape(report)}</textarea></details></details>`;
}

export async function copyGraphicsReport(root,clipboard){
  const field=root.querySelector('#graphics-report'),status=root.querySelector('#graphics-report-status');if(!field)return false;
  try{if(!clipboard?.writeText)throw Error('Clipboard unavailable');await clipboard.writeText(field.value);if(status)status.textContent='Report copied. You can paste it into your bug report.';return true;}
  catch{const details=field.closest?.('.graphics-report-details');if(details)details.open=true;field.focus();field.select();field.setSelectionRange(0,field.value.length);if(status)status.textContent='Select and copy the report in technical details. Your browser did not allow automatic copying.';return false;}
}
