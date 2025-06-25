# Whisper WASM 實現技術方案

## 一、專案概述

### 1.1 背景說明

目前 Whisper 聽打工具的「本地 WASM 轉譯」實際上使用 Transformers.js（JavaScript 實現），而非真正的 WebAssembly。這導致：

- **效能低落**：JavaScript 執行效率遠低於原生 WASM
- **記憶體效率差**：無法利用 WASM 的線性記憶體優勢
- **依賴外部資源**：需要從 CDN 載入庫和模型
- **大檔案處理困難**：容易出現記憶體溢出

### 1.2 目標與預期成果

實現真正的 WebAssembly 版本 Whisper，達到：

- **效能提升 10-50 倍**：接近原生執行速度
- **記憶體使用減少 50%**：利用 WASM 記憶體管理
- **完全離線運行**：所有資源本地化
- **支援大檔案**：流式處理，避免記憶體爆炸

### 1.3 技術選型

- **核心引擎**：whisper.cpp（C++ 實現）
- **編譯工具**：Emscripten 3.1.50+
- **構建系統**：CMake 3.20+
- **模型格式**：GGML/GGUF
- **介面設計**：TypeScript + Web Workers

## 二、技術架構設計

### 2.1 整體架構

```
┌─────────────────────────────────────────────────┐
│                   應用層                        │
│            (React/Vue/原生 JS)                  │
├─────────────────────────────────────────────────┤
│              WhisperWASM API                    │
│         (TypeScript 介面封裝)                   │
├─────────────────────────────────────────────────┤
│              Web Worker 層                      │
│         (隔離執行，避免阻塞 UI)                │
├─────────────────────────────────────────────────┤
│           WASM Bridge Layer                     │
│      (JavaScript ⟷ WebAssembly)               │
├─────────────────────────────────────────────────┤
│           WebAssembly Module                    │
│      (whisper.cpp 編譯產物)                    │
├─────────────────────────────────────────────────┤
│          瀏覽器 WASM Runtime                   │
└─────────────────────────────────────────────────┘
```

### 2.2 模組設計

#### 2.2.1 核心 WASM 模組

```cpp
// bindings.cpp - WASM 綁定層
#include <emscripten/bind.h>
#include "whisper.h"

class WhisperWASM {
private:
    whisper_context* ctx;
    whisper_full_params params;
    
public:
    WhisperWASM() : ctx(nullptr) {
        params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    }
    
    bool loadModel(const std::string& model_path) {
        ctx = whisper_init_from_file(model_path.c_str());
        return ctx != nullptr;
    }
    
    std::string transcribe(const std::vector<float>& audio_data) {
        if (!ctx) return "";
        
        int result = whisper_full(
            ctx, 
            params, 
            audio_data.data(), 
            audio_data.size()
        );
        
        if (result != 0) return "";
        
        // 組合所有段落
        std::string text;
        int n_segments = whisper_full_n_segments(ctx);
        for (int i = 0; i < n_segments; ++i) {
            text += whisper_full_get_segment_text(ctx, i);
            text += " ";
        }
        
        return text;
    }
    
    ~WhisperWASM() {
        if (ctx) whisper_free(ctx);
    }
};

// Emscripten 綁定
EMSCRIPTEN_BINDINGS(whisper_wasm) {
    emscripten::class_<WhisperWASM>("WhisperWASM")
        .constructor()
        .function("loadModel", &WhisperWASM::loadModel)
        .function("transcribe", &WhisperWASM::transcribe);
        
    emscripten::register_vector<float>("FloatVector");
}
```

#### 2.2.2 JavaScript 介面層

