class SchemaForgePopup {
  constructor() {
    this.schemas = [];
    this.activeSchema = null;
    this.isActive = false;
    this.currentPage = 'schemas';
    // API key should not be stored in frontend code for security
    this.apiKey = null;
    this.isApiKeyVisible = false;
    
    this.init();
  }
  
  async init() {
    await this.loadData();
    this.setupEventListeners();
    this.updateUI();
    // Ensure the initial page state is properly set
    this.switchPage(this.currentPage);
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
    
    select.innerHTML = '<option value="">No Schema</option>';
    
    this.schemas.forEach(schema => {
      const option = document.createElement('option');
      option.value = schema.id;
      option.textContent = schema.name;
      option.selected = this.activeSchema?.id === schema.id;
      select.appendChild(option);
    });
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
    
    if (this.isActive && this.activeSchema) {
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