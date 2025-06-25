/**
 * 增強版轉譯預處理器
 * 整合新的進度管理器，提供更好的視覺回饋
 */

import { showProgress, showProcessingProgress } from './progress-manager.js';
import { AudioCompressor } from './audio-compressor.js';
import { AudioSplitter } from './audio-splitter.js';
import { WhisperWASMManager } from './wasm/whisper-wasm-manager.js';
import { dialog } from './dialog.js';
import { notify } from './notification.js';

export class TranscriptionPreprocessorEnhanced {
  constructor() {
    this.maxFileSize = 25 * 1024 * 1024; // 25MB
    this.ENABLE_WASM = true; // WASM 功能開關
    this.ENABLE_REAL_WASM = false; // 是否使用真實 WASM（false = 模擬模式）

    // 處理選項配置
    this.processingOptions = {
      split: {
        name: '智慧分割',
        icon: '✂️',
        description: '將音訊分割成多個小片段，分別轉譯後合併',
        details: [
          '根據靜音偵測自動分割',
          '保持每段在限制大小內',
          '智能重疊避免遺漏內容',
          '適合長時間錄音'
        ]
      },
      compress: {
        name: '智慧壓縮',
        icon: '🗜️',
        description: '降低音質以減少檔案大小',
        details: [
          '自動選擇最佳壓縮率',
          '保持語音清晰度',
          '支援多種壓縮等級',
          '適合高品質錄音'
        ]
      },
      hybrid: {
        name: '混合模式',
        icon: '🔄',
        description: '結合壓縮和分割，達到最佳平衡',
        details: [
          '先壓縮再分割',
          '最大化處理效率',
          '適應各種檔案類型',
          '推薦選項'
        ]
      }
    };
  }

  /**
   * 準備轉譯檔案（增強版）
   */
  async prepareForTranscription(file) {
    // 第一步：選擇轉譯方式
    const method = await this.showMethodChoice(file);
    if (!method) return null;

    if (method === 'local') {
      // 本地 WASM 轉譯
      return await this.prepareWASMTranscription(file);
    } else {
      // API 轉譯
      if (file.size <= this.maxFileSize) {
        return { strategy: 'direct', files: [file] };
      }

      // 大檔案需要處理
      const fileInfo = this.analyzeFile(file);
      const strategy = await this.showProcessingOptions(fileInfo);

      if (!strategy) return null;

      return await this.processFileWithProgress(file, strategy);
    }
  }

