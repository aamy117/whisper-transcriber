/**
 * 核心載入器 - 實現漸進式載入策略
 * 只載入必要的核心功能，其他功能按需載入
 */

class CoreLoader {
  constructor() {
    this.loadedModules = new Set();
    this.moduleLoaders = new Map();
    this.setupModuleLoaders();
  }

  /**
   * 設定模組載入器
   */
  setupModuleLoaders() {
    // 核心模組（立即載入）
    this.coreModules = [
      'notification',
      'dialog',
      'utils/debounce'
    ];

    // 延遲載入的模組
    this.moduleLoaders.set('editor', () => import('./editor.js'));
    this.moduleLoaders.set('player', () => import('./player.js'));
    this.moduleLoaders.set('api', () => import('./api.js'));
    this.moduleLoaders.set('wasm', () => import('./wasm/whisper-wasm-manager.js'));
    this.moduleLoaders.set('preprocessor', () => import('./transcription-preprocessor.js'));
    this.moduleLoaders.set('export', () => import('./export.js'));
    this.moduleLoaders.set('batchEditor', () => import('./batch-editor.js'));
    this.moduleLoaders.set('virtualScroll', () => import('./virtual-scroll-manager.js'));
    this.moduleLoaders.set('modelPreloader', () => import('./wasm/model-preloader.js'));
    this.moduleLoaders.set('preloadIndicator', () => import('./preload-indicator.js'));
    this.moduleLoaders.set('onboarding', () => import('./onboarding.js'));
    this.moduleLoaders.set('audioHandler', () => import('./main.js'));
  }

  /**
   * 載入核心模組
   */
  async loadCoreModules() {
    const startTime = performance.now();
    
    // 載入核心模組
    const corePromises = this.coreModules.map(module => 
      import(`./${module}.js`).then(m => {
        this.loadedModules.add(module);
        return m;
      })
    );

    const results = await Promise.all(corePromises);
    
    const loadTime = performance.now() - startTime;
    console.log(`核心模組載入完成，耗時: ${loadTime.toFixed(2)}ms`);
    
    return results;
  }

  /**
   * 按需載入模組
   */
  async loadModule(moduleName) {
    if (this.loadedModules.has(moduleName)) {
      return; // 已載入
    }

    const loader = this.moduleLoaders.get(moduleName);
    if (!loader) {
      throw new Error(`未知的模組: ${moduleName}`);
    }

    const startTime = performance.now();
    
    try {
      const module = await loader();
      this.loadedModules.add(moduleName);
      
      const loadTime = performance.now() - startTime;
      console.log(`模組 ${moduleName} 載入完成，耗時: ${loadTime.toFixed(2)}ms`);
      
      return module;
    } catch (error) {
      console.error(`載入模組 ${moduleName} 失敗:`, error);
      throw error;
    }
  }

  /**
   * 批次載入多個模組
   */
  async loadModules(moduleNames) {
    const promises = moduleNames.map(name => this.loadModule(name));
    return Promise.all(promises);
  }

  /**
   * 預載入模組（不阻塞）
   */
  preloadModule(moduleName) {
    if (this.loadedModules.has(moduleName)) {
      return;
    }

    const loader = this.moduleLoaders.get(moduleName);
    if (!loader) {
      return;
    }

    // 使用 requestIdleCallback 在空閒時載入
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        loader().then(() => {
          this.loadedModules.add(moduleName);
          console.log(`預載入模組 ${moduleName} 完成`);
        });
      });
    } else {
      // 降級到 setTimeout
      setTimeout(() => {
        loader().then(() => {
          this.loadedModules.add(moduleName);
          console.log(`預載入模組 ${moduleName} 完成`);
        });
      }, 1000);
    }
  }

  /**
   * 檢查模組是否已載入
   */
  isLoaded(moduleName) {
    return this.loadedModules.has(moduleName);
  }

  /**
   * 獲取載入進度
   */
  getLoadProgress() {
    const totalModules = this.coreModules.length + this.moduleLoaders.size;
    const loadedCount = this.loadedModules.size;
    return {
      loaded: loadedCount,
      total: totalModules,
      percentage: (loadedCount / totalModules) * 100
    };
  }
}

// 匯出單例
export const coreLoader = new CoreLoader();