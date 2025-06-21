#!/usr/bin/env node

import fs from 'fs';
import { execSync } from 'child_process';
import readline from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🚀 AutoJira Bot Setup');
console.log('=====================');
console.log('This script will help you set up the AutoJira bot.');
console.log('');

// Check if .env file exists
const envFile = path.join(__dirname, '.env');
const envExampleFile = path.join(__dirname, '.env.example');

if (!fs.existsSync(envExampleFile)) {
  console.error('❌ .env.example file not found. Please make sure you are running this script from the project root directory.');
  process.exit(1);
}

const createEnvFile = () => {
  if (fs.existsSync(envFile)) {
    rl.question('⚠️ .env file already exists. Do you want to overwrite it? (y/n): ', (answer) => {
      if (answer.toLowerCase() === 'y') {
        setupEnvFile();
      } else {
        console.log('✅ Setup completed. Using existing .env file.');
        installDependencies();
      }
    });
  } else {
    setupEnvFile();
  }
};

const setupEnvFile = () => {
  const envExample = fs.readFileSync(envExampleFile, 'utf8');
  
  console.log('\n📝 Please provide the following information:');
  
  rl.question('Gemini API Key: ', (geminiApiKey) => {
    rl.question('Telegram Bot Token: ', (telegramBotToken) => {
      rl.question('Jira Host (e.g., your-domain.atlassian.net): ', (jiraHost) => {
        rl.question('Jira Email: ', (jiraEmail) => {
          rl.question('Jira API Token: ', (jiraApiToken) => {
            rl.question('Admin Chat ID (your Telegram chat ID): ', (adminChatId) => {
              let envContent = envExample
                .replace('your_gemini_api_key', geminiApiKey)
                .replace('your_telegram_bot_token', telegramBotToken)
                .replace('your_jira_host', jiraHost)
                .replace('your_jira_email', jiraEmail)
                .replace('your_jira_api_token', jiraApiToken)
                .replace('your_telegram_chat_id', adminChatId);
              
              fs.writeFileSync(envFile, envContent);
              console.log('✅ .env file created successfully.');
              
              setupGoogleCloud();
            });
          });
        });
      });
    });
  });
};

const setupGoogleCloud = () => {
  rl.question('\n🔑 Do you want to set up Google Cloud Speech-to-Text for faster transcription? (y/n): ', (answer) => {
    if (answer.toLowerCase() === 'y') {
      console.log('\n📋 Google Cloud Speech-to-Text Setup Instructions:');
      console.log('1. Create a Google Cloud project if you don\'t have one already');
      console.log('2. Enable the Speech-to-Text API in your project');
      console.log('3. Create a service account and download the JSON key file');
      console.log('4. Set the environment variable GOOGLE_APPLICATION_CREDENTIALS to the path of your service account key file:');
      console.log('\n   Linux/macOS:');
      console.log('   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/service-account-key.json"');
      console.log('\n   Windows CMD:');
      console.log('   set GOOGLE_APPLICATION_CREDENTIALS=C:\\path\\to\\your\\service-account-key.json');
      console.log('\n   Windows PowerShell:');
      console.log('   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\\path\\to\\your\\service-account-key.json"');
      
      rl.question('\nPress Enter to continue...', () => {
        installDependencies();
      });
    } else {
      console.log('⚠️ Skipping Google Cloud setup. The bot will use Gemini AI for transcription.');
      installDependencies();
    }
  });
};

const installDependencies = () => {
  rl.question('\n📦 Do you want to install dependencies now? (y/n): ', (answer) => {
    if (answer.toLowerCase() === 'y') {
      console.log('\n🔄 Installing dependencies...');
      try {
        execSync('npm install', { stdio: 'inherit' });
        console.log('✅ Dependencies installed successfully.');
        finishSetup();
      } catch (error) {
        console.error('❌ Failed to install dependencies:', error.message);
        finishSetup();
      }
    } else {
      console.log('⚠️ Skipping dependency installation. Remember to run npm install before starting the bot.');
      finishSetup();
    }
  });
};

const finishSetup = () => {
  console.log('\n🎉 Setup completed!');
  console.log('To start the bot, run:');
  console.log('npm start');
  rl.close();
};

// Start setup
createEnvFile();
