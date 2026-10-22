import {graphicsNeedsReload} from './graphics-failure.js';

export function graphicsFailureMessage(quality){
  const name={low:'Performance',medium:'Balanced',high:'High'}[quality]||'the previous quality';
  return `Graphics could not change. Restored ${name}. Try again when you are ready.`;
}

export function graphicsRecoveryMarkup({playing,network,saved,deviceLost=false,backendError=false}){
  const reload=graphicsNeedsReload({deviceLost,backendError});
  const description=deviceLost?(network?'The graphics device disconnected. Reload and use Play with friends to rejoin your session promptly.':'The graphics device disconnected. Reload with compatible graphics to restore the battlefield.'):backendError?(network?'Graphics could not render this battlefield. Reload with compatible graphics, then use Play with friends to rejoin your session promptly.':playing?'Graphics could not render this battlefield. Save and reload with compatible graphics to restore your kingdom.':'Graphics could not render the battlefield. Reload with compatible graphics to open the game.'):(network?'Your multiplayer session remains on the server. Try again, or reload and use Play with friends to rejoin your previous session promptly.':playing?'Your match is still in memory. Try restoring the battlefield, or save it before reloading.':'Try restoring the battlefield, or reload the game.');
  const note=network?'Multiplayer sessions reconnect through your room; a partial room view is never saved as a local game.':saved?'Your current kingdom has also been saved on this device.':playing?reload?'Keep this page open until your kingdom can be saved.':'Keep this page open until graphics recover or your kingdom can be saved.':'Your graphics settings are preserved.';
  return `<div class="eyebrow">BATTLEFIELD RECOVERY</div><h2>Restore the battlefield.</h2><p class="modal-intro">${description}</p><div class="pause-actions">${reload?'':'<button class="primary full" data-action="retry-battlefield">Try graphics again</button>'}<button class="${reload?'primary':'secondary'} full" data-action="reload-battlefield">${network?'Reload and rejoin':playing?'Save and reload':'Reload game'}</button></div><p id="graphics-recovery-note" class="settings-note" role="status">${note}</p>`;
}
