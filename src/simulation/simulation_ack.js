const bgPort = browser.runtime.connect({name: "simulation_ack"});

// Close button event handler
document.querySelector("button").addEventListener("click", async (e) => {
  bgPort.postMessage({action: "close"});
});

i18n.updateDocument();