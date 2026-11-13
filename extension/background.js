importScripts('config.js');

// The content script asks for the tab to be opened here, so a popup blocker can't swallow it.
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== 'open' || typeof message.url !== 'string' || !message.url.startsWith(`${ZWISHLY_URL}#`)) return;
  chrome.tabs.create({ url: message.url, index: sender.tab ? sender.tab.index + 1 : undefined });
});

// Toolbar icon: analyze the game on the current page, or just open Zwishly anywhere else.
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'analyze' });
  } catch {
    chrome.tabs.create({ url: ZWISHLY_URL });
  }
});