  /**
   * 處理檔案並顯示進度
   */
  async processFileWithProgress(file, strategy) {
    const stages = this.getProcessingStages(strategy);
    let progressControl = null;
    let cancelled = false;

    try {
      progressControl = showProcessingProgress(
        `${this.processingOptions[strategy].name}處理中`,
        stages,
        () => {
          cancelled = true;
          notify.warning('處理已取消');
        }
      );

      // 根據策略處理
      let result = null;

      switch (strategy) {
        case 'split':
          result = await this.splitWithProgress(file, progressControl, cancelled);
          break;

        case 'compress':
          result = await this.compressWithProgress(file, progressControl, cancelled);
          break;

        case 'hybrid':
          result = await this.hybridWithProgress(file, progressControl, cancelled);
          break;
      }

      if (!cancelled && result) {
        progressControl.complete();
        return result;
      }

      return null;

    } catch (error) {
      if (progressControl) {
        progressControl.error(`處理失敗: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * 分割處理（帶進度）
   */
  async splitWithProgress(file, progressControl, cancelled) {
    const splitter = new AudioSplitter();

    progressControl.setStage(0); // 分析音訊
    progressControl.addDetail('檔案名稱', file.name);
    progressControl.addDetail('原始大小', this.formatFileSize(file.size));

    if (cancelled()) return null;

    progressControl.setStage(1); // 檢測分割點
    const segments = await splitter.split(file, {
      onProgress: (progress) => {
        progressControl.update(progress.percentage * 0.3); // 前30%用於分割
        progressControl.setMessage(progress.message);
      }
    });

    if (cancelled()) return null;

    progressControl.setStage(2); // 生成片段
    progressControl.addDetail('片段數量', segments.length);

    // 顯示分段進度
    const segmentProgress = progressControl.showSegmentProgress?.(segments.length);

    const processedSegments = [];
    for (let i = 0; i < segments.length; i++) {
      if (cancelled()) return null;

      segmentProgress?.setSegmentStatus(i, 'processing');
      progressControl.update(30 + (i / segments.length) * 60); // 30-90%
      progressControl.setMessage(`處理片段 ${i + 1}/${segments.length}`);

      processedSegments.push(segments[i]);
      segmentProgress?.setSegmentStatus(i, 'completed');
    }

    progressControl.setStage(3); // 準備完成
    progressControl.update(95);

    return {
      strategy: 'split',
      files: processedSegments,
      metadata: {
        originalFile: file.name,
        segmentCount: segments.length,
        totalDuration: segments.reduce((sum, s) => sum + (s.duration || 0), 0)
      }
    };
  }

  /**
   * 壓縮處理（帶進度）
   */
  async compressWithProgress(file, progressControl, cancelled) {
    const compressor = new AudioCompressor();

    progressControl.setStage(0); // 分析音訊
    progressControl.addDetail('原始大小', this.formatFileSize(file.size));

    // 選擇壓縮配置
    const profile = compressor.selectCompressionProfile(file.size);
    progressControl.addDetail('壓縮等級', profile.name);

    if (cancelled()) return null;

    progressControl.setStage(1); // 執行壓縮
    const compressed = await compressor.compress(file, {
      profile: profile.name,
      onProgress: (progress) => {
        progressControl.update(progress.percentage * 0.8 + 10); // 10-90%
        progressControl.setMessage(progress.message);

        if (progress.compressedSize) {
          progressControl.addDetail('壓縮後大小', this.formatFileSize(progress.compressedSize));
          progressControl.addDetail('壓縮率', `${progress.compressionRatio.toFixed(1)}%`);
        }
      }
    });

    if (cancelled()) return null;

    progressControl.setStage(2); // 準備完成
    progressControl.update(95);

    return {
      strategy: 'compress',
      files: [compressed],
      metadata: {
        originalSize: file.size,
        compressedSize: compressed.size,
        compressionRatio: ((1 - compressed.size / file.size) * 100).toFixed(1)
      }
    };
  }

  /**
   * 混合處理（帶進度）
   */
  async hybridWithProgress(file, progressControl, cancelled) {
    progressControl.setStage(0); // 準備處理

    // 先壓縮
    progressControl.setMessage('正在壓縮音訊...');
    const compressResult = await this.compressWithProgress(
      file,
      {
        update: (p) => progressControl.update(p * 0.4), // 前40%
        addDetail: (k, v) => progressControl.addDetail(k, v),
        setMessage: (m) => progressControl.setMessage(m)
      },
      cancelled
    );

    if (cancelled() || !compressResult) return null;

    progressControl.setStage(1); // 檢查是否需要分割
    const compressedFile = compressResult.files[0];

    if (compressedFile.size <= this.maxFileSize) {
      progressControl.setStage(2);
      progressControl.update(95);
      return compressResult;
    }

    // 需要進一步分割
    progressControl.setMessage('壓縮後仍超過限制，進行分割...');
    const splitResult = await this.splitWithProgress(
      compressedFile,
      {
        update: (p) => progressControl.update(40 + p * 0.5), // 40-90%
        addDetail: (k, v) => progressControl.addDetail(k, v),
        setMessage: (m) => progressControl.setMessage(m),
        setStage: (s) => progressControl.setStage(Math.min(s + 1, 2))
      },
      cancelled
    );

    if (cancelled() || !splitResult) return null;

    progressControl.setStage(2);
    progressControl.update(95);

    return {
      strategy: 'hybrid',
      files: splitResult.files,
      metadata: {
        ...compressResult.metadata,
        ...splitResult.metadata,
        strategy: 'compress+split'
      }
    };
  }

  /**
   * 準備 WASM 轉譯
   */
  async prepareWASMTranscription(file) {
    const model = await this.showModelSelection();
    if (!model) return null;

    const progressControl = showProgress({
      title: '準備本地轉譯',
      message: '正在初始化轉譯引擎...',
      stages: ['載入模型', '初始化引擎', '準備轉譯'],
      showDetails: true,
      icon: '🤖'
    });

    try {
      progressControl.setStage(0);
      progressControl.addDetail('模型', model);
      progressControl.addDetail('檔案', file.name);

      const wasmManager = new WhisperWASMManager();

      // 初始化 WASM
      await wasmManager.initialize(model, {
        onProgress: (progress) => {
          progressControl.update(progress.percentage * 0.8);
          progressControl.setMessage(progress.message);

          if (progress.downloaded && progress.total) {
            progressControl.addDetail(
              '下載進度',
              `${this.formatFileSize(progress.downloaded)} / ${this.formatFileSize(progress.total)}`
            );
          }
        }
      });

      progressControl.setStage(1);
      progressControl.update(85);

      progressControl.setStage(2);
      progressControl.update(95);
      progressControl.complete();

      return {
        strategy: 'wasm',
        files: [file],
        model,
        wasmManager
      };

    } catch (error) {
      progressControl.error(`初始化失敗: ${error.message}`);
      throw error;
    }
  }

  /**
   * 獲取處理階段
   */
  getProcessingStages(strategy) {
    const stages = {
      split: ['分析音訊', '檢測分割點', '生成片段', '準備完成'],
      compress: ['分析音訊', '執行壓縮', '準備完成'],
      hybrid: ['壓縮處理', '分割處理', '準備完成']
    };

    return stages[strategy] || [];
  }

  /**
   * 其他輔助方法...
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  analyzeFile(file) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(2);
    const exceedBy = ((file.size - this.maxFileSize) / 1024 / 1024).toFixed(2);

    return {
      name: file.name,
      size: file.size,
      sizeMB: parseFloat(sizeMB),
      exceedBy: parseFloat(exceedBy),
      type: file.type
    };
  }

  // ... 其他現有方法保持不變
}
