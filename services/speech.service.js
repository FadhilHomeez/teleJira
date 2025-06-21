import { SpeechClient } from '@google-cloud/speech';
import fs from 'fs';
import path from 'path';
import { MAX_AUDIO_DURATION, TEMP_DIR } from '../config/index.js';
import { promisify } from 'util';
import { exec } from 'child_process';

const execPromise = promisify(exec);

// Cache for transcriptions to avoid reprocessing
const transcriptionCache = new Map();

// Cleanup scheduled files
const scheduledCleanup = new Set();

export class SpeechService {
  constructor() {
    // Initialize the Speech-to-Text client
    // This assumes GOOGLE_APPLICATION_CREDENTIALS is set in the environment
    this.speechClient = new SpeechClient();
  }

  /**
   * Calculate a hash for the file to use as a cache key
   * @param {string} fileId - The file ID
   * @param {number} fileSize - The file size in bytes
   * @returns {string} - A hash to use as a cache key
   */
  _getCacheKey(fileId, fileSize) {
    return require('crypto').createHash('md5').update(`${fileId}_${fileSize}`).digest('hex');
  }
  
  /**
   * Schedule a file for cleanup after a delay
   * @param {string} filePath - The path to the file to clean up
   */
  _scheduleFileCleanup(filePath) {
    if (scheduledCleanup.has(filePath)) return;
    
    scheduledCleanup.add(filePath);
    setTimeout(() => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`Cleaned up file ${filePath} after delay`);
        }
      } catch (err) {
        console.error(`Failed to clean up file ${filePath}:`, err);
      } finally {
        scheduledCleanup.delete(filePath);
      }
    }, 3600000); // Clean up after 1 hour
  }
  
  /**
   * Check if ffmpeg is available on the system
   * @returns {Promise<boolean>} - Whether ffmpeg is available
   */
  async _isFFmpegAvailable() {
    try {
      await execPromise('which ffmpeg || command -v ffmpeg');
      return true;
    } catch (error) {
      console.log("FFmpeg is not available on this system");
      return false;
    }
  }
  
  /**
   * Convert audio file to WAV format for better compatibility with Speech-to-Text
   * @param {string} inputPath - The path to the input file
   * @returns {Promise<string>} - The path to the converted file
   */
  async _convertToWav(inputPath) {
    try {
      // First check if ffmpeg is available
      const ffmpegAvailable = await this._isFFmpegAvailable();
      if (!ffmpegAvailable) {
        console.log("Skipping conversion as ffmpeg is not available");
        return inputPath;
      }
      
      const outputPath = `${inputPath}.wav`;
      
      // Use ffmpeg to convert the audio file to WAV format with LINEAR16 encoding
      await execPromise(`ffmpeg -i "${inputPath}" -acodec pcm_s16le -ar 16000 -ac 1 "${outputPath}"`);
      
      console.log(`Converted audio file from ${inputPath} to ${outputPath}`);
      return outputPath;
    } catch (error) {
      console.error("Failed to convert audio file:", error);
      return inputPath; // Return the original path if conversion fails
    }
  }

  /**
   * Transcribe an audio file using Google Cloud Speech-to-Text
   * @param {object} bot - The Telegram bot instance
   * @param {string} fileId - The Telegram file ID
   * @param {number} duration - The duration of the audio in seconds
   * @returns {Promise<string|null>} - The transcription or null if it failed
   */
  async transcribeAudio(bot, fileId, duration) {
    let tempFilePath = null;
    let convertedFilePath = null;
    
    try {
      console.log(`Starting transcription for file ${fileId}, duration: ${duration}s`);
      
      if (duration > MAX_AUDIO_DURATION) {
        throw new Error(`Audio too long (${duration}s > ${MAX_AUDIO_DURATION}s limit)`);
      }

      console.log("Getting file link...");
      const fileLink = await bot.getFileLink(fileId);
      
      // Get file info to use for caching
      const fileInfo = await bot.getFile(fileId);
      const cacheKey = this._getCacheKey(fileId, fileInfo.file_size);
      
      // Check if we have a cached transcription
      if (transcriptionCache.has(cacheKey)) {
        console.log("Using cached transcription");
        return transcriptionCache.get(cacheKey);
      }
      
      console.log("Downloading audio file...");
      const axios = (await import('axios')).default;
      const axiosResponse = await axios.get(fileLink, { 
        responseType: 'arraybuffer',
        timeout: 60000 // 60 second timeout for download
      });
      const audioBuffer = Buffer.from(axiosResponse.data, 'binary');
      console.log(`Downloaded audio file: ${audioBuffer.length} bytes`);
      
      if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
      }
      
      tempFilePath = path.join(TEMP_DIR, `${fileId}.ogg`);
      fs.writeFileSync(tempFilePath, audioBuffer);
      console.log(`Saved audio to ${tempFilePath}`);
      
      // Check if file size is too large (>50MB)
      const stats = fs.statSync(tempFilePath);
      if (stats.size > 50 * 1024 * 1024) {
        throw new Error(`Audio file too large: ${Math.round(stats.size / (1024 * 1024))}MB`);
      }
      
      // Convert the audio file to WAV format for better compatibility with Speech-to-Text
      console.log("Converting audio to WAV format...");
      convertedFilePath = await this._convertToWav(tempFilePath);
      
      // Read the file content
      const audioContent = fs.readFileSync(convertedFilePath);
      
      // Configure the request
      const request = {
        audio: {
          content: audioContent.toString('base64'),
        },
        config: {
          encoding: 'LINEAR16',
          sampleRateHertz: 16000,
          languageCode: 'en-US',
          model: 'default', // Use 'phone_call' for audio from phone calls
          useEnhanced: true, // Use enhanced model
          enableAutomaticPunctuation: true,
          enableWordTimeOffsets: false,
        },
      };
      
      console.log("Sending to Google Cloud Speech-to-Text...");
      const [response] = await this.speechClient.recognize(request);
      
      // Clean up temporary files
      try {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
          console.log("Deleted temporary file");
        }
        
        if (convertedFilePath && convertedFilePath !== tempFilePath && fs.existsSync(convertedFilePath)) {
          fs.unlinkSync(convertedFilePath);
          console.log("Deleted converted file");
        }
      } catch (cleanupError) {
        console.error("Failed to clean up temporary files:", cleanupError);
        // Schedule delayed cleanup
        if (tempFilePath) this._scheduleFileCleanup(tempFilePath);
        if (convertedFilePath && convertedFilePath !== tempFilePath) this._scheduleFileCleanup(convertedFilePath);
      }
      
      // Extract the transcription from the response
      const transcription = response.results
        .map(result => result.alternatives[0].transcript)
        .join(' ');
      
      console.log(`Transcription result (${transcription.length} chars): ${transcription.substring(0, 100)}...`);
      
      // Cache the transcription result
      if (transcription) {
        const trimmedTranscription = transcription.trim();
        transcriptionCache.set(cacheKey, trimmedTranscription);
        
        // Limit cache size to 50 entries
        if (transcriptionCache.size > 50) {
          const oldestKey = transcriptionCache.keys().next().value;
          transcriptionCache.delete(oldestKey);
        }
        
        return trimmedTranscription;
      }
      
      return transcription.trim();
    } catch (error) {
      console.error("Transcription error:", error);
      
      // Clean up temp files if they exist
      try {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
          console.log("Cleaned up temporary file after error");
        }
        
        if (convertedFilePath && convertedFilePath !== tempFilePath && fs.existsSync(convertedFilePath)) {
          fs.unlinkSync(convertedFilePath);
          console.log("Cleaned up converted file after error");
        }
      } catch (cleanupError) {
        console.error("Failed to clean up temporary files:", cleanupError);
        // Schedule delayed cleanup
        if (tempFilePath) this._scheduleFileCleanup(tempFilePath);
        if (convertedFilePath && convertedFilePath !== tempFilePath) this._scheduleFileCleanup(convertedFilePath);
      }
      
      // Return a more user-friendly message based on the error
      if (error.message.includes("timed out")) {
        return "Transcription timed out. The audio file might be too complex or the service is currently overloaded. Try a shorter recording or wait a few minutes before trying again.";
      } else if (error.message.includes("too large")) {
        return "The audio file is too large to process. Please try a shorter recording (under 20 minutes) or use a lower quality setting when recording.";
      } else if (error.message.includes("ffmpeg")) {
        return "There was an issue processing your audio file. Please try again with a different file format or quality.";
      } else {
        return null;
      }
    }
  }
}
