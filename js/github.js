// GitHub API with Personal Access Token
const GitHub = {
  ORGS: ['StudioVibi', 'HigherOrderCO'],
  PROJECT_NAME: 'Work',

  token: null,
  user: null,

  // Initialize - check for saved token
  init() {
    const saved = localStorage.getItem('github_token');
    if (saved) {
      this.token = saved;
      return true;
    }
    return false;
  },

  // Set token
  setToken(token) {
    this.token = token;
    localStorage.setItem('github_token', token);
  },

  // Validate token by trying to get user
  async validateToken(token) {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      throw new Error('Token inválido');
    }

    return await response.json();
  },

  // Logout
  logout() {
    this.token = null;
    this.user = null;
    localStorage.removeItem('github_token');
  },

  // API request helper
  async api(endpoint, options = {}) {
    const url = endpoint.startsWith('https://') ? endpoint : `https://api.github.com${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/vnd.github.v3+json',
        ...options.headers
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `API error: ${response.status}`);
    }

    return await response.json();
  },

  // GraphQL API helper
  async graphql(query, variables = {}) {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query, variables })
    });

    const data = await response.json();

    if (data.errors) {
      console.error('GraphQL errors:', data.errors);
      throw new Error(data.errors[0].message);
    }

    return data.data;
  },

  // Get current user
  async getUser() {
    if (this.user) return this.user;
    this.user = await this.api('/user');
    return this.user;
  },

  // Get closed issues assigned to user from both orgs
  async getClosedIssues(org = 'all', daysBack = 30) {
    const user = await this.getUser();
    const since = new Date();
    since.setDate(since.getDate() - daysBack);

    const orgs = org === 'all' ? this.ORGS : [org];
    const allIssues = [];

    for (const orgName of orgs) {
      try {
        // Get all repos from org
        const repos = await this.api(`/orgs/${orgName}/repos?per_page=100`);

        for (const repo of repos) {
          try {
            // Get closed issues assigned to user
            const issues = await this.api(
              `/repos/${orgName}/${repo.name}/issues?` +
              `assignee=${user.login}&state=closed&since=${since.toISOString()}&per_page=100`
            );

            for (const issue of issues) {
              if (!issue.pull_request) { // Exclude PRs
                allIssues.push({
                  id: issue.id,
                  number: issue.number,
                  title: issue.title,
                  url: issue.html_url,
                  repo: repo.name,
                  org: orgName,
                  closedAt: issue.closed_at,
                  hours: null // Will be filled from Project
                });
              }
            }
          } catch (e) {
            console.warn(`Error fetching issues from ${orgName}/${repo.name}:`, e);
          }
        }
      } catch (e) {
        console.warn(`Error fetching repos from ${orgName}:`, e);
      }
    }

    // Now get hours from Projects
    await this.enrichWithProjectHours(allIssues, orgs);

    // Sort by closed date, newest first
    allIssues.sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt));

    return allIssues;
  },

  // Get hours from GitHub Project custom fields
  async enrichWithProjectHours(issues, orgs) {
    for (const orgName of orgs) {
      try {
        // First, find the "Work" project
        const projectsQuery = `
          query($org: String!) {
            organization(login: $org) {
              projectsV2(first: 20) {
                nodes {
                  id
                  title
                  fields(first: 20) {
                    nodes {
                      ... on ProjectV2Field {
                        id
                        name
                      }
                      ... on ProjectV2IterationField {
                        id
                        name
                      }
                      ... on ProjectV2SingleSelectField {
                        id
                        name
                      }
                    }
                  }
                }
              }
            }
          }
        `;

        const projectsData = await this.graphql(projectsQuery, { org: orgName });
        const projects = projectsData.organization?.projectsV2?.nodes || [];
        const workProject = projects.find(p => p.title === this.PROJECT_NAME);

        if (!workProject) {
          console.warn(`Project "${this.PROJECT_NAME}" not found in ${orgName}`);
          continue;
        }

        // Find the Hours field
        const hoursField = workProject.fields.nodes.find(
          f => f.name.toLowerCase() === 'hours'
        );

        if (!hoursField) {
          console.warn(`Hours field not found in project ${this.PROJECT_NAME} of ${orgName}`);
          continue;
        }

        // Get project items with Hours field
        const itemsQuery = `
          query($projectId: ID!) {
            node(id: $projectId) {
              ... on ProjectV2 {
                items(first: 100) {
                  nodes {
                    id
                    fieldValues(first: 20) {
                      nodes {
                        ... on ProjectV2ItemFieldNumberValue {
                          field { ... on ProjectV2Field { name } }
                          number
                        }
                      }
                    }
                    content {
                      ... on Issue {
                        id
                        number
                        repository {
                          name
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        `;

        const itemsData = await this.graphql(itemsQuery, { projectId: workProject.id });
        const items = itemsData.node?.items?.nodes || [];

        // Match issues with project items to get hours
        for (const item of items) {
          if (!item.content || !item.content.number) continue;

          const hoursValue = item.fieldValues.nodes.find(
            fv => fv.field?.name?.toLowerCase() === 'hours'
          );

          if (hoursValue) {
            const matchingIssue = issues.find(
              i => i.org === orgName &&
                   i.repo === item.content.repository.name &&
                   i.number === item.content.number
            );

            if (matchingIssue) {
              matchingIssue.hours = hoursValue.number;
            }
          }
        }
      } catch (e) {
        console.warn(`Error getting project data from ${orgName}:`, e);
      }
    }
  },

  // Check if user's Invoices repo exists
  async checkInvoicesRepo(username) {
    try {
      await this.api(`/repos/${username}/Invoices`);
      return true;
    } catch (e) {
      return false;
    }
  },

  // Create Invoices repo for user
  async createInvoicesRepo() {
    const user = await this.getUser();

    await this.api('/user/repos', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Invoices',
        description: 'My invoices repository',
        private: true,
        auto_init: true
      })
    });

    return `${user.login}/Invoices`;
  },

  // Upload invoice to user's repo
  async uploadInvoice(filename, content) {
    const user = await this.getUser();
    const repoExists = await this.checkInvoicesRepo(user.login);

    if (!repoExists) {
      await this.createInvoicesRepo();
      // Wait a bit for the repo to be ready
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Create file via GitHub API
    const encodedContent = btoa(unescape(encodeURIComponent(content)));

    await this.api(`/repos/${user.login}/Invoices/contents/${filename}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `Add invoice: ${filename}`,
        content: encodedContent
      })
    });

    return `https://github.com/${user.login}/Invoices/blob/main/${filename}`;
  },

  // Get invoice history
  async getInvoiceHistory() {
    const user = await this.getUser();

    try {
      const contents = await this.api(`/repos/${user.login}/Invoices/contents`);
      const invoices = contents
        .filter(f => f.name.endsWith('.invoice.yaml'))
        .map(f => ({
          name: f.name,
          url: f.html_url,
          downloadUrl: f.download_url
        }));

      // Sort by name (which includes date) descending
      invoices.sort((a, b) => b.name.localeCompare(a.name));

      return invoices;
    } catch (e) {
      return [];
    }
  }
};