```typescript
// whisper-wasm-interface.ts
export interface WhisperWASMOptions {
  modelPath: string;
  language?: string;
  task?: 'transcribe' | 'translate';
  temperature?: number;
  maxSegmentLength?: number;
  suppressBlank?: boolean;
  suppressNonSpeechTokens?: boolean;
}

export interface TranscriptionResult {
  text: string;
  segments: TranscriptionSegment[];
  language: string;
  duration: number;
}

export interface TranscriptionSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avgLogprob: number;
  compressionRatio: number;
  noSpeechProb: number;
}

export class WhisperWASM {
  private module: any;
  private instance: any;
  private worker: Worker;
  
  constructor() {
    this.worker = new Worker('/workers/whisper-wasm-worker.js');
  }
  
  async initialize(options: WhisperWASMOptions): Promise<void> {
    // 載入 WASM 模組
    this.module = await this.loadWASMModule();
    
    // 創建實例
    this.instance = new this.module.WhisperWASM();
    
    // 載入模型
    const modelLoaded = await this.loadModel(options.modelPath);
    if (!modelLoaded) {
      throw new Error('Failed to load model');
    }
  }
  
  private async loadWASMModule(): Promise<any> {
    // 載入編譯的 WASM 模組
    const Module = await import('./whisper-wasm.js');
    
    // 等待 WASM 初始化
    await Module.default.ready;
    
    return Module.default;
  }
  
  private async loadModel(modelPath: string): Promise<boolean> {
    // 從 IndexedDB 或網路載入模型
    const modelData = await this.fetchModel(modelPath);
    
    // 寫入 WASM 檔案系統
    const FS = this.module.FS;
    FS.writeFile('/model.bin', modelData);
    
    // 載入到 Whisper 上下文
    return this.instance.loadModel('/model.bin');
  }
  
  async transcribe(audioData: Float32Array): Promise<TranscriptionResult> {
    return new Promise((resolve, reject) => {
      // 發送到 Worker 處理
      this.worker.postMessage({
        cmd: 'transcribe',
        audioData: audioData
      }, [audioData.buffer]);
      
      this.worker.onmessage = (e) => {
        if (e.data.error) {
          reject(new Error(e.data.error));
        } else {
          resolve(e.data.result);
        }
      };
    });
  }
  
  async transcribeStream(
    audioStream: ReadableStream<Float32Array>,
    onSegment: (segment: TranscriptionSegment) => void
  ): Promise<void> {
    const reader = audioStream.getReader();
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        // 處理音訊片段
        const result = await this.transcribe(value);
        
        // 回調每個段落
        result.segments.forEach(segment => onSegment(segment));
      }
    } finally {
      reader.releaseLock();
    }
  }
  
  dispose(): void {
    if (this.instance) {
      this.instance.delete();
    }
    if (this.worker) {
      this.worker.terminate();
    }
  }
}
```

#### 2.2.3 Web Worker 實現

```javascript
// whisper-wasm-worker.js
let whisperInstance = null;

// 載入 WASM 模組
importScripts('/wasm/whisper-wasm.js');

// 初始化 Whisper
async function initializeWhisper(modelPath) {
  const Module = await WhisperWASMModule();
  whisperInstance = new Module.WhisperWASM();
  
  // 載入模型
  const response = await fetch(modelPath);
  const modelData = await response.arrayBuffer();
  
  // 寫入虛擬檔案系統
  const modelArray = new Uint8Array(modelData);
  Module.FS.writeFile('/model.bin', modelArray);
  
  // 載入模型
  const success = whisperInstance.loadModel('/model.bin');
  return success;
}

// 處理轉譯請求
async function processTranscription(audioData) {
  if (!whisperInstance) {
    throw new Error('Whisper not initialized');
  }
  
  // 轉換為 WASM 期望的格式
  const audioVector = new Module.FloatVector();
  for (let i = 0; i < audioData.length; i++) {
    audioVector.push_back(audioData[i]);
  }
  
  // 執行轉譯
  const result = whisperInstance.transcribe(audioVector);
  
  // 清理
  audioVector.delete();
  
  return result;
}

// Worker 訊息處理
self.onmessage = async (e) => {
  const { cmd, data } = e.data;
  
  try {
    switch (cmd) {
      case 'init':
        const success = await initializeWhisper(data.modelPath);
        self.postMessage({ success });
        break;
        
      case 'transcribe':
        const result = await processTranscription(data.audioData);
        self.postMessage({ result });
        break;
        
      case 'dispose':
        if (whisperInstance) {
          whisperInstance.delete();
          whisperInstance = null;
        }
        self.postMessage({ disposed: true });
        break;
    }
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
```

### 2.3 編譯配置

#### 2.3.1 CMakeLists.txt

