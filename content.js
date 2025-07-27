// Simple Working SchemaForge Chrome Extension
// Replace your entire content.js with this clean version

console.log('ContextOS: Loading extension...');

class SchemaForge {
  constructor() {
    this.schemas = [];
    this.activeSchema = null;
    this.isActive = true; // Start active for testing
    this.buttonHasBeenShown = false; // Track if button has been displayed before
    this.hasInjectedSchema = false; // Track if schema has been successfully injected
    this.userSelectedSchema = false; // Track if user has manually selected a schema
    this.dialogVisible = true; // Track dialog visibility state (default to visible)
    this.currentWidgetPage = null; // Track current widget page (schemas/user)
    // API key will be loaded from Chrome storage
    this.apiKey = null;
    this.apiUrl = 'https://uycbruvaxgawpmdddqry.supabase.co/functions/v1/user-schemas-api';
    this.isLoadingSchemas = true;
    
    this.init();
  }

  async loadApiKey() {
    try {
      const result = await chrome.storage.local.get(['apiKey']);
      this.apiKey = result.apiKey || null;
      return this.apiKey;
    } catch (error) {
      console.error('ContextOS: Failed to load API key:', error);
      return null;
    }
  }

  async init() {
    console.log('ContextOS: Initializing...');
    this.createWidget();
    
    // Load API key first
    await this.loadApiKey();
    
    // Load schemas from API only if we have an API key
    if (this.apiKey) {
      await this.loadSchemasFromAPI();
    } else {
      console.log('ContextOS: No API key found, skipping schema loading');
      this.isLoadingSchemas = false;
      this.updateWidget();
    }
    
    // Set up mutation observer to recreate button when DOM changes
    this.setupMutationObserver();
    
    // Create settings button
    this.createSettingsButtonWithRetry();
    
    // Additional positioning check after page fully loads
    if (document.readyState !== 'complete') {
      window.addEventListener('load', () => {
        setTimeout(() => {
          console.log('ContextOS: Page fully loaded, verifying button positions');
          const enhanceButton = document.getElementById('sf-enhance-btn');
          const settingsButton = document.getElementById('sf-settings-btn');
          
          if (!enhanceButton || !this.isButtonProperlyPositioned(enhanceButton)) {
            this.createEnhanceButtonWithRetry();
          }
          
          if (!settingsButton) {
            this.createSettingsButtonWithRetry();
          }
        }, 500);
      });
    }
  }

  async loadSchemasFromAPI(testApiKey = null) {
    const apiKeyToUse = testApiKey || this.apiKey;
    
    if (!apiKeyToUse) {
      throw new Error('No API key provided');
    }
    
    try {
      console.log('ContextOS: Loading schemas from API...');
      const response = await fetch(`${this.apiUrl}?api_key=${apiKeyToUse}`);
      
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('Invalid API key - please check your credentials');
        } else if (response.status >= 500) {
          throw new Error('Server error - please try again later');
        } else {
          throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }
      }
      
      const data = await response.json();
      
