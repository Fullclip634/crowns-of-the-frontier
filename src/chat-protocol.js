export const CHAT_LENGTH=240;
export const CHAT_HISTORY=100;
export const CHAT_BURST=5;
export const CHAT_WINDOW=10000;

export function cleanChatText(value){
  if(typeof value!=='string')return '';
  return value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/gu,' ').trim();
}
