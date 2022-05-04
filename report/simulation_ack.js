let bgPort = browser.runtime.connect({name: 'simulation_ack'});

document.querySelector('button').addEventListener('click', async (e) => {
  bgPort.postMessage({action: 'close'});
});

i18n.updateDocument();
