import {WebGLRenderer} from 'three';

// Probe texture support on the actual game context without allocating the
// full-size backbuffer until its artwork has finished preparing.
export function createWorldRenderer(){return new WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});}
