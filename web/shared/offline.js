// Offline curtain for the operator pages (control panel, deck editor).
//
// The pages talk to the local app over a WebSocket. When the app is closed
// the socket drops and nothing on the page can work any more: every click
// would post into the void. So the page says so, in one line, over the whole
// surface, instead of letting the operator edit a panel that is not
// connected to anything. Each page's reconnect loop clears the curtain the
// moment the app is back, so the operator relaunches the exe and carries on
// with the same tab.
//
// An update restart is the one planned outage: the app closes and reopens on
// its own within seconds, so that case waits with a softer line and only
// falls through to the hard error if the app has not come back in time.

export const OFFLINE_MESSAGE = 'OFFLINE: RESTART THE APP TO CONTINUE USAGE';
const OFFLINE_HINT = 'The connection to the app was lost. Start Sideways Studio again; this page reconnects on its own.';
const RESTART_MESSAGE = 'Restarting for the update…';
const RESTART_HINT = 'The app closes and reopens on its own. This page reconnects when it is back.';
const RESTART_GRACE_MS = 30_000;

let curtain = null;
let mode = 'online';   // online | restarting | error
let graceTimer = null;
let baseTitle = null;

function build() {
  const el = document.createElement('div');
  el.className = 'offline-curtain hidden';
  el.setAttribute('role', 'alert');
  el.innerHTML = `
    <div class="offline-box">
      <p class="offline-kicker">Sideways Studio</p>
      <h2 class="offline-headline"></h2>
      <p class="offline-hint"></p>
    </div>`;
  document.body.append(el);
  return el;
}

function show(headline, hint, isError) {
  curtain ??= build();
  curtain.querySelector('.offline-headline').textContent = headline;
  curtain.querySelector('.offline-hint').textContent = hint;
  curtain.classList.toggle('error', isError);
  curtain.classList.remove('hidden');
  // The tab strip tells the story too, for an operator on another tab.
  baseTitle ??= document.title;
  document.title = `OFFLINE: ${baseTitle}`;
}

// setOffline(true) raises the error; setOffline(true, { restarting: true })
// raises the softer restart line first. Repeated calls while disconnected
// (one per reconnect attempt) are no-ops, so the restart grace period is not
// reset by the very loop that is waiting on it.
export function setOffline(offline, { restarting = false } = {}) {
  if (!offline) {
    clearTimeout(graceTimer);
    graceTimer = null;
    mode = 'online';
    if (curtain) curtain.classList.add('hidden');
    if (baseTitle !== null) { document.title = baseTitle; baseTitle = null; }
    return;
  }
  if (mode !== 'online') return;
  if (restarting) {
    mode = 'restarting';
    show(RESTART_MESSAGE, RESTART_HINT, false);
    graceTimer = setTimeout(() => {
      mode = 'error';
      show(OFFLINE_MESSAGE, OFFLINE_HINT, true);
    }, RESTART_GRACE_MS);
    return;
  }
  mode = 'error';
  show(OFFLINE_MESSAGE, OFFLINE_HINT, true);
}