      if (data && Array.isArray(data.schemas)) {
        // Convert API schema format to internal format
        const schemas = data.schemas.map(schema => ({
          id: schema.id,
          name: schema.name,
          company: {
            name: schema.companyName || 'Unknown Company',
            industry: schema.type || 'Unknown Industry',
            tone: schema.tone || 'Professional',
            values: Array.isArray(schema.keyGoals) ? schema.keyGoals.slice(0, 3) : ['Data-driven decisions']
          },
          personas: [{
            name: Array.isArray(schema.targetAudience) ? schema.targetAudience[0] || 'Business Professional' : 'Business Professional',
            traits: ['Professional', 'Goal-oriented', 'Strategic'],
            painPoints: ['Ineffective messaging', 'Poor targeting'],
            channels: ['Email', 'LinkedIn', 'Content Marketing']
          }],
          objectives: [{
            name: Array.isArray(schema.keyGoals) ? schema.keyGoals[0] || 'Improve Performance' : 'Improve Performance',
            description: schema.description || 'Optimize business outcomes',
            kpis: ['Conversion rate', 'Engagement metrics']
          }],
          rules: [
            schema.tone ? `Match tone: ${schema.tone}` : 'Use professional tone',
            'Include relevant business context',
            'Focus on key objectives and target audience'
          ]
        }));
        
        // If this is not a test, update the instance
        if (!testApiKey) {
          this.schemas = schemas;
          this.activeSchema = this.schemas.length > 0 ? this.schemas[0] : null;
          console.log('ContextOS: Loaded', this.schemas.length, 'schemas from API');
          this.isLoadingSchemas = false;
          this.updateWidget();
          
          // Create button after schemas are loaded
          this.createEnhanceButton();
          setTimeout(() => {
            this.createEnhanceButtonWithRetry();
          }, 100);
        }
        
        return { success: true, schemas: schemas, schemaCount: schemas.length };
      } else {
        throw new Error('Invalid API response format');
      }
      
    } catch (error) {
      console.error('ContextOS: Failed to load schemas from API:', error);
      
      if (!testApiKey) {
        this.isLoadingSchemas = false;
        // No fallback schemas - just display error state
        this.schemas = [];
        this.activeSchema = null;
        this.updateWidget();
      }
      
      return { success: false, error: error.message };
    }
  }



  isButtonProperlyPositioned(button) {
    if (!button) return false;
    const rect = button.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.left > 0;
  }

  setupMutationObserver() {
    // Observer to watch for DOM changes that might remove our buttons
    this.observer = new MutationObserver((mutations) => {
      let shouldRecreateEnhanceButton = false;
      let shouldRecreateSettingsButton = false;
      
      mutations.forEach((mutation) => {
        // Check if our buttons were removed
        if (mutation.type === 'childList') {
          mutation.removedNodes.forEach((node) => {
            if (node.id === 'sf-enhance-btn' || 
                (node.nodeType === Node.ELEMENT_NODE && node.querySelector('#sf-enhance-btn'))) {
              console.log('ContextOS: Enhance button removed by DOM change, will recreate');
              shouldRecreateEnhanceButton = true;
            }
            if (node.id === 'sf-settings-btn' || 
                (node.nodeType === Node.ELEMENT_NODE && node.querySelector('#sf-settings-btn'))) {
              console.log('ContextOS: Settings button removed by DOM change, will recreate');
              shouldRecreateSettingsButton = true;
            }
          });
        }
      });
      
      // Also check if buttons are missing
      if (!document.getElementById('sf-enhance-btn') && this.isActive && !this.hasInjectedSchema) {
        shouldRecreateEnhanceButton = true;
      }
      if (!document.getElementById('sf-settings-btn')) {
        shouldRecreateSettingsButton = true;
      }
      
      if (shouldRecreateEnhanceButton || shouldRecreateSettingsButton) {
        // Debounce rapid changes
        clearTimeout(this.recreateTimeout);
        this.recreateTimeout = setTimeout(() => {
          console.log('ContextOS: Recreating buttons due to DOM changes');
          if (shouldRecreateEnhanceButton) {
            this.createEnhanceButtonWithRetry();
          }
          if (shouldRecreateSettingsButton) {
            this.createSettingsButtonWithRetry();
          }
        }, 1000);
      }
    });
    
    // Start observing
    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    console.log('ContextOS: Mutation observer set up');
  }

  createEnhanceButtonWithRetry(attempts = 0) {
    const maxAttempts = 8; // Increased attempts for better reliability
    const delay = attempts < 3 ? 500 : 1000; // Shorter delay for first attempts
    
    console.log('ContextOS: Attempting to create button, attempt:', attempts + 1);
    this.createEnhanceButton();
    
                // Check if button was successfully created and properly positioned
      setTimeout(() => {
        const button = document.getElementById('sf-enhance-btn');
        const buttonContainer = this.findButtonContainer();
        const searchButton = buttonContainer ? this.findSearchButton(buttonContainer) : null;
        
        // Don't retry if schema has already been injected
        if (this.hasInjectedSchema) {
          console.log('ContextOS: Stopping retry - schema already injected');
          return;
        }

        if (!button && attempts < maxAttempts) {
          console.log('ContextOS: Button not found, retrying...');
          this.createEnhanceButtonWithRetry(attempts + 1);
        } else if (button && !searchButton && attempts < maxAttempts) {
          console.log('ContextOS: Button created but search button not found, retrying...');
          button.remove(); // Remove and retry for better positioning
          this.createEnhanceButtonWithRetry(attempts + 1);
        } else if (button) {
          console.log('ContextOS: Button successfully created and positioned');
          // Verify positioning is correct
          this.verifyButtonPosition(button);
        } else {
          console.log('ContextOS: Failed to create button after', maxAttempts, 'attempts');
        }
      }, delay);
  }

  extendButtonPadding(originalPadding) {
    // Parse the original padding and add 5px to left and right (total 10px width increase)
    if (!originalPadding || originalPadding === '') {
      return '8px 17px'; // Default padding with 5px extra on each side
    }
    
    // Handle different padding formats
    const paddingValues = originalPadding.split(' ').map(val => val.trim());
    
    if (paddingValues.length === 1) {
      // Single value: "8px" -> "8px 13px" (original + 5px horizontal)
      const value = parseInt(paddingValues[0]);
      return `${paddingValues[0]} ${value + 5}px`;
    } else if (paddingValues.length === 2) {
      // Two values: "8px 12px" -> "8px 17px" (add 5px to horizontal)
      const horizontalValue = parseInt(paddingValues[1]);
      return `${paddingValues[0]} ${horizontalValue + 5}px`;
    } else if (paddingValues.length === 4) {
      // Four values: "8px 12px 8px 12px" -> "8px 17px 8px 17px" (add 5px to left/right)
      const rightValue = parseInt(paddingValues[1]);
      const leftValue = parseInt(paddingValues[3]);
      return `${paddingValues[0]} ${rightValue + 5}px ${paddingValues[2]} ${leftValue + 5}px`;
    }
    
    // Fallback: return original with extra horizontal padding
    return originalPadding.replace(/(\d+px)(\s|$)/, (match, p1, p2) => {
      const value = parseInt(p1);
      return `${value + 5}px${p2}`;
    });
  }

  getButtonText() {
    // If user has manually selected a schema, use schema name
    if (this.userSelectedSchema && this.activeSchema && this.activeSchema.name) {
      return `✨ Enhance with ${this.activeSchema.name} `;
    }
    
    // Default to "ContextOS" for initial load and before user selects a schema
    return '✨ Enhance with ContextOS ';
  }

  hideButtonAfterInjection() {
    const button = document.getElementById('sf-enhance-btn');
    if (button) {
      console.log('ContextOS: Hiding button after successful schema injection');
      
      // Add fade-out animation
      button.style.transition = 'all 0.3s ease';
      button.style.opacity = '0';
      button.style.transform = button.style.transform ? 
        button.style.transform.replace('scale(1)', 'scale(0.9)') : 'scale(0.9)';
      
      // Remove button from DOM after animation
      setTimeout(() => {
        if (button && button.parentNode) {
          button.remove();
          console.log('ContextOS: Button removed from DOM after injection');
        }
      }, 300); // Wait for fade-out animation to complete
    }
  }

  showButtonAfterPositioning(button) {
    // Wait a short moment to ensure positioning is complete, then show the button
    setTimeout(() => {
      if (button && button.parentNode) {
        console.log('ContextOS: Showing button after positioning complete');
        button.style.opacity = '1';
        button.style.visibility = 'visible';
        
        // Mark that button has been shown for the first time
        this.buttonHasBeenShown = true;
        
        // Add a subtle fade-in animation
        button.style.transform = button.style.transform ? 
          button.style.transform + ' scale(0.95)' : 'scale(0.95)';
        
        // Animate to full scale
        setTimeout(() => {
          if (button && button.parentNode) {
            button.style.transform = button.style.transform ? 
              button.style.transform.replace('scale(0.95)', 'scale(1)') : 'scale(1)';
          }
        }, 50);
      }
    }, 100); // 100ms delay to ensure positioning is complete
  }

  verifyButtonPosition(button) {
    // Ensure button is properly positioned and visible
    const rect = button.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      console.log('ContextOS: Button has zero dimensions, repositioning...');
      setTimeout(() => this.createEnhanceButtonWithRetry(), 1000);
    } else {
      console.log('ContextOS: Button positioning verified - width:', rect.width, 'height:', rect.height);
      // Ensure button is shown after verification (only if it hasn't been shown before)
      if (!this.buttonHasBeenShown) {
        this.showButtonAfterPositioning(button);
      }
    }
  }

  createWidget() {
    // Remove existing
    const existing = document.getElementById('sf-widget');
    if (existing) existing.remove();

    // Don't create widget if dialog is hidden
    if (!this.dialogVisible) {
      return;
    }

    // Initialize current page if not set
    if (!this.currentWidgetPage) {
      this.currentWidgetPage = this.apiKey ? 'schemas' : 'user';
    }

    const widget = document.createElement('div');
    widget.id = 'sf-widget';
    widget.innerHTML = `
      <div style="background: white; border: 2px solid #3b82f6; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; width: 100%;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0; font-size: 18px; font-weight: 600;">ContextOS</h1>
          <p style="margin: 4px 0 0 0; opacity: 0.9; font-size: 12px;">AI Context Enhancement</p>
        </div>
        
        <!-- Navigation Tabs -->
        <div style="display: flex; background: #f9fafb; border-bottom: 1px solid #e5e7eb;">
          <div class="sf-nav-tab ${this.currentWidgetPage === 'schemas' ? 'active' : ''}" data-page="schemas" style="flex: 1; padding: 12px; text-align: center; cursor: pointer; font-weight: 500; color: ${this.currentWidgetPage === 'schemas' ? '#3b82f6' : '#6b7280'}; border-bottom: 2px solid ${this.currentWidgetPage === 'schemas' ? '#3b82f6' : 'transparent'}; background: ${this.currentWidgetPage === 'schemas' ? 'white' : 'transparent'}; transition: all 0.2s;">Schemas</div>
          <div class="sf-nav-tab ${this.currentWidgetPage === 'user' ? 'active' : ''}" data-page="user" style="flex: 1; padding: 12px; text-align: center; cursor: pointer; font-weight: 500; color: ${this.currentWidgetPage === 'user' ? '#3b82f6' : '#6b7280'}; border-bottom: 2px solid ${this.currentWidgetPage === 'user' ? '#3b82f6' : 'transparent'}; background: ${this.currentWidgetPage === 'user' ? 'white' : 'transparent'}; transition: all 0.2s;">User</div>
        </div>
        
        <!-- Content -->
        <div style="padding: 20px;">
          <!-- Schemas Page -->
          <div id="sf-schemas-page" class="sf-page" style="display: ${this.currentWidgetPage === 'schemas' ? 'block' : 'none'};">
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: #f9fafb; border-radius: 8px; margin-bottom: 20px;">
              <span>Schema Enhancement</span>
              <button id="sf-toggle" style="background: ${this.isActive ? '#10b981' : '#6b7280'}; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 500;">${this.isActive ? 'ON' : 'OFF'}</button>
            </div>
            
            <div style="margin-bottom: 20px;">
              <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #374151;">Select Schema:</label>
              <select id="sf-schema-select" style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; background: white; font-size: 14px;" ${this.isLoadingSchemas || !this.apiKey ? 'disabled' : ''}>
                ${!this.apiKey ? 
                  '<option value="">Please configure API key first</option>' :
                  this.isLoadingSchemas ? 
                  '<option value="">Loading schemas...</option>' : 
                  this.schemas.length > 0 ? 
                  this.schemas.map(s => `<option value="${s.id}" ${this.activeSchema && s.id === this.activeSchema.id ? 'selected' : ''}>${s.name}</option>`).join('') :
                  '<option value="">No schemas available</option>'
                }
              </select>
              
              <div id="sf-schema-preview" style="background: #f9fafb; padding: 12px; border-radius: 6px; margin-top: 12px; font-size: 12px; display: ${this.activeSchema ? 'block' : 'none'};">
                ${this.activeSchema ? `
                  <h4 style="margin: 0 0 8px 0; color: #1f2937;">${this.activeSchema.company.name}</h4>
                  <div style="color: #6b7280; margin-bottom: 4px;">Industry: ${this.activeSchema.company.industry}</div>
                  <div style="color: #6b7280; margin-bottom: 4px;">Tone: ${this.activeSchema.company.tone}</div>
                  <div style="color: #6b7280;">Target: ${this.activeSchema.personas[0].name}</div>
                ` : ''}
              </div>
            </div>
          </div>
          
          <!-- User Page -->
          <div id="sf-user-page" class="sf-page" style="display: ${this.currentWidgetPage === 'user' ? 'block' : 'none'};">
            <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
              <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #374151;">API Configuration</h3>
              <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #374151;">API Key:</label>
                <input type="password" id="sf-api-key-input" placeholder="Enter your API key..." value="${this.apiKey || ''}" style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; box-sizing: border-box;">
                <div style="margin-top: 8px;">
                  <button id="sf-test-api-key" style="background: #10b981; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 500;">Test Connection</button>
                </div>
                <div id="sf-api-status" style="margin-top: 8px; font-size: 12px; display: none;"></div>
              </div>
              <div style="background: #f9fafb; padding: 12px; border-radius: 6px; font-size: 12px; color: #6b7280;">
                <div style="margin-bottom: 8px;"><strong>Privacy Notice:</strong></div>
                <div>API keys are stored securely in your browser's local storage and are never transmitted to third parties except for authenticated API requests.</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Status -->
        <div id="sf-status" style="font-size: 12px; color: ${this.getStatusColor()}; text-align: center; padding: 10px; border-top: 1px solid #e5e7eb;">
          ${this.getStatusText()}
        </div>
      </div>
    `;
    
    widget.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: 350px;
      z-index: 10000;
    `;
    
    document.body.appendChild(widget);
    
    // Add event listeners
    this.setupWidgetEventListeners(widget);
  }

  getStatusText() {
    if (!this.apiKey) {
      return 'Please configure your API key in the User tab';
    } else if (this.schemas.length === 0) {
      return 'No schemas available - check your API key';
    } else if (this.isActive && this.activeSchema) {
      return `Active: ${this.activeSchema.name} schema will enhance prompts`;
    } else if (this.isActive) {
      return 'Active but no schema selected';
    } else {
      return 'Inactive - prompts will not be enhanced';
    }
  }

  getStatusColor() {
    if (this.isActive && this.activeSchema && this.apiKey) {
      return '#10b981';
    }
    return '#6b7280';
  }

  setupWidgetEventListeners(widget) {
    // Tab navigation
    widget.querySelectorAll('.sf-nav-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const page = e.target.getAttribute('data-page');
        this.switchWidgetPage(page);
      });
      
      // Hover effects
      tab.addEventListener('mouseenter', () => {
        if (!tab.classList.contains('active')) {
          tab.style.color = '#3b82f6';
        }
      });
      
      tab.addEventListener('mouseleave', () => {
        if (!tab.classList.contains('active')) {
          tab.style.color = '#6b7280';
        }
      });
    });

    // Toggle button
    const toggleBtn = widget.querySelector('#sf-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        this.isActive = !this.isActive;
        // Reset injection flag when toggling to allow button to reappear
        if (this.isActive) {
          this.hasInjectedSchema = false;
        }
        this.updateWidget();
      });
    }

    // Schema selection
    const schemaSelect = widget.querySelector('#sf-schema-select');
    if (schemaSelect && !this.isLoadingSchemas) {
      schemaSelect.addEventListener('change', (e) => {
        const selectedSchema = this.schemas.find(s => s.id === e.target.value);
        if (selectedSchema) {
          this.activeSchema = selectedSchema;
          this.userSelectedSchema = true;
          // Reset injection flag when changing schemas to allow re-enhancement
          this.hasInjectedSchema = false;
          this.updateWidget();
          
          // Update button text immediately if button exists
          const existingButton = document.getElementById('sf-enhance-btn');
          if (existingButton) {
            existingButton.textContent = this.getButtonText();
          }
        } else {
          this.activeSchema = null;
          // Reset injection flag when clearing schema selection
          this.hasInjectedSchema = false;
          this.updateWidget();
        }
      });
    }

    // API Key management
    const testApiKeyBtn = widget.querySelector('#sf-test-api-key');
    const apiKeyInput = widget.querySelector('#sf-api-key-input');

    if (testApiKeyBtn) {
      testApiKeyBtn.addEventListener('click', () => {
        this.testApiKey();
      });
    }

    if (apiKeyInput) {
      apiKeyInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.testApiKey();
        }
      });
    }
  }

  switchWidgetPage(page) {
    console.log('ContextOS: Switching widget page to:', page);
    this.currentWidgetPage = page;
    this.updateWidget();
  }

  async saveApiKey(apiKey) {
    try {
      await chrome.storage.local.set({ apiKey: apiKey });
      this.apiKey = apiKey;
      
      this.showWidgetApiStatus('API key saved successfully', 'success');
      
      // Load schemas after saving API key
      this.isLoadingSchemas = true;
      this.updateWidget();
      
      try {
        await this.loadSchemasFromAPI();
        this.updateWidget();
        
        // Do not automatically switch to schemas page - user must manually select Schema tab
        console.log('ContextOS: API key saved and schemas loaded successfully');
      } catch (error) {
        console.error('ContextOS: Failed to load schemas after saving API key:', error);
        this.showWidgetApiStatus('API key saved but failed to load schemas: ' + error.message, 'error');
      }
    } catch (error) {
      console.error('ContextOS: Failed to save API key:', error);
      this.showWidgetApiStatus('Failed to save API key', 'error');
    }
  }

  async testApiKey() {
    const widget = document.getElementById('sf-widget');
    if (!widget) return;
    
    const apiKeyInput = widget.querySelector('#sf-api-key-input');
    const testApiKey = apiKeyInput.value.trim();
    
    // Error checks
    if (!testApiKey) {
      this.showWidgetApiStatus('Please enter an API key', 'error');
      return;
    }
    
    // Basic format validation for API key
    if (testApiKey.length < 10) {
      this.showWidgetApiStatus('API key appears to be too short', 'error');
      return;
    }
    
    // Check for common invalid characters or patterns
    if (testApiKey.includes(' ')) {
      this.showWidgetApiStatus('API key should not contain spaces', 'error');
      return;
    }
    
    this.showWidgetApiStatus('Testing API connection...', 'loading');
    
    try {
      await this.loadSchemasFromAPI(testApiKey);
      
      const schemaCount = this.schemas.length;
      this.showWidgetApiStatus('Connection successful', 'success');
      
      // Auto-save the API key if test is successful
      await chrome.storage.local.set({ apiKey: testApiKey });
      this.apiKey = testApiKey;
      
      // Update the widget to reflect the saved API key and loaded schemas
      this.updateWidget();
      
      console.log(`ContextOS: API key saved and ${schemaCount} schemas loaded`);
    } catch (error) {
      console.error('ContextOS: Failed to test API key:', error);
      
      // Enhanced error messaging based on error type
      let errorMessage = 'Connection failed: ';
      if (error.message.includes('Invalid API key')) {
        errorMessage += 'Invalid API key - please check your credentials';
      } else if (error.message.includes('Server error')) {
        errorMessage += 'Server error - please try again later';
      } else if (error.message.includes('Network')) {
        errorMessage += 'Network error - please check your internet connection';
      } else {
        errorMessage += error.message;
      }
      
      this.showWidgetApiStatus(errorMessage, 'error');
    }
  }

  showWidgetApiStatus(message, type) {
    const widget = document.getElementById('sf-widget');
    if (!widget) return;
    
    const statusElement = widget.querySelector('#sf-api-status');
    if (!statusElement) return;
    
    statusElement.style.display = 'block';
    statusElement.textContent = message;
    
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
    
    console.log('ContextOS: Widget created');
  }

  updateWidget() {
    this.createWidget();
    this.createEnhanceButtonWithRetry(); // Refresh button visibility based on active state
    this.createSettingsButtonWithRetry(); // Refresh settings button
  }

  createEnhanceButton() {
    console.log('ContextOS: createEnhanceButton called, isActive:', this.isActive);
    
    // Remove existing
    const existing = document.getElementById('sf-enhance-btn');
    if (existing) {
      console.log('ContextOS: Removing existing button');
      existing.remove();
    }

    // Only show button when extension is active
    if (!this.isActive) {
      console.log('ContextOS: Button hidden - extension inactive');
      return;
    }

    // Don't create button if schema has already been injected
    if (this.hasInjectedSchema) {
      console.log('ContextOS: Button not created - schema already injected');
      return;
    }

    const button = document.createElement('button');
    button.id = 'sf-enhance-btn';
    button.textContent = this.getButtonText();
    
    // Get native button styling reference
    const nativeButton = this.findNativeButton();
    console.log('ContextOS: Found native button:', nativeButton);
    const baseButtonStyle = this.getNativeButtonStyle(nativeButton);
    console.log('ContextOS: Base button style:', baseButtonStyle);
    
        // Always position button at bottom right for better visibility
    console.log('ContextOS: Positioning button at bottom right');
    this.positionButtonFallback(button, baseButtonStyle);
    
    button.onclick = () => this.enhancePrompt();
    
    console.log('ContextOS: Button created and appended. Element:', button);
    console.log('ContextOS: Button in DOM:', document.getElementById('sf-enhance-btn'));
  }

  insertButtonIntoContainer(button, container, baseButtonStyle) {
    // Determine native buttons bottom position before insertion
    const nativeButtonsBottom = this.determineNativeButtonsBottom(container);
    console.log('ContextOS: Native buttons bottom for container insertion:', nativeButtonsBottom);
    
    // Insert button into container with proper styling
    const hideInitially = !this.buttonHasBeenShown;
    
    button.style.cssText = `
      background: linear-gradient(135deg, #3b82f6, #1d4ed8) !important;
      color: white !important;
      border: none !important;
      padding: ${this.extendButtonPadding(baseButtonStyle.padding)} !important;
      border-radius: 50px !important;
      font-family: ${baseButtonStyle.fontFamily} !important;
      font-size: ${baseButtonStyle.fontSize} !important;
      font-weight: ${baseButtonStyle.fontWeight} !important;
      font-style: ${baseButtonStyle.fontStyle} !important;
      line-height: ${baseButtonStyle.lineHeight} !important;
      letter-spacing: ${baseButtonStyle.letterSpacing} !important;
      text-transform: ${baseButtonStyle.textTransform} !important;
      cursor: pointer !important;
      height: ${baseButtonStyle.height} !important;
      min-height: ${baseButtonStyle.minHeight} !important;
      box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3) !important;
      transition: all 0.3s ease !important;
      margin-left: 8px !important;
      white-space: nowrap !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      ${hideInitially ? 'opacity: 0 !important; visibility: hidden !important;' : 'opacity: 1 !important; visibility: visible !important;'}
    `;
    container.appendChild(button);
    
    // Show button after positioning is complete (only if hidden initially)
    if (hideInitially) {
      this.showButtonAfterPositioning(button);
    }
  }

  positionButtonFallback(button, baseButtonStyle) {
    // Position button at bottom right of screen
    const hideInitially = !this.buttonHasBeenShown;
    
    button.style.cssText = `
      position: fixed !important;
      bottom: 30px !important;
      right: 70px !important;
      background: linear-gradient(135deg, #3b82f6, #1d4ed8) !important;
      color: white !important;
      border: none !important;
      padding: ${this.extendButtonPadding(baseButtonStyle.padding)} !important;
      border-radius: 50px !important;
      font-family: ${baseButtonStyle.fontFamily} !important;
      font-size: ${baseButtonStyle.fontSize} !important;
      font-weight: ${baseButtonStyle.fontWeight} !important;
      font-style: ${baseButtonStyle.fontStyle} !important;
      line-height: ${baseButtonStyle.lineHeight} !important;
      letter-spacing: ${baseButtonStyle.letterSpacing} !important;
      text-transform: ${baseButtonStyle.textTransform} !important;
      cursor: pointer !important;
      z-index: 10001 !important;
      height: ${baseButtonStyle.height} !important;
      min-height: ${baseButtonStyle.minHeight} !important;
      box-shadow: 0 4px 20px rgba(59, 130, 246, 0.4) !important;
      transition: all 0.3s ease !important;
      display: block !important;
      transform: scale(1) !important;
      ${hideInitially ? 'opacity: 0 !important; visibility: hidden !important;' : 'opacity: 1 !important; visibility: visible !important;'}
    `;
    
    // Add hover effect
    button.addEventListener('mouseenter', () => {
      button.style.transform = 'scale(1.05) !important';
      button.style.boxShadow = '0 6px 25px rgba(59, 130, 246, 0.5) !important';
    });
    
    button.addEventListener('mouseleave', () => {
      button.style.transform = 'scale(1) !important';
      button.style.boxShadow = '0 4px 20px rgba(59, 130, 246, 0.4) !important';
    });
    
    document.body.appendChild(button);
    if (hideInitially) {
      this.showButtonAfterPositioning(button);
    }
  }

  determineNativeButtonsBottom(container) {
    // Find all visible native buttons in the container
    const buttons = Array.from(container.querySelectorAll('button')).filter(btn => {
      const rect = btn.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && btn.id !== 'sf-enhance-btn'; // Exclude our own button
    });
    
    if (buttons.length === 0) {
      console.log('ContextOS: No native buttons found for bottom determination');
      return null;
    }
    
    // Get all button bottom positions
    const bottomPositions = buttons.map(btn => {
      const rect = btn.getBoundingClientRect();
      console.log('ContextOS: Button bottom position:', btn, rect.bottom);
      return rect.bottom;
    });
    
    // Find the maximum (lowest) bottom position
    const maxBottom = Math.max(...bottomPositions);
    
    // Also check if there's a consistent bottom line (buttons aligned)
    const tolerance = 2; // 2px tolerance for alignment
    const alignedButtons = buttons.filter(btn => {
      const rect = btn.getBoundingClientRect();
      return Math.abs(rect.bottom - maxBottom) <= tolerance;
    });
    
    console.log(`ContextOS: Found ${alignedButtons.length} buttons aligned at bottom ${maxBottom}`);
    
    // Return the determined bottom position
    return maxBottom;
  }

  findSearchButton(container) {
    console.log('ContextOS: Searching for search button...');
    
    // Strategy 1: Look for buttons with search-related attributes
    const searchSelectors = [
      'button[data-testid*="search"]',
      'button[aria-label*="search" i]',
      'button[aria-label*="Search" i]',
      'button[title*="search" i]',
      'button[title*="Search" i]',
      'button[class*="search" i]',
      'button[id*="search" i]'
    ];
    
    for (const selector of searchSelectors) {
      const button = container.querySelector(selector);
      if (button) {
        const rect = button.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          console.log('ContextOS: Found search button via selector:', selector, button);
          return button;
        }
      }
    }
    
    // Strategy 2: Look for buttons with search-related text content
    const buttons = Array.from(container.querySelectorAll('button')).filter(btn => {
      const rect = btn.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && btn.id !== 'sf-enhance-btn'; // Exclude our own button
    });
    
    for (const button of buttons) {
      const textContent = button.textContent?.toLowerCase() || '';
      const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
      const title = button.getAttribute('title')?.toLowerCase() || '';
      
      if (textContent.includes('search') || 
          ariaLabel.includes('search') || 
          title.includes('search')) {
        console.log('ContextOS: Found search button via text content:', button);
        return button;
      }
    }
    
    // Strategy 3: Look for buttons with search icon (magnifying glass symbol)
    for (const button of buttons) {
      const textContent = button.textContent || '';
      const hasSearchIcon = textContent.includes('🔍') || 
                           textContent.includes('⌕') || 
                           textContent.includes('🔎');
      
      // Also check for SVG icons that might be search-related
      const svgElements = button.querySelectorAll('svg');
      let hasSvgSearchIcon = false;
      
      for (const svg of svgElements) {
        const svgContent = svg.outerHTML.toLowerCase();
        if (svgContent.includes('search') || 
            svgContent.includes('magnify') || 
            svgContent.includes('find')) {
          hasSvgSearchIcon = true;
          break;
        }
      }
      
      if (hasSearchIcon || hasSvgSearchIcon) {
        console.log('ContextOS: Found search button via icon:', button);
        return button;
      }
    }
    
    // Strategy 4: Look in the broader document if not found in container
    const globalSearchSelectors = [
      'button[data-testid*="search"]',
      'button[aria-label*="search" i]',
      '[role="button"][aria-label*="search" i]'
    ];
    
    for (const selector of globalSearchSelectors) {
      const button = document.querySelector(selector);
      if (button) {
        const rect = button.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          console.log('ContextOS: Found search button globally:', button);
          return button;
        }
      }
    }
    
    console.log('ContextOS: No search button found');
    return null;
  }

  findButtonContainer() {
    console.log('ContextOS: Searching for button container...');
    
    // Strategy 1: Find send button and get its immediate container
    const sendButtonSelectors = [
      'button[data-testid="send-button"]',
      'button[aria-label*="Send"]',
      'button[type="submit"]'
    ];
    
    for (const selector of sendButtonSelectors) {
      const sendButton = document.querySelector(selector);
      if (sendButton) {
        const rect = sendButton.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          console.log('ContextOS: Found send button:', sendButton);
          console.log('ContextOS: Send button parent:', sendButton.parentElement);
          return sendButton.parentElement;
        }
      }
    }
    
    // Strategy 2: Look for button containers near textarea
    const textareas = document.querySelectorAll('textarea');
    for (const textarea of textareas) {
      const rect = textarea.getBoundingClientRect();
      if (rect.width > 200 && rect.height > 20) {
        // Look for buttons near this textarea
        const nearbyButtons = this.findButtonsNearElement(textarea);
        if (nearbyButtons.length > 0) {
          console.log('ContextOS: Found buttons near textarea:', nearbyButtons);
          return nearbyButtons[0].parentElement;
        }
      }
    }
    
    // Strategy 3: Find the bottommost row of buttons in a form
    const forms = document.querySelectorAll('form');
    for (const form of forms) {
      const buttons = Array.from(form.querySelectorAll('button')).filter(btn => {
        const rect = btn.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      
      if (buttons.length > 0) {
        // Find the container that holds buttons at the bottom
        const sortedButtons = buttons.sort((a, b) => {
          const rectA = a.getBoundingClientRect();
          const rectB = b.getBoundingClientRect();
          return rectB.bottom - rectA.bottom;
        });
        
        const bottomButton = sortedButtons[0];
        console.log('ContextOS: Found bottom button in form:', bottomButton);
        return bottomButton.parentElement;
      }
    }
    
    // Strategy 4: Look for any visible button that might be the send button
    const allButtons = document.querySelectorAll('button');
    for (const button of allButtons) {
      const rect = button.getBoundingClientRect();
      const text = button.textContent?.toLowerCase() || '';
      const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
      
      if (rect.width > 20 && rect.height > 20 && 
          (text.includes('send') || ariaLabel.includes('send') || 
           button.type === 'submit')) {
        console.log('ContextOS: Found potential send button:', button);
        return button.parentElement;
      }
    }
    
    console.log('ContextOS: No button container found');
    return null;
  }

  findButtonsNearElement(element) {
    const elementRect = element.getBoundingClientRect();
    const buttons = document.querySelectorAll('button');
    const nearbyButtons = [];
    
    for (const button of buttons) {
      const buttonRect = button.getBoundingClientRect();
      const distance = Math.sqrt(
        Math.pow(elementRect.right - buttonRect.left, 2) + 
        Math.pow(elementRect.bottom - buttonRect.top, 2)
      );
      
      if (distance < 100 && buttonRect.width > 20 && buttonRect.height > 20) {
        nearbyButtons.push(button);
      }
    }
    
    return nearbyButtons;
  }

  findNativeButton() {
    // Try to find native ChatGPT buttons to match styling
    const selectors = [
      'button[data-testid="send-button"]',
      'button[aria-label*="Send"]',
      'form button[type="submit"]',
      'button[class*="btn"]',
      'button'
    ];
    
    for (const selector of selectors) {
      const buttons = document.querySelectorAll(selector);
      for (const button of buttons) {
        const rect = button.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(button);
        
        // Look for buttons that are likely the send/submit buttons
        if (rect.width > 20 && rect.height > 20 && 
            computedStyle.display !== 'none' && 
            computedStyle.visibility !== 'hidden') {
          return button;
        }
      }
    }
    
    return null;
  }

  getNativeButtonStyle(nativeButton) {
    const defaultStyle = {
      padding: '8px 12px',
      borderRadius: '6px',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      fontSize: '14px',
      fontWeight: '500',
      fontStyle: 'normal',
      lineHeight: 'normal',
      letterSpacing: 'normal',
      textTransform: 'none',
      height: '36px',
      minHeight: '36px'
    };

    if (!nativeButton) {
      return defaultStyle;
    }

    const computedStyle = window.getComputedStyle(nativeButton);
    console.log('ContextOS: Native button computed style:', {
      fontFamily: computedStyle.fontFamily,
      fontSize: computedStyle.fontSize,
      fontWeight: computedStyle.fontWeight,
      fontStyle: computedStyle.fontStyle,
      lineHeight: computedStyle.lineHeight,
      letterSpacing: computedStyle.letterSpacing,
      textTransform: computedStyle.textTransform
    });
    
    return {
      padding: computedStyle.padding || defaultStyle.padding,
      borderRadius: computedStyle.borderRadius || defaultStyle.borderRadius,
      fontFamily: computedStyle.fontFamily || defaultStyle.fontFamily,
      fontSize: computedStyle.fontSize || defaultStyle.fontSize,
      fontWeight: computedStyle.fontWeight || defaultStyle.fontWeight,
      fontStyle: computedStyle.fontStyle || defaultStyle.fontStyle,
      lineHeight: computedStyle.lineHeight || defaultStyle.lineHeight,
      letterSpacing: computedStyle.letterSpacing || defaultStyle.letterSpacing,
      textTransform: computedStyle.textTransform || defaultStyle.textTransform,
      height: computedStyle.height || defaultStyle.height,
      minHeight: computedStyle.minHeight || defaultStyle.minHeight
    };
  }

  findPromptArea() {
    // Try to find the prompt area container
    const selectors = [
      'form',
      '[data-testid*="input"]',
      '.relative',
      'main'
    ];
    
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const input = element.querySelector('textarea, div[contenteditable="true"]');
        if (input) {
          const rect = element.getBoundingClientRect();
          if (rect.width > 200 && rect.height > 50) {
            return element;
          }
        }
      }
    }
    
    return null;
  }

  findInput() {
    // Try different selectors for ChatGPT input
    const selectors = [
      'textarea[data-id]',
      'div[contenteditable="true"]',
      'textarea',
      'input[type="text"]'
    ];
    
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const rect = element.getBoundingClientRect();
        // Check if element is visible and substantial
        if (rect.width > 100 && rect.height > 20 && element.offsetParent) {
          console.log('ContextOS: Found input element:', selector);
          return element;
        }
      }
    }
    
    console.log('ContextOS: No input found');
    return null;
  }

  getText(element) {
    if (!element) return '';
    
    // Handle different input types
    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
      return element.value || '';
    }
    
    if (element.contentEditable === 'true') {
      return element.textContent || element.innerText || '';
    }
    
    return element.textContent || element.value || '';
  }

  setText(element, text) {
    if (!element || !text) return;
    
    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
      element.value = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (element.contentEditable === 'true') {
      element.textContent = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.focus();
    }
  }

  enhancePrompt() {
    console.log('ContextOS: Enhance button clicked');
    
    if (!this.isActive) {
              this.showMessage('Please turn ON ContextOS first!', 'error');
      return;
    }
    
    if (!this.activeSchema) {
      this.showMessage('Please select a schema first!', 'error');
      return;
    }
    
    const input = this.findInput();
    if (!input) {
      this.showMessage('Could not find ChatGPT input field!', 'error');
      return;
    }
    
    const originalText = this.getText(input);
    console.log('ContextOS: Original text:', originalText);
    
    if (!originalText || !originalText.trim()) {
      this.showMessage('Please type a prompt first!', 'error');
      return;
    }
    
    const enhanced = this.buildEnhancedPrompt(originalText.trim());
    this.setText(input, enhanced);
    this.showMessage(`Schema "${this.activeSchema.name}" applied! ✨`, 'success');
    
    // Mark that schema has been successfully injected
    this.hasInjectedSchema = true;
    
    // Hide the button after successful injection
    this.hideButtonAfterInjection();
  }

  buildEnhancedPrompt(originalPrompt) {
    const schema = this.activeSchema;
    
    return `BUSINESS CONTEXT (Enhanced by ContextOS):

Company: ${schema.company.name} - ${schema.company.industry}
Brand Tone: ${schema.company.tone}
Core Values: ${schema.company.values.join(', ')}

TARGET PERSONA: ${schema.personas[0].name}
- Key Traits: ${schema.personas[0].traits.join(', ')}
- Pain Points: ${schema.personas[0].painPoints.join(', ')}
- Preferred Channels: ${schema.personas[0].channels.join(', ')}

CURRENT OBJECTIVES:
- ${schema.objectives[0].description}
- Key Metrics: ${schema.objectives[0].kpis.join(', ')}

BRAND GUIDELINES:
${schema.rules.map(rule => `- ${rule}`).join('\n')}

USER REQUEST: ${originalPrompt}

Please respond according to the business context above, ensuring the output matches our brand tone, addresses our target persona's needs, and supports our current objectives.`;
  }

  showMessage(text, type = 'info') {
    // Remove existing messages
    const existing = document.querySelectorAll('[id^="sf-message"]');
    existing.forEach(el => el.remove());
    
    const message = document.createElement('div');
    message.id = 'sf-message-' + Date.now();
    message.textContent = text;
    message.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: ${type === 'error' ? '#ef4444' : '#10b981'};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      z-index: 10002;
      font-family: system-ui;
      font-weight: 500;
      box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    `;
    
    document.body.appendChild(message);
    
    setTimeout(() => {
      if (message.parentNode) {
        message.remove();
      }
    }, 3000);
  }

  // Settings button functions
  createSettingsButtonWithRetry(attempts = 0) {
    const maxAttempts = 3;
    const delay = 1000;
    
    try {
      this.createSettingsButton();
      const button = document.getElementById('sf-settings-btn');
      
      if (!button) {
        console.log(`ContextOS: Settings button not found after creation attempt ${attempts + 1}`);
        if (attempts < maxAttempts) {
          console.log(`ContextOS: Retrying settings button creation in ${delay}ms...`);
          setTimeout(() => this.createSettingsButtonWithRetry(attempts + 1), delay);
        }
      } else {
        console.log('ContextOS: Settings button created successfully');
      }
    } catch (error) {
      console.log('ContextOS: Error creating settings button:', error);
      if (attempts < maxAttempts) {
        setTimeout(() => this.createSettingsButtonWithRetry(attempts + 1), delay);
      }
    }
  }

  createSettingsButton() {
    console.log('ContextOS: createSettingsButton called');
    
    // Remove existing
    const existing = document.getElementById('sf-settings-btn');
    if (existing) {
      console.log('ContextOS: Removing existing settings button');
      existing.remove();
    }

    const button = document.createElement('button');
    button.id = 'sf-settings-btn';
    button.innerHTML = '⚙️'; // Settings gear icon
    button.title = this.dialogVisible ? 'Hide Settings' : 'Show Settings';
    
    // Get native button styling reference
    const nativeButton = this.findNativeButton();
    const baseButtonStyle = this.getNativeButtonStyle(nativeButton);
    
    // Position button at bottom right, to the left of enhance button
    this.positionSettingsButton(button, baseButtonStyle);
    
    button.onclick = () => this.toggleDialog();
    
    console.log('ContextOS: Settings button created and appended. Element:', button);
  }

  positionSettingsButton(button, baseButtonStyle) {
    const hideInitially = !this.buttonHasBeenShown;
    
    button.style.cssText = `
      position: fixed !important;
      bottom: 30px !important;
      right: 30px !important;
      background: ${this.dialogVisible ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #6b7280, #4b5563)'} !important;
      color: white !important;
      border: none !important;
      padding: ${this.extendButtonPadding(baseButtonStyle.padding)} !important;
      border-radius: 50% !important;
      font-family: ${baseButtonStyle.fontFamily} !important;
      font-size: ${baseButtonStyle.fontSize} !important;
      font-weight: ${baseButtonStyle.fontWeight} !important;
      font-style: ${baseButtonStyle.fontStyle} !important;
      line-height: ${baseButtonStyle.lineHeight} !important;
      letter-spacing: ${baseButtonStyle.letterSpacing} !important;
      text-transform: ${baseButtonStyle.textTransform} !important;
      cursor: pointer !important;
      z-index: 10001 !important;
      height: ${baseButtonStyle.height} !important;
      min-height: ${baseButtonStyle.minHeight} !important;
      width: ${baseButtonStyle.height} !important;
      box-shadow: 0 4px 20px rgba(59, 130, 246, 0.4) !important;
      transition: all 0.3s ease !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      transform: scale(1) !important;
      ${hideInitially ? 'opacity: 0 !important; visibility: hidden !important;' : 'opacity: 1 !important; visibility: visible !important;'}
    `;
    
    // Add hover effect
    button.addEventListener('mouseenter', () => {
      button.style.transform = 'scale(1.05) !important';
      button.style.boxShadow = '0 6px 25px rgba(59, 130, 246, 0.5) !important';
    });
    
    button.addEventListener('mouseleave', () => {
      button.style.transform = 'scale(1) !important';
      button.style.boxShadow = '0 4px 20px rgba(59, 130, 246, 0.4) !important';
    });
    
    document.body.appendChild(button);
    if (hideInitially) {
      this.showButtonAfterPositioning(button);
    }
  }

  toggleDialog() {
    console.log('ContextOS: Settings button clicked, toggling dialog visibility');
    this.dialogVisible = !this.dialogVisible;
    
    // Update the widget
    this.updateWidget();
    
    // Update settings button appearance and tooltip
    const settingsButton = document.getElementById('sf-settings-btn');
    if (settingsButton) {
      settingsButton.style.background = this.dialogVisible ? 
        'linear-gradient(135deg, #10b981, #059669) !important' : 
        'linear-gradient(135deg, #6b7280, #4b5563) !important';
      settingsButton.title = this.dialogVisible ? 'Hide Settings Dialog' : 'Show Settings Dialog';
      
      // Add a subtle animation to indicate state change
      settingsButton.style.transform = 'scale(1.1) !important';
      setTimeout(() => {
        settingsButton.style.transform = 'scale(1) !important';
      }, 200);
    }
    
    console.log('ContextOS: Dialog visibility toggled to:', this.dialogVisible);
  }
}

// Message listener for popup communication
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const sf = window.schemaForge;
  
  if (request.action === 'toggleWidget') {
    if (sf) {
      sf.toggleDialog();
      sendResponse({ dialogVisible: sf.dialogVisible });
    }
  }
  
  return true; // Keep message channel open for async response
  });
}

// Initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.schemaForge = new SchemaForge();
  });
} else {
  // If chrome.runtime is not available (e.g., in testing), just create the instance
  window.schemaForge = new SchemaForge();
}

// Debug function
window.debugContextOS = function() {
  console.log('=== ContextOS Debug ===');
  const sf = window.schemaForge;
  if (sf) {
    console.log('Extension loaded:', true);
    console.log('Active:', sf.isActive);
    console.log('Schema:', sf.activeSchema.name);
    console.log('Input found:', !!sf.findInput());
    const input = sf.findInput();
    if (input) {
      console.log('Input text:', sf.getText(input));
    }
  } else {
    console.log('Extension not loaded');
  }
  console.log('========================');
};