```cmake
cmake_minimum_required(VERSION 3.20)
project(whisper-wasm)

set(CMAKE_CXX_STANDARD 17)

# Emscripten 設定
if(EMSCRIPTEN)
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -s WASM=1")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -s ALLOW_MEMORY_GROWTH=1")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -s MAXIMUM_MEMORY=4GB")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -s EXPORTED_RUNTIME_METHODS='[\"FS\",\"cwrap\",\"ccall\"]'")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -s MODULARIZE=1")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -s EXPORT_NAME='WhisperWASMModule'")
    
    # 優化選項
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -O3")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -msimd128") # 啟用 SIMD
    
    # 多線程支援（需要特殊 HTTP headers）
    # set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -s USE_PTHREADS=1")
    # set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -s PTHREAD_POOL_SIZE=4")
endif()

# 添加 whisper.cpp
add_subdirectory(whisper.cpp)

# WASM 綁定
add_executable(whisper-wasm bindings.cpp)
target_link_libraries(whisper-wasm whisper)

# Emscripten 綁定
if(EMSCRIPTEN)
    set_target_properties(whisper-wasm PROPERTIES
        LINK_FLAGS "--bind -s FORCE_FILESYSTEM=1"
    )
endif()
```

#### 2.3.2 編譯腳本

```bash
#!/bin/bash
# build-wasm.sh

# 設定 Emscripten 環境
source /path/to/emsdk/emsdk_env.sh

# 創建構建目錄
mkdir -p build-wasm
cd build-wasm

# 配置 CMake
emcmake cmake .. \
    -DCMAKE_BUILD_TYPE=Release \
    -DWHISPER_BUILD_TESTS=OFF \
    -DWHISPER_BUILD_EXAMPLES=OFF

# 編譯
emmake make -j4

# 複製輸出檔案
cp whisper-wasm.js ../dist/
cp whisper-wasm.wasm ../dist/

echo "Build complete!"
```

### 2.4 模型管理

#### 2.4.1 模型轉換工具

```python
# convert-model.py
import struct
import numpy as np
from whisper import load_model

def convert_to_ggml(model_name, output_path):
    """將 PyTorch 模型轉換為 GGML 格式"""
    
    # 載入原始模型
    model = load_model(model_name)
    
    # 提取權重
    weights = {}
    for name, param in model.named_parameters():
        weights[name] = param.cpu().numpy()
    
    # 寫入 GGML 格式
    with open(output_path, 'wb') as f:
        # 寫入魔術數字
        f.write(struct.pack('I', 0x67676d6c))  # 'ggml'
        
        # 寫入模型參數
        f.write(struct.pack('I', model.dims.n_mels))
        f.write(struct.pack('I', model.dims.n_vocab))
        f.write(struct.pack('I', model.dims.n_audio_ctx))
        f.write(struct.pack('I', model.dims.n_audio_state))
        f.write(struct.pack('I', model.dims.n_audio_head))
        f.write(struct.pack('I', model.dims.n_audio_layer))
        
        # 寫入權重
        for name, weight in weights.items():
            # 寫入張量名稱
            name_bytes = name.encode('utf-8')
            f.write(struct.pack('I', len(name_bytes)))
            f.write(name_bytes)
            
            # 寫入張量維度
            f.write(struct.pack('I', len(weight.shape)))
            for dim in weight.shape:
                f.write(struct.pack('I', dim))
            
            # 寫入張量資料
            weight_bytes = weight.astype(np.float32).tobytes()
            f.write(weight_bytes)
    
    print(f"Model converted to {output_path}")

# 轉換所有模型大小
for size in ['tiny', 'base', 'small']:
    convert_to_ggml(size, f'whisper-{size}.ggml')
```

#### 2.4.2 模型載入器

