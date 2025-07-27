class SchemaForgePopup {
  constructor() {
    this.schemas = [];
    this.activeSchema = null;
    this.isActive = false;
    this.currentPage = 'schemas';
    this.apiKey = null;
    
    this.init();
  }
  
  async init() {
    await this.loadApiKey();
    await this.loadData();
    this.setupEventListeners();
    this.updateUI();
    
    // If no API key is configured, automatically switch to User tab
    if (!this.apiKey) {
      this.switchPage('user');
    } else {
      // Ensure the initial page state is properly set
      this.switchPage(this.currentPage);
    }
  }
  
  async loadApiKey() {
    try {
      const result = await chrome.storage.local.get(['apiKey']);
      this.apiKey = result.apiKey || null;
      
      // Update the input field if API key exists
      const apiKeyInput = document.getElementById('api-key-input');
      if (apiKeyInput && this.apiKey) {
        apiKeyInput.value = this.apiKey;
      }
    } catch (error) {
      console.error('Failed to load API key:', error);
    }
  }
  
  async saveApiKey(apiKey) {
    try {
      await chrome.storage.local.set({ apiKey: apiKey });
      this.apiKey = apiKey;
      
      // Notify content script of API key change
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id, { 
        action: 'updateApiKey', 
        apiKey: apiKey 
      });
      
      this.showApiStatus('API key saved successfully', 'success');
    } catch (error) {
      console.error('Failed to save API key:', error);
      this.showApiStatus('Failed to save API key', 'error');
    }
  }
  
  async testApiKey() {
    const apiKeyInput = document.getElementById('api-key-input');
    const testApiKey = apiKeyInput.value.trim();
    
    if (!testApiKey) {
      this.showApiStatus('Please enter an API key', 'error');
      return;
    }
    
    this.showApiStatus('Testing API connection...', 'loading');
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const response = await chrome.tabs.sendMessage(tab.id, { 
        action: 'testApiKey', 
        apiKey: testApiKey 
      });
      
      if (response && response.success) {
        this.showApiStatus(`Connection successful! Found ${response.schemaCount || 0} schemas`, 'success');
        // Auto-save the API key if test is successful
        await this.saveApiKey(testApiKey);
        // Reload data to get the schemas
        await this.loadData();
        this.updateUI();
      } else {
        this.showApiStatus(response?.error || 'API key test failed', 'error');
      }
    } catch (error) {
      console.error('Failed to test API key:', error);
      this.showApiStatus('Connection failed. Please check your API key.', 'error');
    }
  }
  
  showApiStatus(message, type) {
    const statusElement = document.getElementById('api-status');
    statusElement.style.display = 'block';
    statusElement.textContent = message;
    
    // Remove previous status classes
    statusElement.className = '';
    
    switch (type) {
      case 'success':
        statusElement.style.color = '#10b981';
        break;
      case 'error':
        statusElement.style.color = '#ef4444';
        break;
      case 'loading':
        statusElement.style.color = '#3b82f6';
        break;
      default:
        statusElement.style.color = '#6b7280';
    }
    
    // Auto-hide success/error messages after 5 seconds
    if (type === 'success' || type === 'error') {
      setTimeout(() => {
        statusElement.style.display = 'none';
      }, 5000);
    }
  }
  
  async loadData() {
    try {
      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Send message to content script
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getSchemas' });
      
      if (response) {
        this.schemas = response.schemas || [];
        this.activeSchema = response.activeSchema;
        this.isActive = response.isActive || false;
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  }
  
  setupEventListeners() {
    const toggleBtn = document.getElementById('toggle-btn');
    const schemaSelect = document.getElementById('schema-select');
    const navTabs = document.querySelectorAll('.nav-tab');
    const saveApiKeyBtn = document.getElementById('save-api-key');
    const testApiKeyBtn = document.getElementById('test-api-key');
    const apiKeyInput = document.getElementById('api-key-input');
    
    toggleBtn.addEventListener('click', () => {
      this.toggleActive();
    });
    
    schemaSelect.addEventListener('change', (e) => {
      this.setActiveSchema(e.target.value);
    });
    
    navTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        const page = e.target.getAttribute('data-page');
        this.switchPage(page);
      });
    });
    
    saveApiKeyBtn.addEventListener('click', () => {
      const apiKey = apiKeyInput.value.trim();
      if (apiKey) {
        this.saveApiKey(apiKey);
      } else {
        this.showApiStatus('Please enter an API key', 'error');
      }
    });
    
    testApiKeyBtn.addEventListener('click', () => {
      this.testApiKey();
    });
    
    // Allow Enter key to save API key
    apiKeyInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.testApiKey();
      }
    });
  }
  
  switchPage(page) {
    console.log('Switching to page:', page);
    this.currentPage = page;
    
    // Update nav tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.classList.remove('active');
      if (tab.getAttribute('data-page') === page) {
        tab.classList.add('active');
      }
    });
    
    // Update page content
    document.querySelectorAll('.page').forEach(pageElement => {
      pageElement.classList.remove('active');
    });
    
    const targetPage = document.getElementById(`${page}-page`);
    console.log('Target page found:', targetPage);
    if (targetPage) {
      targetPage.classList.add('active');
      console.log('Page switched successfully to:', page);
    } else {
      console.error('Could not find page element with id:', `${page}-page`);
    }
  }
  
  async toggleActive() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'toggleActive' });
      
      if (response) {
        this.isActive = response.isActive;
        this.updateUI();
      }
    } catch (error) {
      console.error('Failed to toggle:', error);
    }
  }
  
  async setActiveSchema(schemaId) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id, { 
        action: 'setActiveSchema', 
        schemaId: schemaId 
      });
      
      this.activeSchema = this.schemas.find(s => s.id === schemaId) || null;
      this.updateUI();
      
      // Also trigger button recreation with new schema text
      await chrome.tabs.sendMessage(tab.id, { 
        action: 'recreateButton'
      });
    } catch (error) {
      console.error('Failed to set schema:', error);
    }
  }
  
  // API key visibility methods removed for security

  updateUI() {
    this.updateToggleButton();
    this.updateSchemaSelect();
    this.updateSchemaPreview();
    this.updateStatus();
  }
  
  updateToggleButton() {
    const toggleBtn = document.getElementById('toggle-btn');
    
    if (this.isActive) {
      toggleBtn.textContent = 'ON';
      toggleBtn.className = 'toggle-button active';
    } else {
      toggleBtn.textContent = 'OFF';
      toggleBtn.className = 'toggle-button inactive';
    }
  }
  
  updateSchemaSelect() {
    const select = document.getElementById('schema-select');
    
    if (!this.apiKey) {
      select.innerHTML = '<option value="">Please configure API key first</option>';
      select.disabled = true;
    } else if (this.schemas.length === 0) {
      select.innerHTML = '<option value="">No schemas available</option>';
      select.disabled = false;
    } else {
      select.innerHTML = '<option value="">No Schema</option>';
      select.disabled = false;
      
      this.schemas.forEach(schema => {
        const option = document.createElement('option');
        option.value = schema.id;
        option.textContent = schema.name;
        option.selected = this.activeSchema?.id === schema.id;
        select.appendChild(option);
      });
    }
  }
  
  updateSchemaPreview() {
    const preview = document.getElementById('schema-preview');
    
    if (this.activeSchema) {
      preview.style.display = 'block';
      preview.innerHTML = `
        <h4>${this.activeSchema.company.name}</h4>
        <div class="detail">Industry: ${this.activeSchema.company.industry}</div>
        <div class="detail">Tone: ${this.activeSchema.company.tone}</div>
        <div class="detail">Target: ${this.activeSchema.personas[0].name}</div>
      `;
    } else {
      preview.style.display = 'none';
    }
  }
  
  updateStatus() {
    const status = document.getElementById('status');
    
    if (!this.apiKey) {
      status.textContent = 'Please configure your API key in the User tab';
      status.className = 'status';
    } else if (this.schemas.length === 0) {
      status.textContent = 'No schemas available - check your API key';
      status.className = 'status';
    } else if (this.isActive && this.activeSchema) {
      status.textContent = `Active: ${this.activeSchema.name} schema will enhance prompts`;
      status.className = 'status active';
    } else if (this.isActive) {
      status.textContent = 'Active but no schema selected';
      status.className = 'status';
    } else {
      status.textContent = 'Inactive - prompts will not be enhanced';
      status.className = 'status';
    }
  }
}

// Initialize popup
new SchemaForgePopup();