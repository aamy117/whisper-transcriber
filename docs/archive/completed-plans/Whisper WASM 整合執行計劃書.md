# Whisper WASM 整合執行計劃書

## 專案目標

解決 OpenAI Whisper API 25MB 檔案大小限制問題，通過整合 Whisper.cpp WebAssembly 版本，為大檔案提供本地轉譯選項。

## 整體策略

### 混合處理方案
- **小檔案（≤25MB）**：繼續使用 OpenAI API（快速、高精度）
- **大檔案（>25MB）**：提供兩種選擇
  1. 自動分割 + API 轉譯（已規劃的方案）
  2. **本地 WASM 轉譯（新增功能）**

---

## 📋 第一階段：技術準備（2-3 天）

### Day 1: 環境準備與檔案下載

#### 1.1 建立 WASM 模組目錄結構
```bash
# 在專案根目錄執行
mkdir -p js/wasm
mkdir -p models
mkdir -p js/workers
```

#### 1.2 下載必要檔案
```bash
# 下載預編譯的 WASM 檔案
cd js/wasm

# 從官方 release 下載（約 8MB）
wget https://github.com/ggml-org/whisper.cpp/releases/latest/download/whisper.wasm
wget https://github.com/ggml-org/whisper.cpp/releases/latest/download/whisper.js

# 或從線上演示複製
curl -o whisper.wasm https://whisper.ggerganov.com/whisper.wasm
curl -o whisper.js https://whisper.ggerganov.com/whisper.js
```

#### 1.3 下載模型檔案
```bash
cd ../../models

# 下載建議的模型（選擇一或兩個）
# tiny 模型 (75MB) - 速度最快
curl -o ggml-tiny.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin

# base 模型 (142MB) - 平衡選擇
curl -o ggml-base.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin

# small 模型 (466MB) - 較高精度
curl -o ggml-small.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin
```

### Day 2: 核心模組開發

#### 2.1 建立 WASM 管理器 (`js/wasm/whisper-wasm-manager.js`)
```javascript
class WhisperWASMManager {
  constructor() {
    this.isInitialized = false;
    this.wasmModule = null;
    this.availableModels = {
      'tiny': { size: '75MB', file: 'ggml-tiny.bin', speed: '快速', accuracy: '基本' },
      'base': { size: '142MB', file: 'ggml-base.bin', speed: '中等', accuracy: '良好' },
      'small': { size: '466MB', file: 'ggml-small.bin', speed: '較慢', accuracy: '高' }
    };
  }

  async initialize(modelName = 'base') {
    // 初始化 WASM 模組
    // 載入選定的模型
    // 設定 Web Worker
  }

  async transcribe(audioFile, options = {}) {
    // 執行轉譯
    // 返回結果和進度
  }

  getModelInfo() {
    return this.availableModels;
  }
}
```

#### 2.2 建立 Web Worker (`js/workers/whisper-worker.js`)
```javascript
// 處理 WASM 轉譯的 Worker
importScripts('../wasm/whisper.js');

class WhisperWorker {
  async handleTranscription(audioData, modelPath, options) {
    // 在 Worker 中執行轉譯
    // 定期回報進度
    // 返回最終結果
  }
}
```

### Day 3: UI 介面開發

#### 3.1 修改檔案選擇邏輯 (`js/main.js`)
```javascript
// 在現有的 handleFileSelect 中加入大小檢查
async function handleFileSelect(files) {
  const file = files[0];
  const fileSize = file.size;
  const maxAPISize = 25 * 1024 * 1024; // 25MB

  if (fileSize <= maxAPISize) {
    // 使用現有的 API 流程
    await handleAPITranscription(file);
  } else {
    // 顯示選擇對話框
    await showLargeFileOptions(file);
  }
}
```

#### 3.2 建立選擇對話框 UI
在 `index.html` 中加入：
```html
<!-- 大檔案處理選擇對話框 -->
<div class="modal" id="largeFileModal">
  <div class="modal-content">
    <h2>大檔案處理選項</h2>
    <p>檔案大小：<span id="fileSize"></span>（超過 25MB API 限制）</p>
    
    <div class="option-group">
      <label class="option-card">
        <input type="radio" name="transcriptionMethod" value="chunking" checked>
        <div class="option-content">
          <h3>🚀 雲端分割轉譯（推薦）</h3>
          <p>自動分割為小段，使用 OpenAI API</p>
          <p class="option-meta">速度：快 | 精度：最高 | 成本：較高</p>
        </div>
      </label>
      
      <label class="option-card">
        <input type="radio" name="transcriptionMethod" value="local">
        <div class="option-content">
          <h3>🔒 本地轉譯</h3>
          <p>在您的瀏覽器中處理，完全私密</p>
          <p class="option-meta">速度：較慢 | 精度：可選 | 成本：免費</p>
        </div>
      </label>
    </div>

    <div id="localOptions" class="local-options hidden">
      <h4>選擇模型：</h4>
      <div class="model-selection">
        <label><input type="radio" name="model" value="tiny" checked> 快速模式 (75MB)</label>
        <label><input type="radio" name="model" value="base"> 平衡模式 (142MB)</label>
        <label><input type="radio" name="model" value="small"> 高精度模式 (466MB)</label>
      </div>
      <p class="estimate" id="timeEstimate">預估時間：約 20-30 分鐘</p>
    </div>

    <div class="modal-actions">
      <button class="btn btn-secondary" id="cancelLargeFile">取消</button>
      <button class="btn btn-primary" id="startTranscription">開始轉譯</button>
    </div>
  </div>
</div>
```

