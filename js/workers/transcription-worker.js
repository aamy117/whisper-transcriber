/**
 * Transcription Worker
 * 處理單個音訊片段的轉譯任務
 */

// Worker 狀態
let workerId = null;
let isInitialized = false;
let currentTask = null;

// 配置
const config = {
  timeout: 300000, // 預設5分鐘超時
  apiEndpoint: 'https://api.openai.com/v1/audio/transcriptions'
};

// 初始化 Worker
self.addEventListener('message', async (event) => {
  const { type, messageId, ...data } = event.data;

  try {
    let response = null;

    switch (type) {
      case 'init':
        response = await handleInit(data);
        break;

      case 'execute':
        response = await handleExecute(data);
        break;

      case 'cancel':
        response = await handleCancel(data);
        break;

      default:
        throw new Error(`未知的消息類型：${type}`);
    }

    // 回傳成功響應
    self.postMessage({
      messageId,
      type: 'success',
      ...response
    });
  } catch (error) {
    // 回傳錯誤響應
    self.postMessage({
      messageId,
      type: 'error',
      error: error.message
    });
  }
});

/**
 * 處理初始化
 */
async function handleInit(data) {
  workerId = data.id;
  
  if (data.options) {
    Object.assign(config, data.options);
  }

  isInitialized = true;
  
  log(`Worker 初始化完成`);
  
  return { type: 'ready' };
}

/**
 * 處理執行任務
 */
async function handleExecute(data) {
  if (!isInitialized) {
    throw new Error('Worker 未初始化');
  }

  const { taskId, task } = data;
  currentTask = taskId;

  try {
    log(`開始處理任務：${taskId}`);
    
    // 檢查任務類型
    if (task.type !== 'transcribe') {
      throw new Error(`不支援的任務類型：${task.type}`);
    }

    // 執行轉譯
    const result = await performTranscription(task);
    
    // 發送結果
    self.postMessage({
      type: 'result',
      taskId: taskId,
      result: result
    });

    log(`任務完成：${taskId}`);
    return { success: true };
  } finally {
    currentTask = null;
  }
}

/**
 * 執行轉譯
 */
async function performTranscription(task) {
  const { data: taskData, options } = task;
  const { audio, format, startTime, endTime, index } = taskData;
  const { model, language, apiKey, useWASM } = options;

  const startProcessing = Date.now();

  try {
    let result;

    if (useWASM) {
      // WASM 模式轉譯
      result = await transcribeWithWASM(audio, {
        model,
        language,
        format
      });
    } else {
      // API 模式轉譯
      if (!apiKey) {
        throw new Error('API 模式需要提供 API Key');
      }
      
      result = await transcribeWithAPI(audio, {
        model,
        language,
        format,
        apiKey
      });
    }

    // 處理結果
    const processedResult = {
      text: result.text || '',
      segments: result.segments || [],
      language: result.language || language,
      duration: endTime - startTime,
      startTime: startTime,
      endTime: endTime,
      index: index,
      confidence: result.confidence,
      words: result.text ? result.text.split(/\s+/).length : 0,
      processingTime: Date.now() - startProcessing
    };

    // 調整時間戳
    if (processedResult.segments.length > 0) {
      processedResult.segments = processedResult.segments.map(seg => ({
        ...seg,
        start: (seg.start || 0) + startTime,
        end: (seg.end || 0) + startTime
      }));
    }

    return processedResult;
  } catch (error) {
    log(`轉譯失敗：${error.message}`);
    throw error;
  }
}

/**
 * 使用 API 進行轉譯
 */
async function transcribeWithAPI(audioData, options) {
  const { model, language, format, apiKey } = options;

  // 更新進度
  reportProgress(10, '準備音訊資料');

  // 將音訊資料轉換為 Blob
  const audioBlob = new Blob([audioData], { 
    type: getMimeType(format) 
  });

  // 建立 FormData
  const formData = new FormData();
  formData.append('file', audioBlob, `audio.${format}`);
  formData.append('model', model);
  formData.append('language', language);
  formData.append('response_format', 'verbose_json');

  reportProgress(20, '發送請求到 API');

  try {
    const response = await fetchWithTimeout(config.apiEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData
    }, config.timeout);

    reportProgress(80, '處理響應');

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `API 錯誤：${response.status}`);
    }

    const result = await response.json();
    
    reportProgress(100, '完成');
    
    return result;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('請求超時');
    }
    throw error;
  }
}

/**
 * 使用 WASM 進行轉譯（模擬）
 */
async function transcribeWithWASM(audioData, options) {
  // TODO: 實際的 WASM 轉譯實現
  // 這裡暫時返回模擬結果
  
  reportProgress(20, '載入 WASM 模型');
  await sleep(500);
  
  reportProgress(50, '處理音訊');
  await sleep(1000);
  
  reportProgress(80, '生成文字');
  await sleep(500);
  
  reportProgress(100, '完成');
  
  return {
    text: `[WASM 模擬轉譯結果 - 片段 ${options.index || 0}]`,
    segments: [{
      text: `[WASM 模擬轉譯結果 - 片段 ${options.index || 0}]`,
      start: 0,
      end: 5
    }],
    language: options.language,
    confidence: 0.95
  };
}

/**
 * 帶超時的 fetch
 */
async function fetchWithTimeout(url, options, timeout) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 處理取消
 */
async function handleCancel(data) {
  if (currentTask === data.taskId) {
    // 取消當前任務的邏輯
    currentTask = null;
    log(`任務已取消：${data.taskId}`);
  }
  
  return { cancelled: true };
}

/**
 * 報告進度
 */
function reportProgress(percent, message) {
  if (!currentTask) return;

  self.postMessage({
    type: 'progress',
    taskId: currentTask,
    progress: {
      percent: percent,
      message: message,
      timestamp: Date.now()
    }
  });
}

/**
 * 記錄日誌
 */
function log(message) {
  self.postMessage({
    type: 'log',
    message: `[${workerId}] ${message}`
  });
}

/**
 * 獲取 MIME 類型
 */
function getMimeType(format) {
  const mimeTypes = {
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'webm': 'audio/webm',
    'ogg': 'audio/ogg',
    'm4a': 'audio/mp4',
    'flac': 'audio/flac'
  };
  
  return mimeTypes[format.toLowerCase()] || 'audio/mpeg';
}

/**
 * 睡眠函數（用於模擬）
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Worker 錯誤處理
self.addEventListener('error', (event) => {
  console.error('Worker 錯誤:', event);
  self.postMessage({
    type: 'error',
    error: event.message || '未知錯誤'
  });
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('Worker 未處理的拒絕:', event.reason);
  self.postMessage({
    type: 'error',
    error: event.reason?.message || '未處理的拒絕'
  });
});