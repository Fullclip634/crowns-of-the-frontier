const clamp=value=>Math.max(0,Math.min(1,value)),smooth=value=>{const t=clamp(value);return t*t*(3-2*t);};
// Slow preparation, a brief contact and a controlled return. Unlike a sine
// wave, the tool spends a distinct part of the cycle striking the surface.
const strokes={
  wood:[[0,-1.35,-.55,1.05,.07],[.40,-1.70,-.75,1.10,.03],[.55,-.82,-.22,2.45,.22],[.69,-.55,-.12,2.20,.24],[1,-1.35,-.55,1.05,.07]],
  mine:[[0,-1.30,-.55,1.18,.16],[.44,-1.75,-.85,1.35,.08],[.59,-.55,-.15,2.75,.38],[.72,-.38,-.10,2.50,.40],[1,-1.30,-.55,1.18,.16]],
  build:[[0,-.88,-.45,1.30,.08],[.40,-1.12,-.65,1.30,.05],[.58,-.68,-.12,2.20,.16],[.70,-.58,-.08,2.05,.17],[1,-.88,-.45,1.30,.08]],
  food:[[0,-.60,-.35,1.15,.34],[.38,-.83,-.48,1.35,.45],[.65,-.55,-.24,1.85,.46],[.82,-.38,-.35,1.30,.28],[1,-.60,-.35,1.15,.34]]
};

// Food work keeps the existing body and sickle meshes. Foraging uses the free
// hand while the sickle rests down; harvesting bends to the crop and sweeps.
// phase, torso X/Y, right upper X/Y, right lower X, left upper X/Y,
// left lower X, wrist X/Y.
const foodStrokes={
  forage:[[0,.50,0,-.10,0,-.10,-.90,0,-1.00,2.80,0],[.35,1.20,-.035,-.10,0,-.10,-1.50,-.10,-.05,2.80,0],[.55,1.20,.025,-.10,0,-.10,-1.50,.08,-.25,2.80,0],[.80,.55,0,-.10,0,-.10,-.70,0,-1.45,2.80,0],[1,.50,0,-.10,0,-.10,-.90,0,-1.00,2.80,0]],
  harvest:[[0,.55,-.05,-.85,.10,-.55,-.65,-.05,-.55,1.15,-.10],[.35,.95,-.08,-1.05,.20,-.15,-1.30,-.08,-.10,1.75,-.20],[.62,1.05,.08,-1.10,-.15,-.20,-1.30,.08,-.10,1.82,.25],[.80,.80,.02,-.75,-.10,-.55,-.80,0,-.80,1.35,.10],[1,.55,-.05,-.85,.10,-.55,-.65,-.05,-.55,1.15,-.10]]
};


export function baseActionJointRotation(state,joint,output){
  if(!state?.task||state.blend<=0)return false;
  output.x=output.y=output.z=0;const weight=state.blend,side=joint.side??1;
  if(state.task==='carry'){
    if(joint.type==='arm')output.x=side>0?-.45:-.75;
    else if(joint.type==='forearm')output.x=-.60;
    else if(joint.type==='workerTool')output.x=.20;
    else if(joint.type==='torso')output.x=.045;
    else return false;
  }else if(state.task==='heal'){
    const pulse=Math.sin(state.phase*Math.PI*2);
    if(joint.type==='arm')output.x=-.85+pulse*.08;
    else if(joint.type==='forearm')output.x=-.40+pulse*.10;
    else if(joint.type==='head')output.x=.06;
    else return false;
  }else if(state.task==='food'&&foodStrokes[state.style]){
    const keys=foodStrokes[state.style];let a=keys[0],b=keys.at(-1);for(let i=1;i<keys.length;i++)if(state.phase<=keys[i][0]){a=keys[i-1];b=keys[i];break;}
    const t=smooth((state.phase-a[0])/(b[0]-a[0])),at=index=>a[index]+(b[index]-a[index])*t;
    if(joint.type==='arm'){output.x=at(side>0?3:6);output.y=at(side>0?4:7);output.z=side>0?-.045:.045;}
    else if(joint.type==='forearm')output.x=at(side>0?5:8);
    else if(joint.type==='workerTool'){output.x=at(9);output.y=at(10);}
    else if(joint.type==='torso'){output.x=at(1);output.y=at(2);}
    else if(joint.type==='head')output.x=-.15;
    else if(joint.type==='knee')output.x=.18;
    else return false;
  }else{
    const keys=strokes[state.task];if(!keys)return false;let a=keys[0],b=keys.at(-1);
    for(let i=1;i<keys.length;i++)if(state.phase<=keys[i][0]){a=keys[i-1];b=keys[i];break;}
    const t=smooth((state.phase-a[0])/(b[0]-a[0])),at=index=>a[index]+(b[index]-a[index])*t;
    if(joint.type==='arm'){output.x=side>0?at(1):state.task==='food'?-.65:-.30;output.z=side>0?-.045:.045;}
    else if(joint.type==='forearm')output.x=side>0?at(2):state.task==='food'?-.42:-.30;
    else if(joint.type==='workerTool')output.x=at(3);
    else if(joint.type==='torso'){output.x=at(4);output.y=Math.sin(state.phase*Math.PI*2)*.035;}
    else if(joint.type==='head')output.x=.07+at(4)*.15;
    else if(joint.type==='knee')output.x=(state.task==='food'?.18:state.task==='mine'?.10:.03);
    else return false;
  }
  output.x*=weight;output.y*=weight;output.z*=weight;return true;
}