```typescript
// model-loader.ts
export class ModelLoader {
  private cache: Map<string, ArrayBuffer> = new Map();
  
  async loadModel(modelName: string): Promise<ArrayBuffer> {
    // 檢查快取
    if (this.cache.has(modelName)) {
      return this.cache.get(modelName)!;
    }
    
    // 檢查 IndexedDB
    const cachedModel = await this.loadFromIndexedDB(modelName);
    if (cachedModel) {
      this.cache.set(modelName, cachedModel);
      return cachedModel;
    }
    
    // 從網路下載
    const modelData = await this.downloadModel(modelName);
    
    // 儲存到 IndexedDB
    await this.saveToIndexedDB(modelName, modelData);
    
    // 加入快取
    this.cache.set(modelName, modelData);
    
    return modelData;
  }
  
  private async loadFromIndexedDB(modelName: string): Promise<ArrayBuffer | null> {
    return new Promise((resolve) => {
      const request = indexedDB.open('WhisperModels', 1);
      
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['models'], 'readonly');
        const store = transaction.objectStore('models');
        const getRequest = store.get(modelName);
        
        getRequest.onsuccess = () => {
          resolve(getRequest.result?.data || null);
        };
      };
      
      request.onerror = () => resolve(null);
    });
  }
  
  private async downloadModel(modelName: string): Promise<ArrayBuffer> {
    const response = await fetch(`/models/whisper-${modelName}.ggml`);
    if (!response.ok) {
      throw new Error(`Failed to download model: ${response.statusText}`);
    }
    
    return response.arrayBuffer();
  }
  
  private async saveToIndexedDB(modelName: string, data: ArrayBuffer): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('WhisperModels', 1);
      
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('models')) {
          db.createObjectStore('models', { keyPath: 'name' });
        }
      };
      
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['models'], 'readwrite');
        const store = transaction.objectStore('models');
        
        store.put({
          name: modelName,
          data: data,
          timestamp: Date.now()
        });
        
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }
}
```

## 三、效能優化策略

### 3.1 SIMD 優化

```cpp
// 使用 WASM SIMD 指令集優化
#ifdef __wasm_simd128__
#include <wasm_simd128.h>

void dot_product_simd(const float* a, const float* b, float* result, int n) {
    v128_t sum = wasm_f32x4_splat(0.0f);
    
    for (int i = 0; i < n; i += 4) {
        v128_t va = wasm_v128_load(&a[i]);
        v128_t vb = wasm_v128_load(&b[i]);
        sum = wasm_f32x4_add(sum, wasm_f32x4_mul(va, vb));
    }
    
    // 水平求和
    float sum_array[4];
    wasm_v128_store(sum_array, sum);
    *result = sum_array[0] + sum_array[1] + sum_array[2] + sum_array[3];
}
#endif
```

### 3.2 記憶體優化

```typescript
// 音訊流式處理，避免大量記憶體使用
export class AudioStreamProcessor {
  private chunkSize = 30 * 16000; // 30 秒音訊
  private overlap = 1 * 16000;     // 1 秒重疊
  
  async *processAudioStream(audioBuffer: AudioBuffer): AsyncGenerator<Float32Array> {
    const audioData = audioBuffer.getChannelData(0);
    const totalSamples = audioData.length;
    
    for (let start = 0; start < totalSamples; start += this.chunkSize - this.overlap) {
      const end = Math.min(start + this.chunkSize, totalSamples);
      const chunk = audioData.slice(start, end);
      
      // 加窗處理，減少邊界效應
      if (start > 0) {
        this.applyWindow(chunk, 0, this.overlap);
      }
      if (end < totalSamples) {
        this.applyWindow(chunk, chunk.length - this.overlap, chunk.length);
      }
      
      yield chunk;
    }
  }
  
  private applyWindow(data: Float32Array, start: number, end: number): void {
    const windowSize = end - start;
    for (let i = 0; i < windowSize; i++) {
      const factor = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / windowSize);
      data[start + i] *= factor;
    }
  }
}
```

### 3.3 多線程支援（需要特殊配置）

```javascript
// whisper-wasm-parallel.js
class ParallelWhisperProcessor {
  constructor(numWorkers = 4) {
    this.workers = [];
    this.taskQueue = [];
    
    // 創建 Worker 池
    for (let i = 0; i < numWorkers; i++) {
      const worker = new Worker('/workers/whisper-wasm-worker.js');
      this.workers.push({
        id: i,
        worker: worker,
        busy: false
      });
    }
  }
  
  async processParallel(audioChunks) {
    const promises = audioChunks.map((chunk, index) => {
      return this.processChunk(chunk, index);
    });
    
    const results = await Promise.all(promises);
    return this.mergeResults(results);
  }
  
  private async processChunk(chunk, index) {
    // 找到空閒的 Worker
    const worker = await this.getAvailableWorker();
    worker.busy = true;
    
    return new Promise((resolve, reject) => {
      worker.worker.postMessage({
        cmd: 'transcribe',
        data: { audioData: chunk, index }
      });
      
      worker.worker.onmessage = (e) => {
        worker.busy = false;
        if (e.data.error) {
          reject(e.data.error);
        } else {
          resolve(e.data.result);
        }
      };
    });
  }
  
  private async getAvailableWorker() {
    while (true) {
      const worker = this.workers.find(w => !w.busy);
      if (worker) return worker;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
}
```