---

## 📋 第二階段：核心功能實作（3-4 天）

### Day 4: WASM 整合實作

#### 4.1 完成 WhisperWASMManager
```javascript
class WhisperWASMManager {
  async initialize(modelName = 'base') {
    try {
      // 顯示載入進度
      this.showProgress('正在載入 WASM 模組...', 10);
      
      // 載入 WASM
      this.wasmModule = await createWhisperModule();
      this.showProgress('正在載入模型...', 50);
      
      // 載入模型
      const modelPath = `models/${this.availableModels[modelName].file}`;
      await this.loadModel(modelPath);
      
      this.showProgress('初始化完成', 100);
      this.isInitialized = true;
      
    } catch (error) {
      this.handleError('初始化失敗', error);
    }
  }

  async transcribe(audioFile, options = {}) {
    if (!this.isInitialized) {
      throw new Error('WASM 模組尚未初始化');
    }

    // 轉換音訊格式為 WAV 16kHz
    const processedAudio = await this.preprocessAudio(audioFile);
    
    // 執行轉譯
    return new Promise((resolve, reject) => {
      const worker = new Worker('js/workers/whisper-worker.js');
      
      worker.postMessage({
        audioData: processedAudio,
        options: options
      });
      
      worker.onmessage = (event) => {
        const { type, data } = event.data;
        
        if (type === 'progress') {
          this.onProgress?.(data);
        } else if (type === 'result') {
          resolve(data);
        } else if (type === 'error') {
          reject(new Error(data.message));
        }
      };
    });
  }
}
```

### Day 5: 音訊預處理

#### 5.1 建立音訊處理模組 (`js/audio-processor.js`)
```javascript
class AudioProcessor {
  async convertToWAV16k(audioFile) {
    // 使用 Web Audio API 轉換
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await audioFile.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // 重採樣到 16kHz
    const targetSampleRate = 16000;
    const resampledBuffer = await this.resample(audioBuffer, targetSampleRate);
    
    // 轉換為 WAV 格式
    return this.bufferToWAV(resampledBuffer);
  }

  async resample(audioBuffer, targetSampleRate) {
    // 實作重採樣邏輯
  }

  bufferToWAV(buffer) {
    // 實作 WAV 格式轉換
  }
}
```

### Day 6: 進度顯示與錯誤處理

#### 6.1 建立進度顯示組件
```javascript
class TranscriptionProgressUI {
  constructor() {
    this.modal = null;
    this.progressBar = null;
    this.statusText = null;
  }

  show(title = '正在轉譯...') {
    // 建立進度對話框
    this.modal = this.createProgressModal(title);
    document.body.appendChild(this.modal);
  }

  updateProgress(percentage, message) {
    if (this.progressBar) {
      this.progressBar.style.width = `${percentage}%`;
    }
    if (this.statusText) {
      this.statusText.textContent = message;
    }
  }

  hide() {
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
    }
  }
}
```

### Day 7: 整合測試

#### 7.1 整合所有組件
```javascript
// 在 main.js 中整合
class WhisperApp {
  constructor() {
    this.wasmManager = new WhisperWASMManager();
    this.progressUI = new TranscriptionProgressUI();
    this.audioProcessor = new AudioProcessor();
  }

  async handleLargeFileTranscription(file, method, options = {}) {
    if (method === 'local') {
      return await this.handleLocalTranscription(file, options);
    } else {
      return await this.handleChunkingTranscription(file);
    }
  }

  async handleLocalTranscription(file, options) {
    try {
      this.progressUI.show('本地轉譯中...');
      
      // 初始化 WASM（如果尚未初始化）
      if (!this.wasmManager.isInitialized) {
        await this.wasmManager.initialize(options.model || 'base');
      }
      
      // 執行轉譯
      const result = await this.wasmManager.transcribe(file, {
        onProgress: (progress) => {
          this.progressUI.updateProgress(progress.percentage, progress.message);
        }
      });
      
      this.progressUI.hide();
      return result;
      
    } catch (error) {
      this.progressUI.hide();
      this.showError('轉譯失敗', error.message);
      throw error;
    }
  }
}
```

