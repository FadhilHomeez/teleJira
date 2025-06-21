import JiraApi from 'jira-client';

export class JiraService {
  constructor({ host, email, apiToken }) {
    this.jira = new JiraApi({
      protocol: 'https',
      host,
      username: email,
      password: apiToken,
      apiVersion: '2',
      strictSSL: true
    });
  }

  async createIssue(task) {
    try {
      const issue = {
        fields: {
          project: { key: task.projectKey || 'GEN' },
          summary: task.summary,
          description: task.description || 'Created via Telegram Bot',
          issuetype: { name: 'Task' },
          priority: { name: task.priority || 'Medium' },
          duedate: task.dueDate || null
        }
      };

      const result = await this.jira.addNewIssue(issue);
      
      return {
        success: true,
        url: `https://${this.jira.host}/browse/${result.key}`,
        key: result.key
      };
    } catch (error) {
      console.error('Jira error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}