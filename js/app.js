// Main App Logic
const APP_INSTALL_URL = 'https://github.com/apps/invoice-writer/installations/new';
const APP_INSTALL_STORAGE_KEY = 'github_app_installed';

const App = {
  issues: [],
  selectedIssues: new Set(),
  settings: {
    contractorCompany: '',
    contractorId: '',
    hourlyRate: 0,
    currency: 'USD',
    bankInfo: '',
    paymentMethod: 'Wire Transfer',
    lastClient: 'Studio Vibi INC'
  },

  // DOM Elements
  elements: {},

  // Initialize app
  async init() {
    this.cacheElements();
    this.loadSettings();
    this.bindEvents();

    if (GitHub.init()) {
      try {
        await this.showMainScreen();
      } catch (e) {
        console.error('Token invalid:', e);
        GitHub.logout();
        this.showLoginScreen();
      }
    } else {
      this.showLoginScreen();
    }
  },

  // Cache DOM elements
  cacheElements() {
    this.elements = {
      loginScreen: document.getElementById('login-screen'),
      mainScreen: document.getElementById('main-screen'),
      loginBtn: document.getElementById('login-btn'),
      patInput: document.getElementById('pat-input'),
      logoutBtn: document.getElementById('logout-btn'),
      userAvatar: document.getElementById('user-avatar'),
      userName: document.getElementById('user-name'),
      orgFilter: document.getElementById('org-filter'),
      periodFilter: document.getElementById('period-filter'),
      customPeriod: document.getElementById('custom-period'),
      dateFrom: document.getElementById('date-from'),
      dateTo: document.getElementById('date-to'),
      applyFilter: document.getElementById('apply-filter'),
      refreshBtn: document.getElementById('refresh-btn'),
      loading: document.getElementById('loading'),
      issuesList: document.getElementById('issues-list'),
      noIssues: document.getElementById('no-issues'),
      selectedCount: document.getElementById('selected-count'),
      totalHours: document.getElementById('total-hours'),
      totalAmount: document.getElementById('total-amount'),
      generateBtn: document.getElementById('generate-btn'),
      settingsBtn: document.getElementById('settings-btn'),
      settingsModal: document.getElementById('settings-modal'),
      historyBtn: document.getElementById('history-btn'),
      historyModal: document.getElementById('history-modal'),
      historyList: document.getElementById('history-list'),
      historyLoading: document.getElementById('history-loading'),
      noHistory: document.getElementById('no-history'),
      installAppBtn: document.getElementById('install-app-btn'),
      installAppModal: document.getElementById('install-app-modal'),
      installAppLink: document.getElementById('install-app-link'),
      appInstalledBtn: document.getElementById('app-installed-btn'),
      previewModal: document.getElementById('preview-modal'),
      yamlPreview: document.getElementById('yaml-preview'),
      clientCompany: document.getElementById('client-company'),
      saveSettings: document.getElementById('save-settings'),
      cancelInvoice: document.getElementById('cancel-invoice'),
      confirmInvoice: document.getElementById('confirm-invoice'),
      contractorCompany: document.getElementById('contractor-company'),
      contractorId: document.getElementById('contractor-id'),
      hourlyRate: document.getElementById('hourly-rate'),
      currency: document.getElementById('currency'),
      bankInfo: document.getElementById('bank-info'),
      paymentMethod: document.getElementById('payment-method'),
      toastContainer: document.getElementById('toast-container')
    };
  },

  // Bind events
  bindEvents() {
    // Login
    this.elements.loginBtn.addEventListener('click', () => this.login());
    this.elements.logoutBtn.addEventListener('click', () => this.logout());

    // Filters
    this.elements.periodFilter.addEventListener('change', () => this.onPeriodChange());
    this.elements.applyFilter.addEventListener('click', () => this.loadIssues());
    this.elements.refreshBtn.addEventListener('click', () => this.loadIssues());
    this.elements.orgFilter.addEventListener('change', () => this.loadIssues());

    // Generate Invoice
    this.elements.generateBtn.addEventListener('click', () => this.showPreview());

    // Settings
    this.elements.settingsBtn.addEventListener('click', () => this.showSettings());
    this.elements.saveSettings.addEventListener('click', () => this.saveSettings());

    // Install App
    if (this.elements.installAppBtn) {
      this.elements.installAppBtn.addEventListener('click', () => this.showInstallAppModal());
    }
    if (this.elements.installAppLink) {
      this.elements.installAppLink.addEventListener('click', () => {
        this.hideModal(this.elements.installAppModal);
      });
    }
    if (this.elements.appInstalledBtn) {
      this.elements.appInstalledBtn.addEventListener('click', () => this.confirmAppInstalled());
    }

    // History
    this.elements.historyBtn.addEventListener('click', () => this.showHistory());

    // Preview Modal
    this.elements.cancelInvoice.addEventListener('click', () => this.hideModal(this.elements.previewModal));
    this.elements.confirmInvoice.addEventListener('click', () => this.submitInvoice());
    this.elements.clientCompany.addEventListener('change', () => this.updatePreview());

    // Modal close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal');
        this.hideModal(modal);
      });
    });

    // Close modal on backdrop click
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.hideModal(modal);
        }
      });
    });
  },

  // Load settings from localStorage
  loadSettings() {
    const saved = localStorage.getItem('invoice_settings');
    if (saved) {
      this.settings = { ...this.settings, ...JSON.parse(saved) };
    }
  },

  // Save settings to localStorage
  saveSettingsToStorage() {
    localStorage.setItem('invoice_settings', JSON.stringify(this.settings));
  },

  // Show toast notification
  toast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    this.elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 4000);
  },

  // Show login screen
  showLoginScreen() {
    this.elements.loginScreen.classList.remove('hidden');
    this.elements.mainScreen.classList.add('hidden');
  },

  // Show main screen
  async showMainScreen() {
    const user = await GitHub.getUser();

    this.elements.userAvatar.src = user.avatar_url;
    this.elements.userName.textContent = user.login;

    this.elements.loginScreen.classList.add('hidden');
    this.elements.mainScreen.classList.remove('hidden');

    await this.loadIssues();
  },

  // Login with Personal Access Token
  async login() {
    const token = this.elements.patInput.value.trim();

    if (!token) {
      this.toast('Cole o token no campo acima', 'error');
      return;
    }

    if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
      this.toast('Token inválido. Deve começar com ghp_ ou github_pat_', 'error');
      return;
    }

    try {
      this.elements.loginBtn.disabled = true;
      this.elements.loginBtn.textContent = 'Validando...';

      // Validate token
      await GitHub.validateToken(token);

      // Save token
      GitHub.setToken(token);

      this.toast('Login realizado com sucesso!', 'success');
      await this.showMainScreen();

    } catch (e) {
      console.error('Login error:', e);
      this.toast(e.message || 'Token inválido', 'error');
    } finally {
      this.elements.loginBtn.disabled = false;
      this.elements.loginBtn.innerHTML = `
        <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
        Entrar
      `;
    }
  },

  // Logout
  logout() {
    GitHub.logout();
    this.issues = [];
    this.selectedIssues.clear();
    this.showLoginScreen();
  },

  // Period filter change
  onPeriodChange() {
    const value = this.elements.periodFilter.value;
    if (value === 'custom') {
      this.elements.customPeriod.classList.remove('hidden');
    } else {
      this.elements.customPeriod.classList.add('hidden');
      this.loadIssues();
    }
  },

  // Load issues
  async loadIssues() {
    this.elements.loading.classList.remove('hidden');
    this.elements.issuesList.innerHTML = '';
    this.elements.noIssues.classList.add('hidden');

    try {
      const org = this.elements.orgFilter.value;
      let days = parseInt(this.elements.periodFilter.value);

      if (this.elements.periodFilter.value === 'custom') {
        const from = new Date(this.elements.dateFrom.value);
        const to = new Date(this.elements.dateTo.value);
        days = Math.ceil((to - from) / (1000 * 60 * 60 * 24));
      }

      this.issues = await GitHub.getClosedIssues(org, days);
      this.selectedIssues.clear();

      if (this.issues.length === 0) {
        this.elements.noIssues.classList.remove('hidden');
      } else {
        this.renderIssues();
      }

    } catch (e) {
      console.error('Error loading issues:', e);
      this.toast('Erro ao carregar issues: ' + e.message, 'error');
    } finally {
      this.elements.loading.classList.add('hidden');
    }
  },

  // Render issues list
  renderIssues() {
    this.elements.issuesList.innerHTML = this.issues.map(issue => `
      <div class="issue-item" data-id="${issue.id}">
        <div class="issue-checkbox"></div>
        <div class="issue-content">
          <div class="issue-title">#${issue.number} - ${this.escapeHtml(issue.title)}</div>
          <div class="issue-meta">
            <span class="issue-org">${issue.org}</span>
            <span class="issue-repo">${issue.repo}</span>
            <span class="issue-date">${this.formatIssueDate(issue)}</span>
          </div>
        </div>
        <div class="issue-hours ${issue.hours ? '' : 'no-hours'}">
          ${issue.hours ? issue.hours + 'h' : 'Sem horas'}
        </div>
      </div>
    `).join('');

    // Bind click events
    this.elements.issuesList.querySelectorAll('.issue-item').forEach(el => {
      el.addEventListener('click', () => this.toggleIssue(el));
    });

    this.updateTotals();
  },

  // Toggle issue selection
  toggleIssue(el) {
    const id = parseInt(el.dataset.id);
    const issue = this.issues.find(i => i.id === id);

    if (!issue) return;

    if (this.selectedIssues.has(id)) {
      this.selectedIssues.delete(id);
      el.classList.remove('selected');
    } else {
      // Warn if no hours
      if (!issue.hours) {
        this.toast('Atenção: Esta issue não tem horas definidas', 'info');
      }
      this.selectedIssues.add(id);
      el.classList.add('selected');
    }

    this.updateTotals();
  },

  // Update totals in footer
  updateTotals() {
    const selected = this.issues.filter(i => this.selectedIssues.has(i.id));
    const totalHours = selected.reduce((sum, i) => sum + (i.hours || 0), 0);
    const totalAmount = totalHours * this.settings.hourlyRate;

    this.elements.selectedCount.textContent = selected.length;
    this.elements.totalHours.textContent = totalHours;
    this.elements.totalAmount.textContent = this.formatCurrency(totalAmount);

    this.elements.generateBtn.disabled = selected.length === 0;
  },

  // Format currency
  formatCurrency(amount) {
    const symbol = this.settings.currency === 'USD' ? '$' : 'R$';
    return `${symbol}${amount.toFixed(2)}`;
  },

  // Format issue date with fallbacks
  formatIssueDate(issue) {
    const dateValue = issue.closedAt || issue.updatedAt || issue.createdAt;
    if (!dateValue) return 'Sem data';

    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return 'Sem data';
    return date.toLocaleDateString();
  },

  // Escape HTML
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  // Show settings modal
  showSettings() {
    this.elements.contractorCompany.value = this.settings.contractorCompany;
    this.elements.contractorId.value = this.settings.contractorId;
    this.elements.hourlyRate.value = this.settings.hourlyRate || '';
    this.elements.currency.value = this.settings.currency;
    this.elements.bankInfo.value = this.settings.bankInfo;
    this.elements.paymentMethod.value = this.settings.paymentMethod;

    this.elements.settingsModal.classList.remove('hidden');
  },

  // Save settings
  saveSettings() {
    this.settings.contractorCompany = this.elements.contractorCompany.value;
    this.settings.contractorId = this.elements.contractorId.value;
    this.settings.hourlyRate = parseFloat(this.elements.hourlyRate.value) || 0;
    this.settings.currency = this.elements.currency.value;
    this.settings.bankInfo = this.elements.bankInfo.value;
    this.settings.paymentMethod = this.elements.paymentMethod.value;

    this.saveSettingsToStorage();
    this.updateTotals();
    this.hideModal(this.elements.settingsModal);
    this.toast('Configurações salvas!', 'success');
  },

  // Show preview modal
  showPreview() {
    // Validate settings
    if (!this.settings.contractorCompany) {
      this.toast('Configure o nome da sua empresa primeiro', 'error');
      this.showSettings();
      return;
    }

    if (!this.settings.hourlyRate) {
      this.toast('Configure o valor por hora primeiro', 'error');
      this.showSettings();
      return;
    }

    if (!this.settings.bankInfo) {
      this.toast('Configure as informações bancárias primeiro', 'error');
      this.showSettings();
      return;
    }

    // Check for issues without hours
    const selected = this.issues.filter(i => this.selectedIssues.has(i.id));
    const noHours = selected.filter(i => !i.hours);

    if (noHours.length > 0) {
      const confirm = window.confirm(
        `${noHours.length} issue(s) não tem horas definidas e serão contadas como 0h. Continuar?`
      );
      if (!confirm) return;
    }

    this.elements.clientCompany.value = this.settings.lastClient;
    this.updatePreview();
    this.elements.previewModal.classList.remove('hidden');
  },

  // Update YAML preview
  async updatePreview() {
    const user = await GitHub.getUser();
    const selected = this.issues.filter(i => this.selectedIssues.has(i.id));
    const totalHours = selected.reduce((sum, i) => sum + (i.hours || 0), 0);

    const yaml = Invoice.generateYAML({
      username: user.login,
      contractorCompany: this.settings.contractorCompany,
      contractorId: this.settings.contractorId,
      bankInfo: this.settings.bankInfo,
      clientCompany: this.elements.clientCompany.value,
      issues: selected,
      totalHours,
      hourlyRate: this.settings.hourlyRate,
      currency: this.settings.currency,
      paymentMethod: this.settings.paymentMethod
    });

    this.elements.yamlPreview.textContent = yaml;
  },

  // Submit invoice
  async submitInvoice() {
    this.elements.confirmInvoice.disabled = true;
    this.elements.confirmInvoice.textContent = 'Enviando...';

    try {
      const user = await GitHub.getUser();
      const yaml = this.elements.yamlPreview.textContent;
      const filename = Invoice.generateFilename(user.login);

      // Save last client choice
      this.settings.lastClient = this.elements.clientCompany.value;
      this.saveSettingsToStorage();

      // Upload to GitHub
      const { url } = await GitHub.uploadInvoice(filename, yaml);

      this.hideModal(this.elements.previewModal);
      this.toast('Invoice criado com sucesso!', 'success');

      // Clear selection
      this.selectedIssues.clear();
      this.elements.issuesList.querySelectorAll('.issue-item.selected').forEach(el => {
        el.classList.remove('selected');
      });
      this.updateTotals();

      // Open the invoice in a new tab
      window.open(url, '_blank');
      this.maybePromptInstallApp();

    } catch (e) {
      console.error('Error submitting invoice:', e);
      this.toast('Erro ao enviar invoice: ' + e.message, 'error');
    } finally {
      this.elements.confirmInvoice.disabled = false;
      this.elements.confirmInvoice.textContent = 'Confirmar e Enviar';
    }
  },

  // Show history modal
  async showHistory() {
    this.elements.historyModal.classList.remove('hidden');
    this.elements.historyLoading.classList.remove('hidden');
    this.elements.historyList.innerHTML = '';
    this.elements.noHistory.classList.add('hidden');

    try {
      const invoices = await GitHub.getInvoiceHistory();

      if (invoices.length === 0) {
        this.elements.noHistory.classList.remove('hidden');
      } else {
        // Fetch and parse each invoice
        const parsed = await Promise.all(invoices.map(async (inv) => {
          try {
            const response = await fetch(inv.downloadUrl);
            const content = await response.text();
            const summary = Invoice.parseInvoiceSummary(inv.name, content);
            return { ...inv, ...summary };
          } catch (e) {
            return { ...inv, date: inv.name.split('.')[0], amount: 0, client: 'Unknown', hours: 0 };
          }
        }));

        this.elements.historyList.innerHTML = parsed.map(inv => `
          <a href="${inv.url}" target="_blank" class="history-item">
            <div class="history-item-info">
              <h4>${inv.name}</h4>
              <p>${inv.client} - ${inv.hours}h</p>
            </div>
            <div class="history-item-amount">
              ${this.formatCurrency(inv.amount)}
            </div>
          </a>
        `).join('');
      }

    } catch (e) {
      console.error('Error loading history:', e);
      this.toast('Erro ao carregar histórico: ' + e.message, 'error');
    } finally {
      this.elements.historyLoading.classList.add('hidden');
    }
  },

  // Hide modal
  hideModal(modal) {
    modal.classList.add('hidden');
  },

  // App install helpers
  isAppInstallConfirmed() {
    return localStorage.getItem(APP_INSTALL_STORAGE_KEY) === 'true';
  },

  confirmAppInstalled() {
    localStorage.setItem(APP_INSTALL_STORAGE_KEY, 'true');
    this.hideModal(this.elements.installAppModal);
    this.toast('App marcado como instalado.', 'success');
  },

  showInstallAppModal() {
    if (!APP_INSTALL_URL || APP_INSTALL_URL.includes('REPLACE-ME')) {
      this.toast('Configure o link do GitHub App primeiro.', 'error');
      return;
    }
    if (this.elements.installAppLink) {
      this.elements.installAppLink.href = APP_INSTALL_URL;
    }
    this.elements.installAppModal.classList.remove('hidden');
  },

  maybePromptInstallApp() {
    if (!this.isAppInstallConfirmed()) {
      this.showInstallAppModal();
    }
  }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());
