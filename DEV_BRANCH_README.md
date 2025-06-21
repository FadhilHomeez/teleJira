# Development Branch

This is the development branch for the teleJira project. All new features and bug fixes should be developed in this branch before being merged into the main branch.

## Development Workflow

1. Make sure you're on the dev branch:
   ```
   git checkout dev
   ```

2. Pull the latest changes:
   ```
   git pull origin dev
   ```

3. Create a feature branch for your specific task:
   ```
   git checkout -b feature/your-feature-name
   ```

4. Make your changes and commit them:
   ```
   git add .
   git commit -m "Description of your changes"
   ```

5. Push your feature branch to GitHub:
   ```
   git push -u origin feature/your-feature-name
   ```

6. Create a pull request to merge your feature branch into the dev branch.

7. After testing in the dev branch, create a pull request to merge the dev branch into the main branch.

## Recent Fixes

The following issues have been fixed in this branch:

1. Fixed the problem where the task confirmation message was showing prematurely during editing.
2. Fixed the issue with the "No changes were made to the task" message appearing in the middle of the editing process.
3. Fixed Markdown formatting errors with periods in Telegram messages by:
   - Creating a new `editSafeMessage` function that properly handles period escaping
   - Updating all message editing code to use this new function
   - Adding explicit period escaping in various message formatting functions
   - Ensuring deep copies of tasks are used for proper change detection

## Deployment from Dev Branch

To deploy the development version for testing:

1. Clone the repository and checkout the dev branch:
   ```
   git clone https://github.com/FadhilHomeez/teleJira.git
   cd teleJira
   git checkout dev
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file with your configuration.

4. Start the bot:
   ```
   npm start
