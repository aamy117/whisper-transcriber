// 視訊播放器測試套件
import domReadyManager from './video/dom-ready-manager.js';
import VideoConfig from './video/video-config.js';
import { VideoPlayer } from './video/video-player.js';
import { VideoUI } from './video/video-ui.js';
import { VideoApp } from './video/video-main.js';

class TestSuite {
    constructor() {
        this.tests = [];
        this.results = [];
        this.currentTest = null;
        this.startTime = null;
        this.metrics = {
            domLoadTime: 0,
            initTime: 0,
            memoryUsage: 0,
            errorCount: 0
        };

        this.initializeTests();
        this.bindEvents();
    }

    initializeTests() {
        // 定義所有測試
        this.tests = [
            {
                id: 'dom-ready',
                name: 'DOM Ready 測試',
                description: '測試 DOM 載入管理器',
                category: 'core',
                run: () => this.testDOMReady()
            },
            {
                id: 'element-check',
                name: '元素檢查測試',
                description: '驗證所有必要元素存在',
                category: 'core',
                run: () => this.testElementCheck()
            },
            {
                id: 'player-init',
                name: 'Player 初始化測試',
                description: '測試 VideoPlayer 創建',
                category: 'component',
                run: () => this.testPlayerInit()
            },
            {
                id: 'ui-init',
                name: 'UI 初始化測試',
                description: '測試 VideoUI 初始化',
                category: 'component',
                run: () => this.testUIInit()
            },
            {
                id: 'full-init',
                name: '完整初始化測試',
                description: '測試完整應用初始化流程',
                category: 'integration',
                run: () => this.testFullInit()
            },
            {
                id: 'error-handling',
                name: '錯誤處理測試',
                description: '測試錯誤處理和恢復',
                category: 'error',
                run: () => this.testErrorHandling()
            },
            {
                id: 'performance',
                name: '效能測試',
                description: '測量初始化效能',
                category: 'performance',
                run: () => this.testPerformance()
            },
            {
                id: 'retry-mechanism',
                name: '重試機制測試',
                description: '測試初始化失敗後的重試',
                category: 'recovery',
                run: () => this.testRetryMechanism()
            }
        ];

        this.renderTests();
        this.initializeProgressTracker();
    }

    renderTests() {
        const testGrid = document.getElementById('testGrid');
        testGrid.innerHTML = this.tests.map(test => `
            <div class="test-card" data-test-id="${test.id}">
                <h4>${test.name}</h4>
                <p>${test.description}</p>
                <small>類別: ${test.category}</small>
            </div>
        `).join('');
    }

    initializeProgressTracker() {
        const stages = [
            { id: 'dom', name: 'DOM 載入', icon: '📄' },
            { id: 'elements', name: '元素收集', icon: '🔍' },
            { id: 'player', name: 'Player 創建', icon: '🎬' },
            { id: 'ui', name: 'UI 初始化', icon: '🎨' },
            { id: 'events', name: '事件綁定', icon: '🔗' },
            { id: 'complete', name: '完成', icon: '✅' }
        ];

        const tracker = document.getElementById('progressTracker');
        tracker.innerHTML = stages.map(stage => `
            <div class="progress-item" data-stage="${stage.id}">
                <div class="progress-icon pending" data-stage-icon="${stage.id}">
                    ${stage.icon}
                </div>
                <div>
                    <strong>${stage.name}</strong>
                    <div class="stage-time" data-stage-time="${stage.id}"></div>
                </div>
            </div>
        `).join('');
    }

    bindEvents() {
        // 執行所有測試
        document.getElementById('runAllTests').addEventListener('click', () => {
            this.runAllTests();
        });

        // 執行選定測試
        document.getElementById('runSelectedTests').addEventListener('click', () => {
            const selected = document.querySelectorAll('.test-card.selected');
            const testIds = Array.from(selected).map(card => card.dataset.testId);
            this.runTests(testIds);
        });

        // 清除結果
        document.getElementById('clearResults').addEventListener('click', () => {
            this.clearResults();
        });

        // 匯出結果
        document.getElementById('exportResults').addEventListener('click', () => {
            this.exportResults();
        });

        // 測試卡片點擊
        document.querySelectorAll('.test-card').forEach(card => {
            card.addEventListener('click', () => {
                card.classList.toggle('selected');
            });
        });
    }

