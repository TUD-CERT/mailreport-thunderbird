import { localizeDocument } from "../vendor/i18n.mjs";

const bgPort = browser.runtime.connect({name: "simulation_ack"});

// Close button event handler
document.querySelector("button").addEventListener("click", async (e) => {
  bgPort.postMessage({action: "close"});
});

localizeDocument();