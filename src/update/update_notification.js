let bgPort = browser.runtime.connect({name: "update"});

document.addEventListener("DOMContentLoaded", async () => {
  for(const s of document.querySelectorAll("span.plugin"))
    s.textContent = browser.runtime.getManifest().name;

  // View selection
  let url = new URL(window.location.href),
      p_url = url.searchParams.get("url"),
      p_state = url.searchParams.get("state"),
      p_version = url.searchParams.get("version"),
      $updateURL = document.querySelector(`a.updateURL`);
  document.querySelector(`body > div${p_state}`).classList.remove("hide");
  $updateURL.textContent = p_url;
  $updateURL.setAttribute("href", p_url);
  for(const s of document.querySelectorAll(`span.version`)) 
    s.textContent = p_version;

  // Update link handler -> open URL in new tab and close notification window
  $updateURL.addEventListener("click", (e) => {
    e.preventDefault();
    browser.tabs.create({
      active: true,
      url: p_url
    });
    bgPort.postMessage({action: "close"});
  });

  // Close button event handler
  document.querySelector("button").addEventListener("click", async (e) => {
    bgPort.postMessage({action: "close"});
  });
});

i18n.updateDocument();