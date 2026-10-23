export function createVisibilityDelta(previousVisible,previousExplored,visible,explored,sequence){
  const length=visible.length;
  if(previousVisible.length!==length||previousExplored.length!==length||explored.length!==length)throw new RangeError('Visibility grids must have the same dimensions.');
  const visibleChanges=[],exploredChanges=[];
  for(let cell=0;cell<length;cell++){
    if(previousVisible[cell]!==visible[cell])visibleChanges.push(cell*2+visible[cell]);
    if(!previousExplored[cell]&&explored[cell])exploredChanges.push(cell);
  }
  return {sequence,visible:visibleChanges,explored:exploredChanges};
}

export function applyVisibilityDelta(visible,explored,delta){
  if(!(visible instanceof Uint8Array)||!(explored instanceof Uint8Array)||visible.length!==explored.length)throw new TypeError('Visibility grids must be matching byte arrays.');
  if(!Number.isSafeInteger(delta?.sequence)||delta.sequence<0||!Array.isArray(delta.visible)||!Array.isArray(delta.explored))throw new TypeError('Visibility update is invalid.');
  for(const change of delta.visible){
    if(!Number.isInteger(change)||change<0||change>=visible.length*2)throw new RangeError('Visible cell update is out of range.');
  }
  for(const cell of delta.explored){
    if(!Number.isInteger(cell)||cell<0||cell>=explored.length)throw new RangeError('Explored cell update is out of range.');
  }
  // Validate the entire packet before touching either live grid.
  for(const change of delta.visible)visible[Math.floor(change/2)]=change&1;
  for(const cell of delta.explored)explored[cell]=1;
  return {visible,explored,sequence:delta.sequence};
}

// The receiver owns the grids. Views may read them, but only ordered, validated
// snapshots can update them. A rejected packet must not partially update a match.
export class VisibilityReceiver {
  constructor(){this.visible=null;this.explored=null;this.sequence=null;}
  read(state){
    if(!state||typeof state!=='object')return null;
    if(state.visibilityDelta){
      const delta=state.visibilityDelta;
      if(this.sequence===null||delta.sequence!==this.sequence+1)return null;
      try{applyVisibilityDelta(this.visible,this.explored,delta);}catch{return null;}
      this.sequence=delta.sequence;
    }else{
      const {visible,explored,visibilitySequence}=state;
      if(!Array.isArray(visible)||!Array.isArray(explored)||!visible.length||visible.length!==explored.length||visible.some(value=>value!==0&&value!==1)||explored.some(value=>value!==0&&value!==1))return null;
      if(visibilitySequence!==undefined&&(!Number.isSafeInteger(visibilitySequence)||visibilitySequence<0))return null;
      this.visible=Uint8Array.from(visible);this.explored=Uint8Array.from(explored);this.sequence=visibilitySequence??null;
    }
    return {...state,visible:this.visible,explored:this.explored};
  }
}
