// Optional browser installation for the online-only multiplayer client.
// The native prompt is only shown after a user gesture; unsupported browsers
// receive accurate platform-specific instructions instead.
const installButtons = [...document.querySelectorAll('[data-install-trigger]')];
const dialog = document.querySelector('#install-app-dialog');
const help = document.querySelector('#install-dialog-help');
const close = () => { if (dialog?.open) dialog.close(); };
let deferredPrompt = null;

function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || navigator.standalone === true;
}

function syncInstalledState() {
  const installed = isInstalled();
  for (const button of installButtons) button.hidden = installed;
  if (installed) close();
}

function instructions() {
  const ua = navigator.userAgent || '';
  const isAppleMobile = /iPhone|iPad|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isAppleMobile) {
    return 'On iPhone or iPad, open this page in Safari, tap Share, then choose Add to Home Screen.';
  }
  if (/Android/i.test(ua)) {
    return 'On Android, open the browser menu (⋮) and choose Install app or Add to Home screen.';
  }
  if (/Macintosh|Mac OS X/i.test(ua)) {
    return 'In Chrome or Edge, open the browser menu and choose Install CROWN STRIKE (if offered). In Safari, use File > Add to Dock.';
  }
  return 'In Chrome or Edge, open the browser menu (⋮) and choose Install CROWN STRIKE or Install page as app, if offered.';
}

function showHelp() {
  if (!dialog || !help) return;
  help.textContent = instructions();
  if (!dialog.open) dialog.showModal();
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  syncInstalledState();
});

window.matchMedia('(display-mode: standalone)').addEventListener?.('change', syncInstalledState);
window.matchMedia('(display-mode: fullscreen)').addEventListener?.('change', syncInstalledState);

for (const button of installButtons) {
  button.addEventListener('click', async () => {
    if (isInstalled()) { syncInstalledState(); return; }
    if (!deferredPrompt) { showHelp(); return; }
    const promptEvent = deferredPrompt;
    deferredPrompt = null; // The browser's install prompt may only be used once.
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice?.outcome !== 'accepted') showHelp();
    } catch {
      showHelp();
    }
  });
}

document.querySelector('#install-dialog-close')?.addEventListener('click', close);
document.querySelector('#install-dialog-done')?.addEventListener('click', close);
dialog?.addEventListener('click', (event) => {
  if (event.target === dialog) close();
});
syncInstalledState();