---

## 📋 第三階段：UI 優化與測試（2-3 天）

### Day 8: UI 完善

#### 8.1 加入樣式 (`css/wasm-components.css`)
```css
/* 大檔案選擇對話框樣式 */
.option-group {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin: 1rem 0;
}

.option-card {
  border: 2px solid var(--border-color);
  border-radius: 8px;
  padding: 1rem;
  cursor: pointer;
  transition: all 0.2s;
}

.option-card:hover {
  border-color: var(--primary-color);
  background-color: var(--bg-tertiary);
}

.option-card input[type="radio"]:checked + .option-content {
  color: var(--primary-color);
}

.option-meta {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-top: 0.5rem;
}

/* 進度對話框樣式 */
.progress-modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--bg-primary);
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  z-index: 10000;
  min-width: 400px;
}

.progress-bar-container {
  width: 100%;
  height: 8px;
  background-color: var(--bg-tertiary);
  border-radius: 4px;
  overflow: hidden;
  margin: 1rem 0;
}

.progress-bar {
  height: 100%;
  background-color: var(--primary-color);
  border-radius: 4px;
  transition: width 0.3s ease;
}
```

#### 8.2 加入回應式設計
```css
@media (max-width: 768px) {
  .option-group {
    flex-direction: column;
  }
  
  .progress-modal {
    width: 90%;
    min-width: unset;
  }
}
```

### Day 9: 功能測試

#### 9.1 建立測試腳本
```javascript
// tests/wasm-integration-test.js
class WASMTestSuite {
  async runTests() {
    console.log('🧪 開始 WASM 整合測試...');
    
    await this.testWASMLoading();
    await this.testModelLoading();
    await this.testAudioProcessing();
    await this.testTranscription();
    
    console.log('✅ 所有測試完成');
  }

  async testWASMLoading() {
    // 測試 WASM 模組載入
  }

  async testModelLoading() {
    // 測試模型載入
  }

  async testTranscription() {
    // 使用測試音訊檔案
  }
}
```

#### 9.2 測試檔案準備
```bash
# 準備測試音訊檔案
mkdir tests/audio
# 建立不同大小的測試檔案
# - 小檔案：< 25MB，用於驗證 API 路徑
# - 大檔案：> 25MB，用於測試 WASM 路徑
```

### Day 10: 效能優化

#### 10.1 模型快取策略
```javascript
class ModelCacheManager {
  constructor() {
    this.cachePrefix = 'whisper_model_';
    this.maxCacheSize = 1024 * 1024 * 1024; // 1GB
  }

  async cacheModel(modelName, modelData) {
    // 使用 IndexedDB 快取模型
    // 檢查快取空間
    // 清理舊快取
  }

  async getCachedModel(modelName) {
    // 從快取載入模型
  }

  getCacheStatus() {
    // 返回快取資訊
  }
}
```

#### 10.2 記憶體管理
```javascript
class MemoryManager {
  static checkAvailableMemory() {
    // 檢查可用記憶體
    if ('memory' in performance) {
      return performance.memory;
    }
    return null;
  }

  static recommendModel(fileSize, availableMemory) {
    // 根據檔案大小和可用記憶體推薦模型
    if (availableMemory < 500 * 1024 * 1024) { // < 500MB
      return 'tiny';
    } else if (availableMemory < 1024 * 1024 * 1024) { // < 1GB
      return 'base';
    } else {
      return 'small';
    }
  }
}
```

---

## 📋 第四階段：部署與文件（1-2 天）

### Day 11: 部署準備

#### 11.1 配置檔案更新
```javascript
// js/config.js 更新
const Config = {
  // 現有配置...
  
  // WASM 相關配置
  wasm: {
    enabled: true,
    modelsPath: 'models/',
    defaultModel: 'base',
    maxMemoryMB: 2048,
    chunkSizeSeconds: 30,
    
    // 模型配置
    models: {
      tiny: { file: 'ggml-tiny.bin', size: 75, speed: 3, accuracy: 'basic' },
      base: { file: 'ggml-base.bin', size: 142, speed: 2, accuracy: 'good' },
      small: { file: 'ggml-small.bin', size: 466, speed: 1.5, accuracy: 'high' }
    }
  },
  
  // 檔案處理策略
  fileProcessing: {
    apiSizeLimit: 25 * 1024 * 1024, // 25MB
    autoSplitThreshold: 50 * 1024 * 1024, // 50MB 以上建議分割
    localTranscriptThreshold: 100 * 1024 * 1024 // 100MB 以上建議本地轉譯
  }
};
```

