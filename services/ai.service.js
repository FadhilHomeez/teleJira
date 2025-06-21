import { GoogleGenAI } from '@google/genai';
import { MAX_AUDIO_DURATION, TEMP_DIR } from '../config/index.js';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { createHash } from 'crypto';
import { promisify } from 'util';
import { exec } from 'child_process';

const execPromise = promisify(exec);

// Cache for transcriptions to avoid reprocessing
const transcriptionCache = new Map();

// Cleanup scheduled files
const scheduledCleanup = new Set();

// Task extraction prompt
const TASK_EXTRACTION_PROMPT = `
Extract the key tasks or action items from this transcription. 
If there are multiple tasks, format them as a bulleted list with '*' prefix.
If there are no clear tasks, provide a brief summary of the main points.
Keep your response concise and focused on actionable items.
`;

export class AIService {
  constructor(apiKey) {
    this.genAI = new GoogleGenAI({ apiKey });
  }

  /**
   * Calculate a hash for the file to use as a cache key
   * @param {string} fileId - The file ID
   * @param {number} fileSize - The file size in bytes
   * @returns {string} - A hash to use as a cache key
   */
  _getCacheKey(fileId, fileSize) {
    return createHash('md5').update(`${fileId}_${fileSize}`).digest('hex');
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
   * Compress an audio file to reduce its size
   * @param {string} inputPath - The path to the input file
   * @returns {Promise<string>} - The path to the compressed file
   */
  async _compressAudioFile(inputPath) {
    try {
      // First check if ffmpeg is available
      const ffmpegAvailable = await this._isFFmpegAvailable();
      if (!ffmpegAvailable) {
        console.log("Skipping compression as ffmpeg is not available");
        return inputPath;
      }
      
      const outputPath = `${inputPath}.compressed.ogg`;
      
      // Use ffmpeg to compress the audio file
      await execPromise(`ffmpeg -i "${inputPath}" -c:a libopus -b:a 24k "${outputPath}"`);
      
      console.log(`Compressed audio file from ${inputPath} to ${outputPath}`);
      return outputPath;
    } catch (error) {
      console.error("Failed to compress audio file:", error);
      return inputPath; // Return the original path if compression fails
    }
  }

  async transcribeAudio(bot, fileId, duration) {
    let tempFilePath = null;
    let compressedFilePath = null;
    
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
      
      // Compress the audio file if it's larger than 10MB
      if (stats.size > 10 * 1024 * 1024) {
        try {
          console.log("File is large, attempting compression...");
          compressedFilePath = await this._compressAudioFile(tempFilePath);
          
          // Use the compressed file if compression was successful
          if (compressedFilePath !== tempFilePath) {
            // Verify the compressed file exists and is smaller
            if (fs.existsSync(compressedFilePath)) {
              const compressedStats = fs.statSync(compressedFilePath);
              if (compressedStats.size < stats.size) {
                console.log(`Compression successful: ${Math.round(stats.size / (1024 * 1024))}MB → ${Math.round(compressedStats.size / (1024 * 1024))}MB`);
                tempFilePath = compressedFilePath;
              } else {
                console.log("Compressed file is not smaller, using original");
                // Clean up the compressed file since we're not using it
                fs.unlinkSync(compressedFilePath);
                compressedFilePath = null;
              }
            } else {
              console.log("Compressed file was not created, using original");
              compressedFilePath = null;
            }
          } else {
            console.log("Compression skipped, using original file");
          }
        } catch (compressionError) {
          console.error("Error during compression attempt:", compressionError);
          // If there was an error with compression, just use the original file
          compressedFilePath = null;
        }
      }
      
      // Read the file as base64
      const fileData = fs.readFileSync(tempFilePath);
      const base64Audio = fileData.toString('base64');
      console.log(`Converted to base64, length: ${base64Audio.length} chars`);
      
      const prompt = "Transcribe this audio file to text exactly as spoken...";
      
      console.log("Sending to AI model for transcription...");
      // Create a promise with timeout
      const transcriptionPromise = Promise.race([
        this.genAI.models.generateContent({
          model: "gemini-1.5-pro",
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType: "audio/ogg",
                    data: base64Audio
                  }
                },
                {
                  text: prompt
                }
              ]
            }
          ]
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Transcription timed out after 120 seconds")), 120000)
        )
      ]);
      
      const aiResponse = await transcriptionPromise;
      console.log("Received transcription response");
      
      // Clean up temporary files
      try {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
          console.log("Deleted temporary file");
        }
        
        if (compressedFilePath && compressedFilePath !== tempFilePath && fs.existsSync(compressedFilePath)) {
          fs.unlinkSync(compressedFilePath);
          console.log("Deleted compressed file");
        }
      } catch (cleanupError) {
        console.error("Failed to clean up temporary files:", cleanupError);
        // Schedule delayed cleanup
        if (tempFilePath) this._scheduleFileCleanup(tempFilePath);
        if (compressedFilePath && compressedFilePath !== tempFilePath) this._scheduleFileCleanup(compressedFilePath);
      }
      
      const transcription = aiResponse.text;
      console.log(`Transcription result (${transcription.length} chars): ${transcription.substring(0, 100)}...`);
      
      // Cache the transcription result
      if (transcription && transcription !== 'NOT_SPEECH') {
        const trimmedTranscription = transcription.trim();
        transcriptionCache.set(cacheKey, trimmedTranscription);
        
        // Limit cache size to 50 entries
        if (transcriptionCache.size > 50) {
          const oldestKey = transcriptionCache.keys().next().value;
          transcriptionCache.delete(oldestKey);
        }
        
        return trimmedTranscription;
      }
      
      return transcription === 'NOT_SPEECH' ? null : transcription.trim();
    } catch (error) {
      console.error("Transcription error:", error);
      
      // Clean up temp files if they exist
      try {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
          console.log("Cleaned up temporary file after error");
        }
        
        if (compressedFilePath && compressedFilePath !== tempFilePath && fs.existsSync(compressedFilePath)) {
          fs.unlinkSync(compressedFilePath);
          console.log("Cleaned up compressed file after error");
        }
      } catch (cleanupError) {
        console.error("Failed to clean up temporary files:", cleanupError);
        // Schedule delayed cleanup
        if (tempFilePath) this._scheduleFileCleanup(tempFilePath);
        if (compressedFilePath && compressedFilePath !== tempFilePath) this._scheduleFileCleanup(compressedFilePath);
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

  async enhanceTaskDescription(text) {
    try {
      const prompt = `
        Analyze this task description and enhance it with:
        1. Clear, actionable summary (max 100 chars)
        2. Detailed description with context
        3. Suggested priority (High/Medium/Low)
        4. Estimated effort (if mentioned)
        
        Original: "${text}"
        
        Return JSON format:
        {
          "summary": "enhanced summary",
          "description": "detailed description",
          "priority": "High|Medium|Low",
          "estimatedEffort": "1h|2h|1d|etc"
        }
      `;
      
      const aiResponse = await this.genAI.models.generateContent({
        model: "gemini-1.5-pro",
        contents: prompt
      });
      const responseText = aiResponse.text;
      
      try {
        return JSON.parse(responseText);
      } catch (e) {
        // Fallback to original text if AI parsing fails
        return {
          summary: text.length > 100 ? text.substring(0, 97) + '...' : text,
          description: text,
          priority: 'Medium'
        };
      }
    } catch (error) {
      console.error("AI enhancement error:", error);
      return {
        summary: text.length > 100 ? text.substring(0, 97) + '...' : text,
        description: text,
        priority: 'Medium'
      };
    }
  }

  async suggestProject(text) {
    try {
      const prompt = `
        Based on this task description, suggest the most appropriate project from these options:
        - WEB: Website related tasks
        - MRK: Marketing and promotional tasks  
        - DEV: Software development tasks
        - GEN: General administrative tasks
        
        Task: "${text}"
        
        Return only the project key (WEB, MRK, DEV, or GEN):
      `;
      
      const aiResponse = await this.genAI.models.generateContent({
        model: "gemini-1.5-pro",
        contents: prompt
      });
      const suggestion = aiResponse.text.trim().toUpperCase();
      
      if (['WEB', 'MRK', 'DEV', 'GEN'].includes(suggestion)) {
        return suggestion;
      }
      return 'GEN';
    } catch (error) {
      console.error("Project suggestion error:", error);
      return 'GEN';
    }
  }
  
  /**
   * Extracts tasks from a transcription
   * @param {string} transcription - The transcribed text
   * @returns {Promise<string>} - Extracted tasks or summary
   */
  async extractTasksFromTranscription(transcription) {
    try {
      if (!transcription || transcription.trim().length === 0) {
        return "No clear tasks found in the transcription.";
      }

      console.log("Extracting tasks from transcription...");
      const result = await this.genAI.models.generateContent({
        model: "gemini-1.5-pro",
        contents: [
          {
            text: `${transcription}\n\n${TASK_EXTRACTION_PROMPT}`
          }
        ]
      });

      if (!result.text || result.text.trim().length === 0) {
        return "No clear tasks could be extracted.";
      }

      console.log(`Extracted tasks: ${result.text.substring(0, 100)}...`);
      return result.text.trim();
    } catch (error) {
      console.error("Task extraction error:", error);
      return "Error extracting tasks from transcription.";
    }
  }
}