    // 測試方法
    async testDOMReady() {
        this.log('開始 DOM Ready 測試...');
        const startTime = performance.now();

        try {
            await domReadyManager.waitForReady(5000);
            const loadTime = performance.now() - startTime;
            this.metrics.domLoadTime = Math.round(loadTime);

            const status = domReadyManager.diagnose();
            this.log(`✅ DOM Ready 完成，耗時: ${loadTime.toFixed(2)}ms`);
            this.log(`DOM 狀態: ${JSON.stringify(status, null, 2)}`);

            return { success: true, time: loadTime, data: status };
        } catch (error) {
            this.log(`❌ DOM Ready 失敗: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    }

    async testElementCheck() {
        this.log('開始元素檢查測試...');

        // 註冊所有必要元素
        const requiredElements = [
            { id: 'videoWrapper' },
            { id: 'videoPlayerContainer' },
            { id: 'videoUploadArea' },
            { id: 'videoControls' },
            { id: 'videoPlayer' },
            { id: 'playPauseBtn' },
            { id: 'skipBackBtn' },
            { id: 'skipForwardBtn' },
            { id: 'progressContainer' },
            { id: 'progressSlider' },
            { id: 'progressPlayed' },
            { id: 'progressBuffered' },
            { id: 'currentTime' },
            { id: 'totalTime' },
            { id: 'muteBtn' },
            { id: 'volumeSlider' },
            { id: 'speedBtn' },
            { id: 'speedMenu' },
            { id: 'fullscreenBtn' }
        ];

        domReadyManager.requireElements(requiredElements);
        const result = domReadyManager.checkElements();

        if (result.allFound) {
            this.log(`✅ 所有 ${result.found.length} 個必要元素都已找到`);
        } else {
            this.log(`❌ 缺少 ${result.missing.length} 個必要元素: ${result.missing.join(', ')}`, 'error');
        }

        return {
            success: result.allFound,
            found: result.found.length,
            missing: result.missing
        };
    }

    async testPlayerInit() {
        this.log('開始 Player 初始化測試...');
        this.updateStage('player', 'running');

        try {
            const videoElement = document.getElementById('videoPlayer');
            if (!videoElement) {
                throw new Error('找不到 video 元素');
            }

            const player = new VideoPlayer(videoElement);
            this.log('✅ VideoPlayer 創建成功');

            // 測試基本功能
            const state = player.getState();
            this.log(`Player 狀態: ${JSON.stringify(state, null, 2)}`);

            this.updateStage('player', 'success');
            return { success: true, player, state };

        } catch (error) {
            this.log(`❌ Player 初始化失敗: ${error.message}`, 'error');
            this.updateStage('player', 'error');
            return { success: false, error: error.message };
        }
    }

    async testUIInit() {
        this.log('開始 UI 初始化測試...');
        this.updateStage('ui', 'running');

        try {
            // 先創建 player
            const videoElement = document.getElementById('videoPlayer');
            const player = new VideoPlayer(videoElement);

            // 創建並初始化 UI
            const ui = new VideoUI(player);
            const result = await ui.initialize();

            if (result.success) {
                this.log('✅ UI 初始化成功');
                const diagnosis = ui.diagnose();
                this.log(`UI 診斷: ${JSON.stringify(diagnosis, null, 2)}`);
                this.updateStage('ui', 'success');
            } else {
                this.log(`❌ UI 初始化失敗: ${result.error}`, 'error');
                this.updateStage('ui', 'error');
            }

            return result;

        } catch (error) {
            this.log(`❌ UI 測試失敗: ${error.message}`, 'error');
            this.updateStage('ui', 'error');
            return { success: false, error: error.message };
        }
    }

    async testFullInit() {
        this.log('開始完整初始化測試...');
        const startTime = performance.now();

        // 重置所有階段
        this.resetStages();

        try {
            // 創建新的 VideoApp 實例
            const app = new VideoApp();

            // 監聽初始化完成事件
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('初始化超時'));
                }, 10000);

                window.addEventListener('videoapp:initialized', (event) => {
                    clearTimeout(timeout);
                    resolve(event.detail);
                }, { once: true });
            });

            const totalTime = performance.now() - startTime;
            this.metrics.initTime = Math.round(totalTime);

            this.log(`✅ 完整初始化成功，總耗時: ${totalTime.toFixed(2)}ms`);

            // 獲取狀態
            const status = app.getInitStatus();
            this.log(`應用狀態: ${JSON.stringify(status, null, 2)}`);

            this.updateStage('complete', 'success');
            return { success: true, time: totalTime, status };

        } catch (error) {
            this.log(`❌ 完整初始化失敗: ${error.message}`, 'error');
            this.metrics.errorCount++;
            return { success: false, error: error.message };
        }
    }

    async testErrorHandling() {
        this.log('開始錯誤處理測試...');

        const errorScenarios = [
            {
                name: '缺少必要元素',
                test: async () => {
                    // 臨時移除一個必要元素
                    const element = document.getElementById('playPauseBtn');
                    element.style.display = 'none';
                    element.id = 'playPauseBtn_temp';

                    try {
                        const videoElement = document.getElementById('videoPlayer');
                        const player = new VideoPlayer(videoElement);
                        const ui = new VideoUI(player);
                        const result = await ui.initialize();

                        // 恢復元素
                        element.id = 'playPauseBtn';
                        element.style.display = '';

                        return result;
                    } catch (error) {
                        // 恢復元素
                        element.id = 'playPauseBtn';
                        element.style.display = '';
                        throw error;
                    }
                }
            },
            {
                name: '無效的 player 參數',
                test: async () => {
                    try {
                        const ui = new VideoUI(null);
                        return { success: false, error: '應該拋出錯誤' };
                    } catch (error) {
                        return { success: true, error: error.message };
                    }
                }
            }
        ];

        const results = [];
        for (const scenario of errorScenarios) {
            this.log(`測試場景: ${scenario.name}`);
            try {
                const result = await scenario.test();
                results.push({ scenario: scenario.name, result });
                this.log(`結果: ${JSON.stringify(result)}`);
            } catch (error) {
                this.log(`錯誤: ${error.message}`, 'error');
                results.push({ scenario: scenario.name, error: error.message });
            }
        }

        return { success: true, results };
    }

    async testPerformance() {
        this.log('開始效能測試...');

        const iterations = 3;
        const times = [];

        for (let i = 0; i < iterations; i++) {
            this.log(`執行第 ${i + 1}/${iterations} 次測試...`);

            const startTime = performance.now();

            // 執行初始化
            const videoElement = document.getElementById('videoPlayer');
            const player = new VideoPlayer(videoElement);
            const ui = new VideoUI(player);
            await ui.initialize();

            const endTime = performance.now();
            const duration = endTime - startTime;
            times.push(duration);

            this.log(`第 ${i + 1} 次耗時: ${duration.toFixed(2)}ms`);

            // 清理
            ui.destroy();
        }

        // 計算統計數據
        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        const min = Math.min(...times);
        const max = Math.max(...times);

        // 記憶體使用（如果支援）
        if (performance.memory) {
            this.metrics.memoryUsage = Math.round(performance.memory.usedJSHeapSize / 1024 / 1024);
            this.log(`記憶體使用: ${this.metrics.memoryUsage} MB`);
        }

        this.log(`效能統計 - 平均: ${avg.toFixed(2)}ms, 最小: ${min.toFixed(2)}ms, 最大: ${max.toFixed(2)}ms`);

        return {
            success: true,
            stats: { avg, min, max, times },
            memory: this.metrics.memoryUsage
        };
    }

    async testRetryMechanism() {
        this.log('開始重試機制測試...');

        // 模擬失敗場景
        const element = document.getElementById('volumeSlider');
        element.style.display = 'none';
        element.id = 'volumeSlider_temp';

        try {
            const videoElement = document.getElementById('videoPlayer');
            const player = new VideoPlayer(videoElement);
            const ui = new VideoUI(player);

            // 第一次嘗試（應該失敗）
            this.log('第一次初始化嘗試...');
            let result = await ui.initialize();

            if (!result.success && result.canRetry) {
                this.log('初始化失敗，恢復元素並重試...');

                // 恢復元素
                element.id = 'volumeSlider';
                element.style.display = '';

                // 重試
                result = await ui.retry();

                if (result.success) {
                    this.log('✅ 重試成功！');
                } else {
                    this.log('❌ 重試失敗', 'error');
                }
            }

            return result;

        } catch (error) {
            // 確保恢復元素
            element.id = 'volumeSlider';
            element.style.display = '';

            this.log(`❌ 測試失敗: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    }

    // 輔助方法
    updateStage(stageId, status) {
        const icon = document.querySelector(`[data-stage-icon="${stageId}"]`);
        if (icon) {
            icon.className = `progress-icon ${status}`;
        }

        const timeDiv = document.querySelector(`[data-stage-time="${stageId}"]`);
        if (timeDiv && status === 'success') {
            timeDiv.textContent = `${Date.now() - this.startTime}ms`;
        }
    }

    resetStages() {
        document.querySelectorAll('.progress-icon').forEach(icon => {
            icon.className = 'progress-icon pending';
        });
        document.querySelectorAll('.stage-time').forEach(div => {
            div.textContent = '';
        });
    }

    log(message, type = 'info') {
        const results = document.getElementById('testResults');
        const timestamp = new Date().toLocaleTimeString();
        const color = type === 'error' ? '#e74c3c' : '#2c3e50';

        results.innerHTML += `<div style="color: ${color}">[${timestamp}] ${message}</div>`;
        results.scrollTop = results.scrollHeight;
    }

    async runAllTests() {
        this.clearResults();
        this.startTime = Date.now();
        this.updateStatus('running');

        for (const test of this.tests) {
            await this.runTest(test);
        }

        this.updateStatus('success');
        this.updateMetrics();
        this.log('\n🎉 所有測試完成！');
    }

    async runTests(testIds) {
        this.clearResults();
        this.startTime = Date.now();
        this.updateStatus('running');

        const testsToRun = this.tests.filter(test => testIds.includes(test.id));

        for (const test of testsToRun) {
            await this.runTest(test);
        }

        this.updateStatus('success');
        this.updateMetrics();
    }

    async runTest(test) {
        const card = document.querySelector(`[data-test-id="${test.id}"]`);
        card.classList.add('running');

        this.log(`\n▶️ 執行測試: ${test.name}`);

        try {
            const result = await test.run();
            this.results.push({ test: test.name, ...result });

            card.classList.remove('running');
            card.classList.add(result.success ? 'success' : 'error');

        } catch (error) {
            this.log(`❌ 測試異常: ${error.message}`, 'error');
            this.results.push({ test: test.name, success: false, error: error.message });

            card.classList.remove('running');
            card.classList.add('error');
        }
    }

    clearResults() {
        document.getElementById('testResults').innerHTML = '';
        this.results = [];
        this.metrics.errorCount = 0;

        document.querySelectorAll('.test-card').forEach(card => {
            card.classList.remove('running', 'success', 'error');
        });

        this.resetStages();
    }

    updateStatus(status) {
        const statusElement = document.getElementById('overallStatus');
        statusElement.className = `test-status status-${status}`;
        statusElement.textContent =
            status === 'running' ? '執行中...' :
            status === 'success' ? '測試完成' :
            status === 'error' ? '測試失敗' : '準備就緒';
    }

    updateMetrics() {
        document.getElementById('domLoadTime').textContent = `${this.metrics.domLoadTime}ms`;
        document.getElementById('initTime').textContent = `${this.metrics.initTime}ms`;
        document.getElementById('memoryUsage').textContent = `${this.metrics.memoryUsage}MB`;
        document.getElementById('errorCount').textContent = this.metrics.errorCount;
    }

    exportResults() {
        const report = {
            timestamp: new Date().toISOString(),
            metrics: this.metrics,
            results: this.results,
            summary: {
                total: this.results.length,
                passed: this.results.filter(r => r.success).length,
                failed: this.results.filter(r => !r.success).length
            }
        };

        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `test-report-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);

        this.log('✅ 測試報告已匯出');
    }
}

// 初始化測試套件
const testSuite = new TestSuite();
window.testSuite = testSuite;
