const compactAmount=new Intl.NumberFormat('en',{notation:'compact',maximumSignificantDigits:3});

// Keep large late-game balances readable in the fixed resource bar. The UI
// retains the exact balance in its accessible name and tooltip.
export function resourceAmount(value){
  const amount=Math.floor(value);
  if(!Number.isFinite(amount))return '—';
  return Math.abs(amount)>=10000?compactAmount.format(amount):String(amount);
}
