export function originAllowed(origin,host,allowed=[]){
  if(!origin)return true;try{const url=new URL(origin);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)return false;return url.host===host||allowed.includes(url.origin);}catch{return false;}
}
