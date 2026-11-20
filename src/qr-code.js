import qrcode from 'qrcode-generator';

// Crisp, scanner-friendly QR markup. Dark modules on a white field with a
// four-module quiet zone scan reliably from another phone's camera.
export function qrSvg(text,label='QR code'){
  const qr=qrcode(0,text.length>900?'L':'M');qr.addData(text,'Byte');qr.make();
  const size=qr.getModuleCount(),quiet=4,total=size+quiet*2;let path='';
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(qr.isDark(y,x))path+=`M${x+quiet} ${y+quiet}h1v1h-1z`;
  const safe=String(label).replace(/[&<>"]/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[character]));
  return `<svg class="qr-svg" viewBox="0 0 ${total} ${total}" role="img" aria-label="${safe}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"><rect width="${total}" height="${total}" fill="#fff"/><path d="${path}" fill="#111"/></svg>`;
}
