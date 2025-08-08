// Simple Working SchemaForge Chrome Extension
// Replace your entire content.js with this clean version

console.log('Context4U: Loading extension...');

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
    this.selectedSchemasByCategory = { business: null, role: null, project: null };
    this.enabledCategories = { business: true, role: true, project: true };
    // NEW: enhancement information UI state
    this.infoViewMode = 'list';
    this.infoCollapsed = true;
    
    this.init();

    // Load stored category toggles if present
    chrome.storage.local.get(['enabledCategories']).then((res) => {
      if (res && res.enabledCategories) {
        this.enabledCategories = Object.assign({ business: true, role: true, project: true }, res.enabledCategories);
        this.updateWidget();
      }
    }).catch(() => {});

  }

  async loadApiKey() {
    try {
      const result = await chrome.storage.local.get(['apiKey']);
      this.apiKey = result.apiKey || null;
      return this.apiKey;
    } catch (error) {
                console.error('Contextable: Failed to load API key:', error);
      return null;
    }
  }

  async init() {
          console.log('Context4U: Initializing...');
    this.createWidget();
    
    // Load API key first
    await this.loadApiKey();
    
    // Load schemas from API only if we have an API key
    if (this.apiKey) {
                console.log('Contextable: API key found, loading schemas...');
      try {
        const result = await this.loadSchemasFromAPI();
        if (result.success) {
                      console.log(`Contextable: Successfully loaded ${result.schemaCount} schemas and ready for use`);
          // Show the Schemas tab since we have a valid API and loaded schemas
          this.currentWidgetPage = 'schemas';
          this.updateWidget();
          // Show a brief success message
          setTimeout(() => {
            this.showMessage(`Context4U ready! ${result.schemaCount} schema${result.schemaCount !== 1 ? 's' : ''} loaded.`, 'success');
          }, 1000);
        }
      } catch (error) {
                  console.error('Contextable: Failed to load schemas during initialization:', error);
        this.isLoadingSchemas = false;
        this.updateWidget();
      }
    } else {
              console.log('Contextable: No API key found, please configure in settings');
      this.isLoadingSchemas = false;
      this.updateWidget();
      // Show a message to guide user to configure API key
      setTimeout(() => {
                    this.showMessage('Please configure your API key', 'info');
      }, 2000);
    }
    
    // Set up mutation observer to recreate button when DOM changes
    this.setupMutationObserver();
    
    // Create settings button
    this.createSettingsButtonWithRetry();
    
    // Additional positioning check after page fully loads
    if (document.readyState !== 'complete') {
      window.addEventListener('load', () => {
        setTimeout(() => {
          console.log('Contextable: Page fully loaded, verifying button positions');
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
      console.log('Contextable: Loading schemas from API...');
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
        const schemas = data.schemas.map(schema => {
          const rawType = schema.type || '';
          const category = this.categorizeSchemaType(rawType);
          return {
            id: schema.id,
            name: schema.name,
            typeRaw: rawType,
            schemaTypeCategory: category,
            // NEW: retain full raw schema JSON for info rendering
            raw: schema,
            company: {
              name: schema.companyName || 'Unknown Company',
              industry: rawType || 'Unknown Industry',
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
          };
        });

        // Ensure activeSchema aligns with current categories if previously selected one disappears
        if (this.activeSchema && !schemas.find(s => s.id === this.activeSchema.id)) {
          this.activeSchema = schemas[0] || null;
        }
        
        // If this is not a test, update the instance
        if (!testApiKey) {
          this.schemas = schemas;
          this.activeSchema = this.schemas.length > 0 ? this.schemas[0] : null;
          // Initialize per-category selected schema defaults
          const firstBusiness = this.schemas.find(s => s.schemaTypeCategory === 'Business');
          const firstRole = this.schemas.find(s => s.schemaTypeCategory === 'Role-specific');
          const firstProject = this.schemas.find(s => s.schemaTypeCategory === 'Project-specific');
          this.selectedSchemasByCategory = {
            business: firstBusiness ? firstBusiness.id : null,
            role: firstRole ? firstRole.id : null,
            project: firstProject ? firstProject.id : null
          };
          console.log('Contextable: Loaded', this.schemas.length, 'schemas from API');
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
              console.error('Contextable: Failed to load schemas from API:', error);
      
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

  categorizeSchemaType(rawType) {
    const normalized = String(rawType || '').trim().toLowerCase();
    if (!normalized) return 'Business';

    // Map common variants
    const isBusiness = ['business', 'org', 'organization', 'company', 'brand'].includes(normalized);
    if (isBusiness) return 'Business';

    const isRole = ['role-specific', 'role', 'persona', 'function'].includes(normalized);
    if (isRole) return 'Role-specific';

    const isProject = ['project-specific', 'project', 'job-specific', 'job', 'campaign', 'initiative'].includes(normalized);
    if (isProject) return 'Project-specific';

    // Fallback: heuristic keywords
    if (normalized.includes('role')) return 'Role-specific';
    if (normalized.includes('project') || normalized.includes('job')) return 'Project-specific';

    return 'Business';
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
              console.log('Contextable: Enhance button removed by DOM change, will recreate');
              shouldRecreateEnhanceButton = true;
            }
            if (node.id === 'sf-settings-btn' || 
                (node.nodeType === Node.ELEMENT_NODE && node.querySelector('#sf-settings-btn'))) {
              console.log('Contextable: Settings button removed by DOM change, will recreate');
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
                      console.log('Contextable: Recreating buttons due to DOM changes');
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
    
            console.log('Contextable: Mutation observer set up');
  }

  createEnhanceButtonWithRetry(attempts = 0) {
    const maxAttempts = 8; // Increased attempts for better reliability
    const delay = attempts < 3 ? 500 : 1000; // Shorter delay for first attempts
    
            console.log('Contextable: Attempting to create button, attempt:', attempts + 1);
    this.createEnhanceButton();
    
                // Check if button was successfully created and properly positioned
      setTimeout(() => {
        const button = document.getElementById('sf-enhance-btn');
        const buttonContainer = this.findButtonContainer();
        const searchButton = buttonContainer ? this.findSearchButton(buttonContainer) : null;
        
        // Don't retry if schema has already been injected
        if (this.hasInjectedSchema) {
          console.log('Contextable: Stopping retry - schema already injected');
          return;
        }

        if (!button && attempts < maxAttempts) {
          console.log('Contextable: Button not found, retrying...');
          this.createEnhanceButtonWithRetry(attempts + 1);
        } else if (button && !searchButton && attempts < maxAttempts) {
          console.log('Contextable: Button created but search button not found, retrying...');
          button.remove(); // Remove and retry for better positioning
          this.createEnhanceButtonWithRetry(attempts + 1);
        } else if (button) {
          console.log('Contextable: Button successfully created and positioned');
          // Verify positioning is correct
          this.verifyButtonPosition(button);
        } else {
          console.log('Contextable: Failed to create button after', maxAttempts, 'attempts');
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
    
            // Default to "Contextable" for initial load and before user selects a schema
        return '✨ Enhance with Context4U ';
  }

  hideButtonAfterInjection() {
    const button = document.getElementById('sf-enhance-btn');
    if (button) {
      console.log('Contextable: Hiding button after successful schema injection');
      
      // Add fade-out animation
      button.style.transition = 'all 0.3s ease';
      button.style.opacity = '0';
      button.style.transform = button.style.transform ? 
        button.style.transform.replace('scale(1)', 'scale(0.9)') : 'scale(0.9)';
      
      // Remove button from DOM after animation
      setTimeout(() => {
        if (button && button.parentNode) {
          button.remove();
          console.log('Contextable: Button removed from DOM after injection');
        }
      }, 300); // Wait for fade-out animation to complete
    }
  }

  showButtonAfterPositioning(button) {
    // Wait a short moment to ensure positioning is complete, then show the button
    setTimeout(() => {
      if (button && button.parentNode) {
        console.log('Contextable: Showing button after positioning complete');
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
              console.log('Contextable: Button has zero dimensions, repositioning...');
      setTimeout(() => this.createEnhanceButtonWithRetry(), 1000);
    } else {
              console.log('Contextable: Button positioning verified - width:', rect.width, 'height:', rect.height);
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

    // Prepare categorized schema lists
    const businessSchemas = (this.schemas || []).filter(s => s.schemaTypeCategory === 'Business');
    const roleSchemas = (this.schemas || []).filter(s => s.schemaTypeCategory === 'Role-specific');
    const projectSchemas = (this.schemas || []).filter(s => s.schemaTypeCategory === 'Project-specific');

    const widget = document.createElement('div');
    widget.id = 'sf-widget';
    widget.innerHTML = `
      <div style="background: white; border: 2px solid #3b82f6; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; width: 100%;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0; font-size: 18px; font-weight: 600;">Context4U</h1>
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
              <div style="display: ${businessSchemas.length ? 'flex' : 'none'}; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                <label style="font-weight: 500; color: #374151;">Business Schemas:</label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #374151;">
                  <span>Include</span>
                  <input type="checkbox" id="sf-cat-toggle-business" ${this.enabledCategories && this.enabledCategories.business ? 'checked' : ''} />
                </label>
              </div>
              <select id="sf-schema-select-business" style="display: ${businessSchemas.length ? 'block' : 'none'}; width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; background: white; font-size: 14px; margin-bottom: 12px;" ${this.isLoadingSchemas || !this.apiKey || (this.enabledCategories && !this.enabledCategories.business) ? 'disabled' : ''}>
                ${!this.apiKey ? 
                  '<option value="">Please configure API key first</option>' :
                  this.isLoadingSchemas ? 
                  '<option value="">Loading schemas...</option>' : 
                  businessSchemas.length > 0 ?
                  businessSchemas.map(s => `<option value="${s.id}" ${this.selectedSchemasByCategory && this.selectedSchemasByCategory.business === s.id ? 'selected' : ''}>${s.name}</option>`).join('') :
                  ''
                }
              </select>

              <div style="display: ${roleSchemas.length ? 'flex' : 'none'}; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                <label style="font-weight: 500; color: #374151;">Role-specific Schemas:</label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #374151;">
                  <span>Include</span>
                  <input type="checkbox" id="sf-cat-toggle-role" ${this.enabledCategories && this.enabledCategories.role ? 'checked' : ''} />
                </label>
              </div>
              <select id="sf-schema-select-role" style="display: ${roleSchemas.length ? 'block' : 'none'}; width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; background: white; font-size: 14px; margin-bottom: 12px;" ${this.isLoadingSchemas || !this.apiKey || (this.enabledCategories && !this.enabledCategories.role) ? 'disabled' : ''}>
                ${!this.apiKey ? 
                  '<option value="">Please configure API key first</option>' :
                  this.isLoadingSchemas ? 
                  '<option value="">Loading schemas...</option>' : 
                  roleSchemas.length > 0 ? 
                  roleSchemas.map(s => `<option value="${s.id}" ${this.selectedSchemasByCategory && this.selectedSchemasByCategory.role === s.id ? 'selected' : ''}>${s.name}</option>`).join('') :
                  ''
                }
              </select>

              <div style="display: ${projectSchemas.length ? 'flex' : 'none'}; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                <label style="font-weight: 500; color: #374151;">Project-specific Schemas:</label>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: #374151;">
                  <span>Include</span>
                  <input type="checkbox" id="sf-cat-toggle-project" ${this.enabledCategories && this.enabledCategories.project ? 'checked' : ''} />
                </label>
              </div>
              <!-- REPLACED: Project-specific dropdown with Enhancement information panel -->
              <div id="sf-enhancement-info" style="background: #f9fafb; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px;">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <h4 style="margin: 0; color: #1f2937;">Enhancement information</h4>
                    <button id="sf-info-collapse" style="background: transparent; border: none; color: #3b82f6; cursor: pointer; padding: 4px 8px; display:flex; align-items:center; gap:6px;" aria-label="Toggle details">
                      <span style="display:inline-block; transition: transform 0.2s; transform: rotate(${this.infoCollapsed ? '0deg' : '180deg'});">▼</span>
                    </button>
                  </div>
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="font-size: 12px; color: #374151;">View:</span>
                    <button id="sf-info-view-list" style="border: 1px solid ${this.infoViewMode === 'list' ? '#3b82f6' : '#d1d5db'}; background: ${this.infoViewMode === 'list' ? '#e0ecff' : 'white'}; color: #1f2937; padding: 4px 8px; border-radius: 6px; cursor: pointer;">List</button>
                    <button id="sf-info-view-json" style="border: 1px solid ${this.infoViewMode === 'json' ? '#3b82f6' : '#d1d5db'}; background: ${this.infoViewMode === 'json' ? '#e0ecff' : 'white'}; color: #1f2937; padding: 4px 8px; border-radius: 6px; cursor: pointer;">JSON</button>
                  </div>
                </div>
                <div id="sf-info-content" style="margin-top: 10px; ${this.infoCollapsed ? 'max-height: 96px; overflow: hidden;' : 'max-height: 60vh; overflow: auto;'}">
                  ${this.renderEnhancementInfo()}
                </div>
              </div>
              
            </div>
          </div>
          
          <!-- User Page -->
          <div id="sf-user-page" class="sf-page" style="display: ${this.currentWidgetPage === 'user' ? 'block' : 'none'};">
            <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
              <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #374151;">API Configuration</h3>
              <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #374151;">API Key:</label>
                <div style="position: relative;">
                  <input type="password" id="sf-api-key-input" placeholder="Enter your API key..." value="${this.apiKey || ''}" style="width: 100%; padding: 8px; border: 1px solid ${this.apiKey && this.schemas.length > 0 ? '#10b981' : '#d1d5db'}; border-radius: 6px; font-size: 14px; box-sizing: border-box;">
                  ${this.apiKey && this.schemas.length > 0 ? '<div style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); color: #10b981; font-weight: bold;">✓</div>' : ''}
                </div>
                <div style="margin-top: 8px;">
                  <button id="sf-test-api-key" style="background: #10b981; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 500; opacity: ${this.getTestButtonDisabled() ? '0.7' : '1'};" ${this.getTestButtonDisabled() ? 'disabled' : ''}>
                    ${this.apiKey && this.schemas.length > 0 ? 'Retest Connection' : 'Test Connection'}
                  </button>
                </div>
                ${this.apiKey && this.schemas.length > 0 ? 
                  `<div style="margin-top: 8px; color: #10b981; font-size: 12px; font-weight: 500;">✅ ${this.schemas.length} schema${this.schemas.length !== 1 ? 's' : ''} loaded</div>` : 
                  ''
                }
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
      width: min(420px, 95vw);
      max-height: 90vh;
      overflow: auto;
      z-index: 10000;
    `;
    
    document.body.appendChild(widget);
    
    // Add event listeners
    this.setupWidgetEventListeners(widget);
    
    // Update test button state after widget is created
    setTimeout(() => {
      this.updateTestButtonState();
    }, 0);
  }

  getStatusText() {
    if (!this.apiKey) {
      return '⚠️ Please configure your API key in the User tab';
    } else if (this.isLoadingSchemas) {
      return '⏳ Loading schemas from API...';
    } else if (this.schemas.length === 0) {
      return '❌ No schemas available - check your API key';
    } else if (this.isActive && this.activeSchema) {
      return `✅ Active: "${this.activeSchema.name}" schema ready to enhance prompts`;
    } else if (this.isActive && this.schemas.length > 0) {
      return `⚡ Ready: ${this.schemas.length} schema${this.schemas.length !== 1 ? 's' : ''} available - select one above`;
    } else {
      return `💤 Inactive: ${this.schemas.length} schema${this.schemas.length !== 1 ? 's' : ''} loaded but enhancement is OFF`;
    }
  }

  getStatusColor() {
    if (this.isActive && this.activeSchema && this.apiKey) {
      return '#10b981';
    }
    return '#6b7280';
  }

  getTestButtonDisabled() {
    // Button is disabled only when we have a stored API key, schemas are loaded, 
    // and the current input value matches the stored API key
    const widget = document.getElementById('sf-widget');
    if (!widget) return false;
    
    const apiKeyInput = widget.querySelector('#sf-api-key-input');
    if (!apiKeyInput) return false;
    
    const currentInputValue = apiKeyInput.value.trim();
    
    // Enable if input is different from stored API key (new key entered)
    if (this.apiKey && currentInputValue !== this.apiKey) {
      return false;
    }
    
    // Disable if we have stored API key and schemas are loaded and input matches stored key
    return this.apiKey && this.schemas.length > 0 && currentInputValue === this.apiKey;
  }

  updateTestButtonState() {
    const widget = document.getElementById('sf-widget');
    if (!widget) return;
    
    const testButton = widget.querySelector('#sf-test-api-key');
    if (!testButton) return;
    
    const isDisabled = this.getTestButtonDisabled();
    testButton.disabled = isDisabled;
    testButton.style.opacity = isDisabled ? '0.7' : '1';
    testButton.style.cursor = isDisabled ? 'not-allowed' : 'pointer';
    
    // Update button text based on current state
    const hasApiKeyAndSchemas = this.apiKey && this.schemas.length > 0;
    testButton.textContent = hasApiKeyAndSchemas ? 'Retest Connection' : 'Test Connection';
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

    // Schema selection (three categorized dropdowns)
    const selectBusiness = widget.querySelector('#sf-schema-select-business');
    const selectRole = widget.querySelector('#sf-schema-select-role');
    const selectProject = widget.querySelector('#sf-schema-select-project');
    const onSelectChange = (e) => {
      const value = e.target.value;
      if (!value) return;
      let category = null;
      if (e.target.id === 'sf-schema-select-business') category = 'business';
      if (e.target.id === 'sf-schema-select-role') category = 'role';
      if (e.target.id === 'sf-schema-select-project') category = 'project';

      if (!this.selectedSchemasByCategory) {
        this.selectedSchemasByCategory = { business: null, role: null, project: null };
      }

      const selectedSchema = this.schemas.find(s => s.id === value);
      if (selectedSchema) {
        if (category) this.selectedSchemasByCategory[category] = selectedSchema.id;
        this.activeSchema = selectedSchema; // keep preview/button text meaningful
        this.userSelectedSchema = true;
        this.hasInjectedSchema = false;
        this.updateWidget();
        const existingButton = document.getElementById('sf-enhance-btn');
        if (existingButton) existingButton.textContent = this.getButtonText();
      }
    };
    if (selectBusiness && !this.isLoadingSchemas) selectBusiness.addEventListener('change', onSelectChange);
    if (selectRole && !this.isLoadingSchemas) selectRole.addEventListener('change', onSelectChange);
    // Note: project dropdown removed; no listener added for it

    const toggleBusiness = widget.querySelector('#sf-cat-toggle-business');
    const toggleRole = widget.querySelector('#sf-cat-toggle-role');
    const toggleProject = widget.querySelector('#sf-cat-toggle-project');
    const onCategoryToggle = (category, checked) => {
      if (!this.enabledCategories) this.enabledCategories = { business: true, role: true, project: true };
      this.enabledCategories[category] = checked;
      this.hasInjectedSchema = false;
      chrome.storage.local.set({ enabledCategories: this.enabledCategories });
      this.updateWidget();
    };
    if (toggleBusiness) toggleBusiness.addEventListener('change', (e) => onCategoryToggle('business', e.target.checked));
    if (toggleRole) toggleRole.addEventListener('change', (e) => onCategoryToggle('role', e.target.checked));
    if (toggleProject) toggleProject.addEventListener('change', (e) => onCategoryToggle('project', e.target.checked));

    // NEW: Enhancement info controls
    const viewListBtn = widget.querySelector('#sf-info-view-list');
    const viewJsonBtn = widget.querySelector('#sf-info-view-json');
    const collapseBtn = widget.querySelector('#sf-info-collapse');
    if (viewListBtn) viewListBtn.addEventListener('click', () => { this.infoViewMode = 'list'; this.updateWidget(); });
    if (viewJsonBtn) viewJsonBtn.addEventListener('click', () => { this.infoViewMode = 'json'; this.updateWidget(); });
    if (collapseBtn) collapseBtn.addEventListener('click', () => { this.infoCollapsed = !this.infoCollapsed; this.updateWidget(); });

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
      
      // Listen for input changes to enable/disable the test button
      apiKeyInput.addEventListener('input', () => {
        this.updateTestButtonState();
      });
    }
  }

  switchWidgetPage(page) {
          console.log('Contextable: Switching widget page to:', page);
    this.currentWidgetPage = page;
    this.updateWidget();
  }

  async saveApiKey(apiKey) {
    try {
      await chrome.storage.local.set({ apiKey: apiKey });
      this.apiKey = apiKey;
      
              console.log('Contextable: API key saved successfully to storage');
      
      // Load schemas after saving API key
      this.isLoadingSchemas = true;
      this.updateWidget();
      
      try {
        const result = await this.loadSchemasFromAPI();
        
        if (result.success) {
          this.updateWidget();
          
          // Create/update enhance button now that we have valid API and schemas
          this.createEnhanceButtonWithRetry();
          
          console.log(`Contextable: API key saved and ${result.schemaCount} schemas loaded successfully`);
          return { success: true, schemaCount: result.schemaCount };
        } else {
          throw new Error(result.error || 'Failed to load schemas');
        }
      } catch (error) {
                  console.error('Contextable: Failed to load schemas after saving API key:', error);
        this.showWidgetApiStatus('API key saved but failed to load schemas: ' + error.message, 'error');
        throw error;
      }
    } catch (error) {
              console.error('Contextable: Failed to save API key:', error);
      this.showWidgetApiStatus('Failed to save API key', 'error');
      throw error;
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
      const result = await this.loadSchemasFromAPI(testApiKey);
      
      if (result.success) {
        const schemaCount = result.schemaCount;
        this.showWidgetApiStatus(`✅ Connection successful! Found ${schemaCount} schema${schemaCount !== 1 ? 's' : ''} ready for use.`, 'success');
        
        // Auto-save the API key if test is successful
        await this.saveApiKey(testApiKey);
        
        // Automatically switch to schemas tab to show loaded schemas
        setTimeout(() => {
          this.switchWidgetPage('schemas');
          this.showWidgetApiStatus(`🎉 Schemas are now ready! Switch to the Schemas tab to select one.`, 'success');
        }, 2000);
        
        console.log(`Contextable: API key validated and ${schemaCount} schemas loaded successfully`);
      } else {
        throw new Error(result.error || 'Unknown error occurred');
      }
    } catch (error) {
              console.error('Contextable: Failed to test API key:', error);
      
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
    
          console.log('Contextable: Widget created');
  }

  updateWidget() {
    this.createWidget();
    this.createEnhanceButtonWithRetry(); // Refresh button visibility based on active state
    this.createSettingsButtonWithRetry(); // Refresh settings button
  }

  createEnhanceButton() {
          console.log('Contextable: createEnhanceButton called, isActive:', this.isActive);
    
    // Remove existing
    const existing = document.getElementById('sf-enhance-btn');
    if (existing) {
              console.log('Contextable: Removing existing button');
      existing.remove();
    }

    // Only show button when extension is active
    if (!this.isActive) {
              console.log('Contextable: Button hidden - extension inactive');
      return;
    }

    // Don't create button if schema has already been injected
    if (this.hasInjectedSchema) {
              console.log('Contextable: Button not created - schema already injected');
      return;
    }

    const button = document.createElement('button');
    button.id = 'sf-enhance-btn';
    button.textContent = this.getButtonText();
    
    // Get native button styling reference
    const nativeButton = this.findNativeButton();
            console.log('Contextable: Found native button:', nativeButton);
    const baseButtonStyle = this.getNativeButtonStyle(nativeButton);
          console.log('Contextable: Base button style:', baseButtonStyle);
    
        // Always position button at bottom right for better visibility
            console.log('Contextable: Positioning button at bottom right');
    this.positionButtonFallback(button, baseButtonStyle);
    
    button.onclick = () => this.enhancePrompt();
    
          console.log('Contextable: Button created and appended. Element:', button);
      console.log('Contextable: Button in DOM:', document.getElementById('sf-enhance-btn'));
  }

  insertButtonIntoContainer(button, container, baseButtonStyle) {
    // Determine native buttons bottom position before insertion
    const nativeButtonsBottom = this.determineNativeButtonsBottom(container);
          console.log('Contextable: Native buttons bottom for container insertion:', nativeButtonsBottom);
    
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
              console.log('Contextable: No native buttons found for bottom determination');
      return null;
    }
    
    // Get all button bottom positions
    const bottomPositions = buttons.map(btn => {
      const rect = btn.getBoundingClientRect();
              console.log('Contextable: Button bottom position:', btn, rect.bottom);
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
    
          console.log(`Contextable: Found ${alignedButtons.length} buttons aligned at bottom ${maxBottom}`);
    
    // Return the determined bottom position
    return maxBottom;
  }

  findSearchButton(container) {
          console.log('Contextable: Searching for search button...');
    
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
          console.log('Contextable: Found search button via selector:', selector, button);
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
                  console.log('Contextable: Found search button via text content:', button);
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
                  console.log('Contextable: Found search button via icon:', button);
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
          console.log('Contextable: Found search button globally:', button);
          return button;
        }
      }
    }
    
          console.log('Contextable: No search button found');
    return null;
  }

  findButtonContainer() {
          console.log('Contextable: Searching for button container...');
    
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
                  console.log('Contextable: Found send button:', sendButton);
        console.log('Contextable: Send button parent:', sendButton.parentElement);
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
          console.log('Contextable: Found buttons near textarea:', nearbyButtons);
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
                  console.log('Contextable: Found bottom button in form:', bottomButton);
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
                  console.log('Contextable: Found potential send button:', button);
        return button.parentElement;
      }
    }
    
          console.log('Contextable: No button container found');
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
          console.log('Contextable: Native button computed style:', {
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
          console.log('Contextable: Found input element:', selector);
          return element;
        }
      }
    }
    
          console.log('Contextable: No input found');
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
          console.log('Context4U: Enhance button clicked');
    
    if (!this.isActive) {
              this.showMessage('Please turn ON Context4U first!', 'error');
      return;
    }
    
    const input = this.findInput();
    if (!input) {
      this.showMessage('Could not find ChatGPT input field!', 'error');
      return;
    }
    
    const originalText = this.getText(input);
          console.log('Contextable: Original text:', originalText);
    
    if (!originalText || !originalText.trim()) {
      this.showMessage('Please type a prompt first!', 'error');
      return;
    }

    // Re-read current toggle and select states from the widget to ensure latest values
    const widget = document.getElementById('sf-widget');
    if (widget) {
      // Sync enabledCategories from checkbox toggles
      const nextEnabled = Object.assign({ business: true, role: true, project: true }, this.enabledCategories || {});
      const toggleBusinessEl = widget.querySelector('#sf-cat-toggle-business');
      const toggleRoleEl = widget.querySelector('#sf-cat-toggle-role');
      const toggleProjectEl = widget.querySelector('#sf-cat-toggle-project');
      if (toggleBusinessEl) nextEnabled.business = !!toggleBusinessEl.checked;
      if (toggleRoleEl) nextEnabled.role = !!toggleRoleEl.checked;
      if (toggleProjectEl) nextEnabled.project = !!toggleProjectEl.checked;
      const hasToggleChanges = JSON.stringify(nextEnabled) !== JSON.stringify(this.enabledCategories || {});
      if (hasToggleChanges) {
        this.enabledCategories = nextEnabled;
        try { chrome.storage.local.set({ enabledCategories: this.enabledCategories }); } catch (e) {}
        console.log('Contextable: Detected toggle changes on click, updated enabledCategories:', this.enabledCategories);
      }

      // Sync selectedSchemasByCategory from current selects
      const selectBusinessEl = widget.querySelector('#sf-schema-select-business');
      const selectRoleEl = widget.querySelector('#sf-schema-select-role');
      const selectProjectEl = widget.querySelector('#sf-schema-select-project');
      if (!this.selectedSchemasByCategory) this.selectedSchemasByCategory = { business: null, role: null, project: null };
      if (selectBusinessEl && selectBusinessEl.value) this.selectedSchemasByCategory.business = selectBusinessEl.value;
      if (selectRoleEl && selectRoleEl.value) this.selectedSchemasByCategory.role = selectRoleEl.value;
      if (selectProjectEl && selectProjectEl.value) this.selectedSchemasByCategory.project = selectProjectEl.value;
    }

    // Collect selected schemas from state, respecting per-category toggles
    const categories = ['business', 'role', 'project'];
    const selectedIds = categories
      .filter(cat => !this.enabledCategories || this.enabledCategories[cat])
      .map(cat => (this.selectedSchemasByCategory || {})[cat])
      .filter(Boolean);
    const selectedSchemas = selectedIds
      .map(id => this.schemas.find(s => s.id === id))
      .filter(Boolean);

    if (!selectedSchemas.length) {
      this.showMessage('Turn ON and select at least one schema.', 'error');
      return;
    }
    
    const enhanced = this.buildEnhancedPrompt(originalText.trim(), selectedSchemas);
    this.setText(input, enhanced);
    this.showMessage(`Applied ${selectedSchemas.length} schema${selectedSchemas.length !== 1 ? 's' : ''}! ✨`, 'success');
    
    // Mark that schema has been successfully injected
    this.hasInjectedSchema = true;
    
    // Hide the button after successful injection
    this.hideButtonAfterInjection();
  }

  buildEnhancedPrompt(originalPrompt, schemasArray) {
    const selected = Array.isArray(schemasArray) ? schemasArray : [];
    const enabled = Object.assign({ business: true, role: true, project: true }, this.enabledCategories || {});
    const businessSchema = enabled.business ? (selected.find(s => s.schemaTypeCategory === 'Business') || null) : null;
    const roleSchema = enabled.role ? (selected.find(s => s.schemaTypeCategory === 'Role-specific') || null) : null;
    const projectSchema = enabled.project ? (selected.find(s => s.schemaTypeCategory === 'Project-specific') || null) : null;

    const getCompanyBlock = (schema) => {
      if (!schema) return '';
      const company = schema.company || {};
      const personas = Array.isArray(schema.personas) && schema.personas.length ? schema.personas : [{ name: 'Stakeholder', traits: [], painPoints: [], channels: [] }];
      const objectives = Array.isArray(schema.objectives) && schema.objectives.length ? schema.objectives : [{ description: 'Achieve business objectives', kpis: [] }];
      const rules = Array.isArray(schema.rules) ? schema.rules : [];
      return (
        `Company: ${company.name || 'Unknown Company'} - ${company.industry || 'Unknown Industry'}\n` +
        `Brand Tone: ${company.tone || 'Professional'}\n` +
        `Core Values: ${(company.values || []).join(', ')}` +
        `\n\nTARGET PERSONA: ${personas[0].name}\n` +
        `- Key Traits: ${(personas[0].traits || []).join(', ')}\n` +
        `- Pain Points: ${(personas[0].painPoints || []).join(', ')}\n` +
        `- Preferred Channels: ${(personas[0].channels || []).join(', ')}` +
        `\n\nCURRENT OBJECTIVES:\n` +
        `- ${objectives[0].description}\n` +
        `- Key Metrics: ${(objectives[0].kpis || []).join(', ')}` +
        `\n\nBRAND GUIDELINES:\n` +
        `${rules.map(r => `- ${r}`).join('\n')}`
      );
    };

    const sections = [];

    // Business context: only include when business category is enabled and a Business schema is selected
    if (enabled.business && businessSchema) {
      sections.push(`BUSINESS CONTEXT (Enhanced by Context4U):\n\n${getCompanyBlock(businessSchema)}`);
    }

    // Role persona & voice
    if (enabled.role && roleSchema) {
      const roleName = roleSchema.name || (roleSchema.personas?.[0]?.name) || 'Role Specialist';
      const roleRules = Array.isArray(roleSchema.rules) ? roleSchema.rules : [];
      const roleObjectives = Array.isArray(roleSchema.objectives) && roleSchema.objectives.length ? roleSchema.objectives[0] : null;
      const objectiveLine = roleObjectives ? `Primary Focus: ${roleObjectives.description}. KPIs: ${(roleObjectives.kpis || []).join(', ')}.` : '';

      sections.push(
        [
          'ROLE PERSONA & VOICE:',
          `- Write the entire response from the perspective of the user's ${roleName}.`,
          "- Use first-person voice appropriate for the role (e.g., 'I' when personal, 'we/our' for company context).",
          '- Use domain-specific terminology and prioritization consistent with this role.',
          objectiveLine ? `- ${objectiveLine}` : null,
          ...(roleRules.length ? ['- Constraints & Preferences:', ...roleRules.map(r => `  - ${r}`)] : [])
        ].filter(Boolean).join('\n')
      );
    }

    // Project context
    if (enabled.project && projectSchema) {
      const companyName = (businessSchema?.company?.name) || (projectSchema.company?.name) || 'the user\'s company';
      const tone = (businessSchema?.company?.tone) || (projectSchema.company?.tone);
      const objective = Array.isArray(projectSchema.objectives) && projectSchema.objectives.length ? projectSchema.objectives[0] : null;
      const rules = Array.isArray(projectSchema.rules) ? projectSchema.rules : [];

      const lines = [];
      lines.push(`PROJECT CONTEXT: ${projectSchema.name || 'Current Initiative'}`);
      lines.push(`- Assume this is an initiative undertaken by ${companyName}.`);
      if (tone) lines.push(`- Maintain the brand tone: ${tone}.`);
      if (objective) lines.push(`- Project Objective: ${objective.description}. KPIs: ${(objective.kpis || []).join(', ')}.`);
      if (rules.length) {
        lines.push('- Project Constraints & Requirements:');
        rules.forEach(r => lines.push(`  - ${r}`));
      }

      sections.push(lines.join('\n'));
    }

    // Compose final prompt with clear directives
    const directives = [];
    if (enabled.role && roleSchema) directives.push('Adopt the role-first-person perspective and priorities above.');
    if (enabled.project && projectSchema) directives.push('Frame all recommendations within the project context for the user\'s company.');
    directives.push('Respect any brand tone, values, objectives and rules specified above.');

    const header = sections.join('\n\n---\n\n');
    return `${header}\n\nUSER REQUEST: ${originalPrompt}\n\nINSTRUCTIONS:\n- ${directives.join('\n- ')}`;
  }

  showMessage(text, type = 'info') {
    // Remove existing messages
    const existing = document.querySelectorAll('[id^="sf-message"]');
    existing.forEach(el => el.remove());
    
    const message = document.createElement('div');
    message.id = 'sf-message-' + Date.now();
    message.textContent = text;
    
    // Determine background color based on type
    let backgroundColor;
    switch (type) {
      case 'error':
        backgroundColor = '#ef4444';
        break;
      case 'success':
        backgroundColor = '#10b981';
        break;
      case 'info':
        backgroundColor = '#3b82f6';
        break;
      default:
        backgroundColor = '#6b7280';
    }
    
    message.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: ${backgroundColor};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      z-index: 10002;
      font-family: system-ui;
      font-weight: 500;
      box-shadow: 0 4px 15px rgba(0,0,0,0.2);
      max-width: 400px;
      text-align: center;
      line-height: 1.4;
    `;
    
    document.body.appendChild(message);
    
    // Auto-remove after appropriate duration based on message type
    const duration = type === 'info' ? 4000 : 3000;
    setTimeout(() => {
      if (message.parentNode) {
        message.style.opacity = '0';
        message.style.transform = 'translateX(-50%) translateY(-10px)';
        setTimeout(() => message.remove(), 300);
      }
    }, duration);
  }

  // Settings button functions
  createSettingsButtonWithRetry(attempts = 0) {
    const maxAttempts = 3;
    const delay = 1000;
    
    try {
      this.createSettingsButton();
      const button = document.getElementById('sf-settings-btn');
      
      if (!button) {
        console.log(`Contextable: Settings button not found after creation attempt ${attempts + 1}`);
        if (attempts < maxAttempts) {
          console.log(`Contextable: Retrying settings button creation in ${delay}ms...`);
          setTimeout(() => this.createSettingsButtonWithRetry(attempts + 1), delay);
        }
      } else {
        console.log('Contextable: Settings button created successfully');
      }
    } catch (error) {
              console.log('Contextable: Error creating settings button:', error);
      if (attempts < maxAttempts) {
        setTimeout(() => this.createSettingsButtonWithRetry(attempts + 1), delay);
      }
    }
  }

  createSettingsButton() {
          console.log('Contextable: createSettingsButton called');
    
    // Remove existing
    const existing = document.getElementById('sf-settings-btn');
    if (existing) {
              console.log('Contextable: Removing existing settings button');
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
    
          console.log('Contextable: Settings button created and appended. Element:', button);
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
          console.log('Contextable: Settings button clicked, toggling dialog visibility');
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
    
          console.log('Contextable: Dialog visibility toggled to:', this.dialogVisible);
  }

  // NEW: helpers to render enhancement information panel
  getSelectedSchemas() {
    const categories = ['business', 'role', 'project'];
    const enabled = Object.assign({ business: true, role: true, project: true }, this.enabledCategories || {});
    const selectedIds = (this.selectedSchemasByCategory || {});
    const result = [];
    for (const category of categories) {
      if (!enabled[category]) continue;
      const id = selectedIds[category];
      if (!id) continue;
      const found = (this.schemas || []).find(s => s.id === id);
      if (found) result.push(found);
    }
    return result;
  }

  renderEnhancementInfo() {
    if (!this.apiKey) {
      return '<div style="color:#6b7280; font-size:12px;">Please configure API key to load schemas.</div>';
    }
    if (this.isLoadingSchemas) {
      return '<div style="color:#6b7280; font-size:12px;">Loading schemas...</div>';
    }
    const selected = this.getSelectedSchemas();
    if (!selected.length) {
      return '<div style="color:#6b7280; font-size:12px;">No schemas selected. Choose at least one in Business/Role tabs.</div>';
    }
    return selected.map(schema => {
      const header = `<div style=\"font-weight:600; color:#111827; margin: 6px 0;\">${this.escapeHtml(schema.name || '(Untitled schema)')}</div>`;
      if (this.infoViewMode === 'json') {
        const json = this.escapeHtml(JSON.stringify(schema.raw || schema, null, 2));
        return `<div style=\"background:white; border:1px solid #e5e7eb; border-radius:6px; padding:8px; margin-bottom:10px;\">${header}<pre style=\"margin:0; font-size:12px; color:#111827; overflow:visible; max-height:none;\">${json}</pre></div>`;
      }
      // list view
      const list = this.renderKeyValueList(schema.raw || schema);
      return `<div style=\"background:white; border:1px solid #e5e7eb; border-radius:6px; padding:8px; margin-bottom:10px;\">${header}${list}</div>`;
    }).join('');
  }

  renderKeyValueList(obj) {
    try {
      const flatEntries = this.flattenObjectToEntries(obj || {}, '');
      if (!flatEntries.length) return '<div style="color:#6b7280; font-size:12px;">No fields</div>';
      const rows = flatEntries.map(({ key, value }) => {
        const isPrimitive = (value === null) || ['string','number','boolean'].includes(typeof value);
        const renderedValue = isPrimitive ? String(value) : JSON.stringify(value);
        return `<div style=\"display:flex; gap:8px; align-items:flex-start; padding:2px 0;\"><div style=\"min-width:140px; color:#374151; font-weight:500;\">${this.escapeHtml(key)}</div><div style=\"color:#111827;\">${this.escapeHtml(renderedValue)}</div></div>`;
      }).join('');
      return `<div style=\"font-size:12px;\">${rows}</div>`;
    } catch (e) {
      return '<div style="color:#ef4444; font-size:12px;">Failed to render fields</div>';
    }
  }

  flattenObjectToEntries(obj, parentKey) {
    const entries = [];
    const isArray = Array.isArray(obj);
    const keys = isArray ? Object.keys(obj) : Object.keys(obj);
    for (const k of keys) {
      const value = obj[k];
      const path = parentKey ? `${parentKey}.${k}` : `${k}`;
      if (value && typeof value === 'object' && !(value instanceof Date)) {
        entries.push(...this.flattenObjectToEntries(value, path));
      } else {
        entries.push({ key: path, value });
      }
    }
    return entries;
  }

  escapeHtml(unsafe) {
    const str = String(unsafe == null ? '' : unsafe);
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#039;');
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
  window.debugContextable = function() {
    console.log('=== Context4U Debug ===');
  const sf = window.schemaForge;
  if (sf) {
    console.log('Extension loaded:', true);
    console.log('Active:', sf.isActive);
    console.log('Schema:', sf.activeSchema ? sf.activeSchema.name : '(none)');
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
