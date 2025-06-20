// Whisper API 模組
import Config from './config.js';
import { textConverter } from './utils/text-converter.js';

class WhisperAPI {
  constructor() {
    this.apiKey = this.getApiKey();
    this.endpoint = Config.api.endpoint;
    this.model = Config.api.model;
    this.abortController = null;
  }
  
  // 從 localStorage 取得 API Key
  getApiKey() {
    return localStorage.getItem(Config.storage.prefix + 'apiKey');
  }
  
  // 更新 API Key
  setApiKey(key) {
    this.apiKey = key;
    localStorage.setItem(Config.storage.prefix + 'apiKey', key);
  }
  
  // 驗證 API Key
  validateApiKey() {
    if (!this.apiKey) {
      throw new Error('請先設定 API Key');
    }
    if (!this.apiKey.startsWith('sk-')) {
      throw new Error('API Key 格式錯誤');
    }
    return true;
  }
  
  // 驗證檔案
  validateFile(file, skipSizeCheck = false) {
    if (!file) {
      throw new Error('請選擇檔案');
    }
    
    // 檔案大小檢查可選（因為預處理器會處理大檔案）
    if (!skipSizeCheck && file.size > Config.api.maxFileSize) {
      const maxSizeMB = Config.api.maxFileSize / 1024 / 1024;
      throw new Error(`檔案大小超過 OpenAI API 限制（最大 ${maxSizeMB}MB）。請使用較小的檔案進行轉譯。`);
    }
    
    // 檢查檔案格式
    const extension = file.name.split('.').pop().toLowerCase();
    // 允許 WAV 格式（壓縮和分割後的格式）
    const supportedFormats = [...Config.supportedFormats, 'wav'];
    if (!supportedFormats.includes(extension)) {
      throw new Error(`不支援的檔案格式：${extension}`);
    }
    
    return true;
  }
  
  // 主要轉譯方法
  async transcribe(audioFile, options = {}) {
    try {
      // 驗證
      this.validateApiKey();
      this.validateFile(audioFile, options.skipSizeCheck);
      
      // 建立 FormData
      const formData = new FormData();
      formData.append('file', audioFile);
      formData.append('model', this.model);
      
      // 可選參數
      if (options.language) {
        formData.append('language', options.language);
      }
      if (options.prompt) {
        formData.append('prompt', options.prompt);
      }
      if (options.temperature !== undefined) {
        formData.append('temperature', options.temperature.toString());
      }
      
      // 回應格式：verbose_json 包含時間戳
      formData.append('response_format', options.responseFormat || 'verbose_json');
      
      // 建立新的 AbortController
      this.abortController = new AbortController();
      
      // 發送請求
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: formData,
        signal: this.abortController.signal
      });
      
      // 處理回應
      if (!response.ok) {
        await this.handleErrorResponse(response);
      }
      
      const result = await response.json();
      return this.processResult(result);
      
    } catch (error) {
      // 處理取消請求
      if (error.name === 'AbortError') {
        throw new Error('轉譯已取消');
      }
      
      console.error('Transcription error:', error);
      throw error;
    } finally {
      this.abortController = null;
    }
  }
  
  // 處理錯誤回應
  async handleErrorResponse(response) {
    let errorMessage = '轉譯失敗';
    
    try {
      const errorData = await response.json();
      
      switch (response.status) {
        case 401:
          errorMessage = 'API Key 無效或已過期';
          break;
        case 413:
          errorMessage = '檔案太大';
          break;
        case 429:
          errorMessage = '請求次數過多，請稍後再試';
          break;
        case 500:
        case 503:
          errorMessage = 'OpenAI 服務暫時無法使用';
          break;
        default:
          errorMessage = errorData.error?.message || errorMessage;
      }
    } catch (e) {
      // 如果無法解析錯誤回應
      errorMessage = `轉譯失敗 (${response.status})`;
    }
    
    throw new Error(errorMessage);
  }
  
  // 處理轉譯結果
  processResult(rawResult) {
    // 確保結果格式正確
    const result = {
      text: rawResult.text || '',
      segments: rawResult.segments || [],
      language: rawResult.language || 'unknown',
      duration: rawResult.duration || 0
    };
    
    // 處理段落：確保每個段落都有必要的欄位
    result.segments = result.segments.map((segment, index) => {
      // 處理文字：簡轉繁、生成無標點版本
      const processedText = textConverter.simplifiedToTraditional(segment.text || '');
      const textWithoutPunctuation = textConverter.removePunctuation(processedText);
      
      return {
        id: segment.id || index,
        seek: segment.seek || 0,
        start: segment.start || 0,
        end: segment.end || 0,
        text: processedText, // 繁體中文（含標點）
        textWithoutPunctuation: textWithoutPunctuation, // 繁體中文（無標點）
        tokens: segment.tokens || [],
        temperature: segment.temperature || 0,
        avg_logprob: segment.avg_logprob || 0,
        compression_ratio: segment.compression_ratio || 0,
        no_speech_prob: segment.no_speech_prob || 0
      };
    });
    
    return result;
  }
  
  // 取消轉譯
  cancel() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
  
  // 測試 API 連接
  async testConnection() {
    try {
      this.validateApiKey();
      
      // 建立一個小的測試音訊檔案
      const testAudioData = new Uint8Array(1024);
      const testFile = new File([testAudioData], 'test.mp3', { type: 'audio/mp3' });
      
      // 嘗試轉譯（會失敗，但可以測試連接）
      await this.transcribe(testFile, { responseFormat: 'text' });
      
      return true;
    } catch (error) {
      // 如果是 401 錯誤，表示 API Key 無效
      if (error.message.includes('API Key 無效')) {
        throw error;
      }
      // 其他錯誤可能是因為測試檔案無效，但連接是正常的
      return true;
    }
  }
  
  // 估算轉譯時間（基於檔案大小）
  estimateTranscriptionTime(fileSize) {
    // 粗略估算：每 MB 約 2-5 秒
    const sizeMB = fileSize / 1024 / 1024;
    const minTime = Math.ceil(sizeMB * 2);
    const maxTime = Math.ceil(sizeMB * 5);
    
    return {
      min: minTime,
      max: maxTime,
      average: Math.ceil((minTime + maxTime) / 2)
    };
  }
}

// 匯出類別
export { WhisperAPI };