## 四、整合方案

### 4.1 整合到現有系統

```typescript
// whisper-wasm-adapter.ts
import { WhisperWASM } from './whisper-wasm-interface';

export class WhisperWASMAdapter {
  private wasmInstance: WhisperWASM | null = null;
  
  async initialize(modelName: string): Promise<void> {
    // 初始化 WASM
    this.wasmInstance = new WhisperWASM();
    
    await this.wasmInstance.initialize({
      modelPath: `/models/whisper-${modelName}.ggml`,
      language: 'zh',
      task: 'transcribe'
    });
  }
  
  async transcribe(audioFile: File, options: any): Promise<any> {
    if (!this.wasmInstance) {
      throw new Error('WASM not initialized');
    }
    
    // 讀取音訊檔案
    const audioBuffer = await this.decodeAudioFile(audioFile);
    
    // 轉換為單聲道 16kHz
    const audioData = this.preprocessAudio(audioBuffer);
    
    // 執行轉譯
    const result = await this.wasmInstance.transcribe(audioData);
    
    // 格式化結果以符合現有介面
    return this.formatResult(result);
  }
  
  private async decodeAudioFile(file: File): Promise<AudioBuffer> {
    const arrayBuffer = await file.arrayBuffer();
    const audioContext = new AudioContext();
    return await audioContext.decodeAudioData(arrayBuffer);
  }
  
  private preprocessAudio(audioBuffer: AudioBuffer): Float32Array {
    // 重採樣到 16kHz
    const targetSampleRate = 16000;
    const sourceSampleRate = audioBuffer.sampleRate;
    const ratio = sourceSampleRate / targetSampleRate;
    
    const sourceData = audioBuffer.getChannelData(0);
    const targetLength = Math.floor(sourceData.length / ratio);
    const targetData = new Float32Array(targetLength);
    
    // 簡單的線性插值重採樣
    for (let i = 0; i < targetLength; i++) {
      const sourceIndex = i * ratio;
      const index = Math.floor(sourceIndex);
      const fraction = sourceIndex - index;
      
      if (index + 1 < sourceData.length) {
        targetData[i] = sourceData[index] * (1 - fraction) + 
                       sourceData[index + 1] * fraction;
      } else {
        targetData[i] = sourceData[index];
      }
    }
    
    return targetData;
  }
  
  private formatResult(wasmResult: any): any {
    // 轉換為現有系統期望的格式
    return {
      text: wasmResult.text,
      segments: wasmResult.segments.map(seg => ({
        start: seg.start,
        end: seg.end,
        text: seg.text,
        edited: false,
        isEdited: false
      })),
      language: 'zh',
      task: 'transcribe',
      duration: wasmResult.duration
    };
  }
  
  dispose(): void {
    if (this.wasmInstance) {
      this.wasmInstance.dispose();
      this.wasmInstance = null;
    }
  }
}
```

### 4.2 修改現有 WhisperWASMManager

```typescript
// 修改 whisper-wasm-manager.js
async loadWASMModule() {
  // 不再是 TODO！
  try {
    // 使用新的 WASM 實現
    const { WhisperWASMAdapter } = await import('./wasm/whisper-wasm-adapter.js');
    this.wasmAdapter = new WhisperWASMAdapter();
    
    console.log('✅ 真實 WASM 模組載入成功');
    return true;
  } catch (error) {
    console.error('WASM 載入失敗:', error);
    throw error;
  }
}

async transcribe(audioFile, options = {}) {
  if (this.ENABLE_REAL_WASM && this.wasmAdapter) {
    // 使用真實 WASM
    console.log('使用真實 WASM 轉譯');
    return await this.wasmAdapter.transcribe(audioFile, options);
  } else {
    // 降級到 Transformers.js
    console.log('降級到 Transformers.js');
    return await super.transcribe(audioFile, options);
  }
}
```

## 五、測試方案

### 5.1 單元測試

