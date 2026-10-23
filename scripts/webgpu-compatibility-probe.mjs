// QA only: create a real device with Compatibility Mode validation and no
// optional features. The host may still use a desktop GPU/driver underneath.
export async function restrictWebGPUFeatures(context){
  await context.addInitScript(()=>{
    const gpu=navigator.gpu;if(!gpu)return;
    const request=gpu.requestAdapter.bind(gpu);
    gpu.requestAdapter=async options=>{
      const adapter=await request({...options,featureLevel:'compatibility'});if(!adapter)return adapter;
      const device=adapter.requestDevice.bind(adapter);
      adapter.requestDevice=descriptor=>device({...descriptor,requiredFeatures:[]});
      return adapter;
    };
  });
}
