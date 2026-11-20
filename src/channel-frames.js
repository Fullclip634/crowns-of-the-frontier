// Message framing for WebRTC data channels.
//
// Browsers only guarantee interoperable data-channel messages of roughly 64 KiB
// and full battle snapshots can be much larger, so long JSON payloads are split
// into ordered chunks and reassembled on the other side. Every frame starts
// with a single tag character: `F` carries a complete message, `C` carries one
// chunk as `C<id>:<index>:<count>:<payload>`.
export const FRAME_CHUNK=16000;

export function frameMessage(text,nextId){
  if(text.length<=FRAME_CHUNK)return ['F'+text];
  const id=nextId(),count=Math.ceil(text.length/FRAME_CHUNK),frames=[];
  for(let index=0;index<count;index++)frames.push(`C${id}:${index}:${count}:`+text.slice(index*FRAME_CHUNK,(index+1)*FRAME_CHUNK));
  return frames;
}

// Reassembles frames from one peer. `limit` caps the decoded message length so
// a misbehaving peer cannot make the receiver buffer unbounded data.
export class FrameReader {
  constructor(limit=16_000_000){this.limit=limit;this.partial=new Map();}
  read(frame){
    if(typeof frame!=='string'||!frame.length)return null;
    const tag=frame[0];
    if(tag==='F')return frame.length-1<=this.limit?frame.slice(1):null;
    if(tag!=='C')return null;
    const header=/^C(\d{1,9}):(\d{1,6}):(\d{1,6}):/.exec(frame);if(!header)return null;
    const id=header[1],index=Number(header[2]),count=Number(header[3]);
    if(count<2||index>=count||count*FRAME_CHUNK>this.limit+FRAME_CHUNK)return null;
    let entry=this.partial.get(id);
    if(!entry){
      // Ordered channels deliver chunks in sequence; a fresh id must start at 0.
      if(index!==0)return null;
      if(this.partial.size>=4)this.partial.delete(this.partial.keys().next().value);
      entry={count,parts:[]};this.partial.set(id,entry);
    }
    if(entry.count!==count||index!==entry.parts.length){this.partial.delete(id);return null;}
    entry.parts.push(frame.slice(header[0].length));
    if(entry.parts.length<count)return null;
    this.partial.delete(id);
    const text=entry.parts.join('');
    return text.length<=this.limit?text:null;
  }
}