```typescript
// whisper-wasm.test.ts
import { WhisperWASM } from '../src/whisper-wasm-interface';

describe('WhisperWASM', () => {
  let whisper: WhisperWASM;
  
  beforeEach(async () => {
    whisper = new WhisperWASM();
    await whisper.initialize({
      modelPath: '/test/models/whisper-tiny.ggml'
    });
  });
  
  afterEach(() => {
    whisper.dispose();
  });
  
  test('should transcribe audio correctly', async () => {
    // 載入測試音訊
    const audioData = await loadTestAudio('test.wav');
    
    // 執行轉譯
    const result = await whisper.transcribe(audioData);
    
    // 驗證結果
    expect(result.text).toBeTruthy();
    expect(result.segments.length).toBeGreaterThan(0);
    expect(result.language).toBe('zh');
  });
  
  test('should handle streaming transcription', async () => {
    const audioStream = createTestAudioStream();
    const segments: any[] = [];
    
    await whisper.transcribeStream(audioStream, (segment) => {
      segments.push(segment);
    });
    
    expect(segments.length).toBeGreaterThan(0);
  });
});
```

### 5.2 效能測試

```typescript
// performance-test.ts
async function performanceTest() {
  const testFiles = [
    { name: '1分鐘音訊', size: 1 },
    { name: '5分鐘音訊', size: 5 },
    { name: '30分鐘音訊', size: 30 },
    { name: '60分鐘音訊', size: 60 }
  ];
  
  console.log('效能測試開始...\n');
  
  for (const testFile of testFiles) {
    console.log(`測試 ${testFile.name}:`);
    
    // 測試 Transformers.js
    const jsStart = performance.now();
    await testTransformersJS(testFile);
    const jsTime = performance.now() - jsStart;
    
    // 測試 WASM
    const wasmStart = performance.now();
    await testWASM(testFile);
    const wasmTime = performance.now() - wasmStart;
    
    // 計算提升
    const speedup = jsTime / wasmTime;
    
    console.log(`  Transformers.js: ${(jsTime / 1000).toFixed(2)}秒`);
    console.log(`  WASM: ${(wasmTime / 1000).toFixed(2)}秒`);
    console.log(`  速度提升: ${speedup.toFixed(1)}x\n`);
  }
}
```

### 5.3 記憶體測試

```javascript
// memory-test.js
async function memoryTest() {
  const memoryStats = {
    before: getMemoryUsage(),
    during: null,
    after: null
  };
  
  // 載入大檔案
  const largeAudio = await loadLargeAudioFile('60min.wav');
  memoryStats.during = getMemoryUsage();
  
  // 執行轉譯
  await whisper.transcribe(largeAudio);
  
  // 清理
  largeAudio = null;
  if (global.gc) global.gc();
  
  memoryStats.after = getMemoryUsage();
  
  console.log('記憶體使用報告:');
  console.log(`  載入前: ${formatBytes(memoryStats.before)}`);
  console.log(`  處理中: ${formatBytes(memoryStats.during)}`);
  console.log(`  完成後: ${formatBytes(memoryStats.after)}`);
}

function getMemoryUsage() {
  if (performance.memory) {
    return performance.memory.usedJSHeapSize;
  }
  return 0;
}
```

## 六、部署方案

### 6.1 構建流程

```yaml
# .github/workflows/build-wasm.yml
name: Build WASM

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
      with:
        submodules: recursive
    
    - name: Setup Emscripten
      uses: mymindstorm/setup-emsdk@v11
      with:
        version: 3.1.50
    
    - name: Setup CMake
      uses: jwlawson/actions-setup-cmake@v1.13
      with:
        cmake-version: '3.25.0'
    
    - name: Build WASM
      run: |
        mkdir build-wasm
        cd build-wasm
        emcmake cmake .. -DCMAKE_BUILD_TYPE=Release
        emmake make -j4
    
    - name: Run Tests
      run: |
        npm test
    
    - name: Upload Artifacts
      uses: actions/upload-artifact@v3
      with:
        name: wasm-artifacts
        path: |
          dist/whisper-wasm.js
          dist/whisper-wasm.wasm
          dist/whisper-wasm.worker.js
```

### 6.2 發布配置

```javascript
// webpack.config.js
module.exports = {
  entry: './src/index.ts',
  output: {
    filename: 'whisper-wasm-bundle.js',
    path: path.resolve(__dirname, 'dist'),
    library: 'WhisperWASM',
    libraryTarget: 'umd'
  },
  module: {
    rules: [
      {
        test: /\.wasm$/,
        type: 'asset/resource',
        generator: {
          filename: 'wasm/[name][ext]'
        }
      }
    ]
  },
  experiments: {
    asyncWebAssembly: true
  }
};
```

