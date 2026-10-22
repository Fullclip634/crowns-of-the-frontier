import {MeshStandardMaterial,PMREMGenerator} from 'three';

// Installed only after native WebGPU has initialized successfully.
// Compatibility graphics keep their GLSL materials after a failed native startup.
let runtime=null;
export const nodeRuntime=()=>runtime;
export function installNodeRuntime(value){runtime=value;}
export const standardMaterial=parameters=>runtime?new runtime.MeshStandardNodeMaterial(parameters):new MeshStandardMaterial(parameters);
export const environmentGenerator=renderer=>new (runtime?.PMREMGenerator||PMREMGenerator)(renderer);
