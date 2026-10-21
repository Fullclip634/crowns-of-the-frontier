// Bound queued frames on WebGPU so input and quality changes can catch up with
// a busy GPU. Simulation and browser animation frames continue independently.
export function canSubmitFrame(view){
  const queue=view.renderer?.backend?.device?.queue;
  if(!view.renderer?.backend?.isWebGPUBackend||!queue?.onSubmittedWorkDone)return true;
  const state=view.renderFlight??={pending:0,submitted:0,skipped:0,failed:0};
  if(state.pending<2)return true;
  state.skipped++;return false;
}

export function submittedFrame(view){
  const queue=view.renderer?.backend?.device?.queue;
  if(!view.renderer?.backend?.isWebGPUBackend||!queue?.onSubmittedWorkDone)return;
  const state=view.renderFlight??={pending:0,submitted:0,skipped:0,failed:0};
  state.pending++;state.submitted++;
  let completion;try{completion=queue.onSubmittedWorkDone();}catch{state.pending--;state.failed++;return;}
  Promise.resolve(completion).then(()=>{state.pending--;},()=>{state.pending--;state.failed++;});
}