#### 11.2 建置腳本
```bash
#!/bin/bash
# build.sh

echo "📦 開始建置 Whisper WASM 整合版本..."

# 檢查模型檔案
echo "🔍 檢查模型檔案..."
if [ ! -f "models/ggml-base.bin" ]; then
  echo "⚠️  缺少 base 模型，正在下載..."
  curl -L -o models/ggml-base.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
fi

# 壓縮 CSS 和 JS（可選）
echo "🗜️  優化資源..."
# 可以加入 minification 步驟

# 產生版本資訊
echo "📝 產生版本資訊..."
echo "{\"buildTime\":\"$(date)\",\"version\":\"1.0.0-wasm\"}" > version.json

echo "✅ 建置完成！"
```

### Day 12: 文件撰寫

#### 12.1 使用說明文件 (`docs/wasm-integration-guide.md`)
```markdown
# WASM 整合使用指南

## 功能概覽
本版本新增了本地轉譯功能，解決大檔案轉譯限制。

## 使用流程
1. 選擇音訊檔案
2. 如果檔案 > 25MB，系統會提供選擇
3. 選擇轉譯方式並開始處理

## 模型選擇建議
- **tiny**: 適合快速預覽，品質基本
- **base**: 平衡選擇，推薦日常使用  
- **small**: 高品質要求，但速度較慢

## 常見問題
Q: 為什麼本地轉譯比較慢？
A: 本地轉譯使用您電腦的 CPU，速度取決於硬體效能。

Q: 模型檔案會一直佔用空間嗎？
A: 模型會快取在瀏覽器中，可以在設定中清除。
```

#### 12.2 開發者文件 (`docs/developer-notes.md`)
```markdown
# 開發者筆記

## 架構說明
- WASM 模組：處理音訊轉譯
- Web Worker：避免阻塞主執行緒
- IndexedDB：模型快取

## 關鍵決策
1. 為什麼選擇 base 模型作為預設？
2. 記憶體管理策略
3. 錯誤處理機制

## 未來改進方向
1. 支援更多音訊格式
2. 串流轉譯功能
3. 批次處理優化
```

---

## 🎯 驗收標準

### 功能要求
- [ ] 大檔案（>25MB）可選擇本地轉譯
- [ ] 支援 tiny/base/small 三種模型
- [ ] 顯示清楚的進度和時間預估
- [ ] 模型自動快取，減少重複下載
- [ ] 錯誤處理完善，有明確的錯誤訊息

### 效能要求
- [ ] tiny 模型：60 秒音訊 ≤ 30 秒轉譯
- [ ] base 模型：60 秒音訊 ≤ 40 秒轉譯  
- [ ] 首次模型載入 ≤ 60 秒
- [ ] 記憶體使用 ≤ 2GB

### 使用者體驗要求
- [ ] 介面直觀，選擇清楚
- [ ] 進度顯示準確
- [ ] 支援取消操作
- [ ] 離線功能正常（模型已快取時）

---

## 🚨 風險管控

### 技術風險
1. **瀏覽器相容性**
   - 風險：舊瀏覽器不支援 WASM SIMD
   - 對策：功能檢測 + 降級方案

2. **記憶體不足**
   - 風險：大模型 + 大檔案導致記憶體溢出
   - 對策：動態模型推薦 + 記憶體監控

3. **效能不佳**
   - 風險：轉譯時間過長影響使用體驗
   - 對策：明確預期設定 + 進度顯示

### 使用風險
1. **使用者困惑**
   - 風險：不理解本地轉譯的優缺點
   - 對策：清楚的說明文字 + 推薦選項

2. **頻寬消耗**
   - 風險：首次下載模型消耗流量
   - 對策：清楚的下載提示 + 大小顯示

---

## 📊 成功指標

### 技術指標
- 轉譯成功率 > 95%
- 大檔案處理能力：無大小限制
- 系統穩定性：無記憶體洩漏

### 使用指標  
- 大檔案使用本地轉譯的比例
- 使用者滿意度回饋
- 支援請求數量減少

---

## 🔄 後續發展

### Phase 2（1個月後）
1. 支援更多模型（medium, large）
2. 串流轉譯（即時處理）
3. 音訊品質自動優化

### Phase 3（3個月後）
1. 多語言模型支援
2. 自訂模型上傳
3. 批次處理介面

---

## 📞 支援資源

- **技術支援**：[GitHub Issues](https://github.com/ggml-org/whisper.cpp/issues)
- **社群討論**：[Whisper.cpp Discussions](https://github.com/ggml-org/whisper.cpp/discussions)
- **官方文檔**：[Whisper.cpp README](https://github.com/ggml-org/whisper.cpp)

---

**總計開發時間：10-12 天**
**團隊需求：1-2 名前端開發者**
**技術難度：中等**