### 6.3 CDN 部署

```nginx
# nginx.conf
location /wasm/ {
    add_header Cross-Origin-Embedder-Policy "require-corp";
    add_header Cross-Origin-Opener-Policy "same-origin";
    add_header Cache-Control "public, max-age=31536000";
    
    # WASM MIME type
    location ~ \.wasm$ {
        add_header Content-Type "application/wasm";
    }
}
```

## 七、效能基準

### 7.1 預期效能指標

| 指標 | Transformers.js | WASM (預期) | 提升倍數 |
|------|----------------|-------------|----------|
| 1分鐘音訊 | 15秒 | 1秒 | 15x |
| 5分鐘音訊 | 75秒 | 5秒 | 15x |
| 30分鐘音訊 | 450秒 | 30秒 | 15x |
| 記憶體使用 | 500MB | 200MB | 2.5x |
| 初始化時間 | 5秒 | 1秒 | 5x |

### 7.2 支援的功能

| 功能 | 支援情況 | 備註 |
|------|----------|------|
| 基本轉譯 | ✅ | 完整支援 |
| 多語言 | ✅ | 支援 99 種語言 |
| 翻譯模式 | ✅ | 翻譯為英文 |
| 時間戳 | ✅ | 精確到毫秒 |
| VAD | ✅ | 語音活動檢測 |
| 流式處理 | ✅ | 即時轉譯 |
| 多線程 | ⚠️ | 需要特殊配置 |
| GPU 加速 | ❌ | 未來支援 WebGPU |

## 八、問題與解決方案

### 8.1 常見問題

**問題1：SharedArrayBuffer 不可用**
```javascript
// 解決方案：降級到單線程模式
if (typeof SharedArrayBuffer === 'undefined') {
  console.warn('SharedArrayBuffer 不可用，使用單線程模式');
  config.numThreads = 1;
}
```

**問題2：記憶體限制**
```javascript
// 解決方案：動態調整處理策略
if (audioSize > MEMORY_LIMIT) {
  // 使用流式處理
  return processInStreaming(audio);
} else {
  // 一次性處理
  return processAtOnce(audio);
}
```

**問題3：模型載入失敗**
```javascript
// 解決方案：多重降級策略
try {
  await loadFromIndexedDB();
} catch {
  try {
    await loadFromNetwork();
  } catch {
    await loadFromCDN();
  }
}
```

### 8.2 調試工具

```javascript
// debug-utils.js
export class WhisperDebugger {
  static enableVerboseLogging() {
    Module.ccall('whisper_set_log_level', null, ['number'], [4]);
  }
  
  static measurePerformance(name, fn) {
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;
    
    console.log(`[Performance] ${name}: ${duration.toFixed(2)}ms`);
    return result;
  }
  
  static dumpMemoryStats() {
    const used = Module.HEAP8.length;
    const total = Module.HEAP8.buffer.byteLength;
    
    console.log(`[Memory] Used: ${formatBytes(used)}, Total: ${formatBytes(total)}`);
  }
}
```

## 九、里程碑與時程

### 第一階段：原型驗證（2週）
- [ ] 編譯 whisper.cpp 為 WASM
- [ ] 實現基本 JavaScript 綁定
- [ ] 驗證基本轉譯功能
- [ ] 效能基準測試

### 第二階段：功能完善（3週）
- [ ] 實現完整 API 介面
- [ ] 添加流式處理支援
- [ ] 實現模型管理系統
- [ ] 優化記憶體使用

### 第三階段：整合測試（2週）
- [ ] 整合到現有系統
- [ ] 完整功能測試
- [ ] 效能優化
- [ ] 錯誤處理完善

### 第四階段：部署發布（1週）
- [ ] 構建自動化
- [ ] 文檔撰寫
- [ ] 示例程式
- [ ] 正式發布

## 十、總結

實現真正的 WASM 版本 Whisper 將帶來：

1. **顯著的效能提升**（10-50倍）
2. **更低的記憶體使用**（減少 50%）
3. **真正的離線能力**（無需外部依賴）
4. **更好的使用體驗**（快速、穩定）

透過循序漸進的開發和嚴謹的測試，我們可以在 8 週內完成整個專案，為使用者提供企業級的本地語音轉譯解決方案。