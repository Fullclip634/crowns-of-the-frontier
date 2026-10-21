import {MeshStandardMaterial,PMREMGenerator} from 'three';

// Installed only after the optional renderer has initialized successfully.
// The production WebGL path does not load the node renderer or change materials.
let runtime=null;
export const nodeRuntime=()=>runtime;
export function installNodeRuntime(value){runtime=value;}
export const standardMaterial=parameters=>runtime?new runtime.MeshStandardNodeMaterial(parameters):new MeshStandardMaterial(parameters);
export const environmentGenerator=renderer=>new (runtime?.PMREMGenerator||PMREMGenerator)(renderer);
