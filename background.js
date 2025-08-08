chrome.action.onClicked.addListener(async (tab) => {
  // Only inject into ChatGPT pages
  if (tab.url.includes('chat.openai.com') || tab.url.includes('chatgpt.com')) {
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'toggleWidget' });
    } catch (error) {
              console.log('Context4U: Content script not ready, injecting...');
      // Content script might not be loaded yet, inject it
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        // Try sending message again after a brief delay
        setTimeout(async () => {
          try {
            await chrome.tabs.sendMessage(tab.id, { action: 'toggleWidget' });
          } catch (retryError) {
                            console.error('Context4U: Failed to send message after injection:', retryError);
          }
        }, 1000);
      } catch (injectionError) {
                    console.error('Context4U: Failed to inject content script:', injectionError);
      }
    }
  }
});