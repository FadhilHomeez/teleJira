import path from 'path';
import { fileURLToPath } from 'url';

// Get the current directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const KNOWN_PROJECTS = [
    { key: 'WEB', name: 'Website' },
    { key: 'MRK', name: 'Marketing' },
    { key: 'DEV', name: 'Development' },
    { key: 'GEN', name: 'General' }
];

export const MAX_AUDIO_DURATION = 1200; // 20 minutes in seconds
export const TEMP_DIR = path.join(__dirname, '../temp_audio');
