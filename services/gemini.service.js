import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { validateEnv } from '../config/env.js';

const { geminiApiKey } = validateEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Service for handling audio transcription using Gemini AI
 */
export class GeminiService {
  constructor() {
    this.genAI = new GoogleGenerativeAI(geminiApiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro-vision' });
    this.tempDir = path.join(__dirname, '..', 'temp_audio');
    
    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Transcribes audio using Gemini AI
   * @param {Object} bot - Telegram bot instance
   * @param {string} fileId - Telegram file ID
   * @param {number} duration - Audio duration in seconds
   * @returns {Promise<string>} - Transcribed text
   */
  async transcribeAudio(bot, fileId, duration) {
    try {
      console.log(`Starting Gemini transcription for file ${fileId}`);
      
      // Get file path from Telegram
      const file = await bot.getFile(fileId);
      const filePath = file.file_path;
      const fileUrl = `https://api.telegram.org/file/bot${bot.token}/${filePath}`;
      
      // Download the file
      const fileResponse = await fetch(fileUrl);
      if (!fileResponse.ok) {
        throw new Error(`Failed to download file: ${fileResponse.statusText}`);
      }
      
      // Save to temp file
      const buffer = await fileResponse.arrayBuffer();
      const tempFilePath = path.join(this.tempDir, `${fileId}.ogg`);
      fs.writeFileSync(tempFilePath, Buffer.from(buffer));
      
      // Convert to base64
      const audioData = fs.readFileSync(tempFilePath);
      const base64Audio = audioData.toString('base64');
      
      // Determine MIME type based on file extension
      const mimeType = this.getMimeType(filePath);
      
      // Create prompt for Gemini
      const prompt = "Transcribe the audio conversation provided. Include all speakers and their dialogue.";
      
      // Call Gemini API
      const result = await this.model.generateContent([
        prompt,
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Audio
          }
        }
      ]);
      
      // Clean up temp file
      fs.unlinkSync(tempFilePath);
      
      // Extract and return transcription
      const responseText = await result.response;
      return responseText.text().trim();
    } catch (error) {
      console.error(`Gemini transcription error: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Determines MIME type based on file extension
   * @param {string} filePath - Path to the file
   * @returns {string} - MIME type
   */
  getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.mp3':
        return 'audio/mpeg';
      case '.wav':
        return 'audio/wav';
      case '.flac':
        return 'audio/flac';
      case '.m4a':
        return 'audio/mp4';
      case '.ogg':
        return 'audio/ogg';
      default:
        return 'audio/ogg'; // Default for Telegram voice messages
    }
  }
}
