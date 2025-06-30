// report-exporter.js - 測試報告匯出工具
// 提供多種格式的測試報告匯出功能

export class ReportExporter {
  constructor() {
    this.formats = {
      json: 'application/json',
      csv: 'text/csv',
      html: 'text/html',
      markdown: 'text/markdown',
      pdf: 'application/pdf', // 需要額外函式庫
    };
  }

  // 匯出為 JSON（完整資料）
  exportJSON(report, filename = 'benchmark-report') {
    const json = JSON.stringify(report, null, 2);
    this.downloadFile(json, `${filename}.json`, this.formats.json);
  }

  // 匯出為 CSV（表格資料）
  exportCSV(report, filename = 'benchmark-report') {
    const csv = this.generateCSV(report);
    this.downloadFile(csv, `${filename}.csv`, this.formats.csv);
  }

  // 匯出為 HTML（視覺化報告）
  exportHTML(report, filename = 'benchmark-report') {
    const html = this.generateHTML(report);
    this.downloadFile(html, `${filename}.html`, this.formats.html);
  }

  // 匯出為 Markdown（文檔格式）
  exportMarkdown(report, filename = 'benchmark-report') {
    const markdown = this.generateMarkdown(report);
    this.downloadFile(markdown, `${filename}.md`, this.formats.markdown);
  }

  // 生成 CSV 內容
  generateCSV(report) {
    const headers = [
      'Test Name',
      'Test Type',
      'File Size (MB)',
      'Processing Time (s)',
      'Throughput (MB/s)',
      'Memory Used (MB)',
      'Worker Count',
      'Chunk Size (MB)',
      'Success',
      'Error'
    ];

    const rows = report.results.map(r => [
      r.testName || '',
      r.testType || '',
      r.fileSize ? (r.fileSize / 1024 / 1024).toFixed(2) : '',
      r.processingTime ? (r.processingTime / 1000).toFixed(2) : '',
      r.throughput ? (r.throughput / 1024 / 1024).toFixed(2) : '',
      r.memoryUsed ? (r.memoryUsed / 1024 / 1024).toFixed(2) : '',
      r.config?.workerCount || '',
      r.config?.chunkSize ? (r.config.chunkSize / 1024 / 1024).toFixed(2) : '',
      r.success ? 'Yes' : 'No',
      r.error || ''
    ]);

    // 添加摘要資訊
    rows.push([]); // 空行
    rows.push(['Summary']);
    rows.push(['Total Tests', report.totalTests]);
    rows.push(['Successful', report.successfulTests]);
    rows.push(['Failed', report.failedTests]);
    
    if (report.summary) {
      rows.push(['Optimal Worker Count', report.summary.optimalWorkerCount || 'N/A']);
      rows.push(['Optimal Chunk Size', report.summary.optimalChunkSize ? 
        (report.summary.optimalChunkSize / 1024 / 1024).toFixed(2) + ' MB' : 'N/A']);
      rows.push(['Concurrency Efficiency', report.summary.concurrencyEfficiency ? 
        report.summary.concurrencyEfficiency.toFixed(1) + '%' : 'N/A']);
    }

    // 轉換為 CSV 格式
    return [headers, ...rows]
      .map(row => row.map(cell => this.escapeCSV(cell)).join(','))
      .join('\n');
  }

  // 生成 HTML 報告
  generateHTML(report) {
    const timestamp = new Date(report.timestamp).toLocaleString();
    
    return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>效能測試報告 - ${timestamp}</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 40px;
            background: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1, h2, h3 {
            color: #333;
        }
        .summary {
            background: #e3f2fd;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        th {
            background: #f5f5f5;
            font-weight: bold;
        }
        .success {
            color: #28a745;
        }
        .error {
            color: #dc3545;
        }
        .recommendation {
            background: #fff3cd;
            padding: 15px;
            border-left: 4px solid #ffc107;
            margin: 10px 0;
        }
        .metric {
            display: inline-block;
            margin: 10px 20px 10px 0;
        }
        .metric-label {
            color: #666;
            font-size: 14px;
        }
        .metric-value {
            font-size: 24px;
            font-weight: bold;
            color: #333;
        }
        @media print {
            body {
                margin: 20px;
                background: white;
            }
            .container {
                box-shadow: none;
                padding: 0;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>效能基準測試報告</h1>
        <p>測試時間：${timestamp}</p>
        
        <div class="summary">
            <h2>測試摘要</h2>
            <div class="metric">
                <div class="metric-label">總測試數</div>
                <div class="metric-value">${report.totalTests}</div>
            </div>
            <div class="metric">
                <div class="metric-label">成功測試</div>
                <div class="metric-value class="success">${report.successfulTests}</div>
            </div>
            <div class="metric">
                <div class="metric-label">失敗測試</div>
                <div class="metric-value class="error">${report.failedTests}</div>
            </div>
        </div>

        <h2>詳細測試結果</h2>
        <table>
            <thead>
                <tr>
                    <th>測試名稱</th>
                    <th>類型</th>
                    <th>檔案大小</th>
                    <th>處理時間</th>
                    <th>吞吐量</th>
                    <th>狀態</th>
                </tr>
            </thead>
            <tbody>
                ${report.results.map(r => `
                    <tr>
                        <td>${r.testName}</td>
                        <td>${r.testType}</td>
                        <td>${this.formatSize(r.fileSize || 0)}</td>
                        <td>${this.formatTime(r.processingTime)}</td>
                        <td>${r.throughput ? this.formatSize(r.throughput) + '/s' : 'N/A'}</td>
                        <td class="${r.success ? 'success' : 'error'}">
                            ${r.success ? '成功' : '失敗'}
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>

        ${report.summary ? `
            <h2>效能分析</h2>
            <div class="summary">
                ${report.summary.optimalWorkerCount ? 
                  `<p><strong>最佳 Worker 數量：</strong>${report.summary.optimalWorkerCount}</p>` : ''}
                ${report.summary.optimalChunkSize ? 
                  `<p><strong>最佳區塊大小：</strong>${this.formatSize(report.summary.optimalChunkSize)}</p>` : ''}
                ${report.summary.concurrencyEfficiency ? 
                  `<p><strong>並發效率：</strong>${report.summary.concurrencyEfficiency.toFixed(1)}%</p>` : ''}
            </div>
        ` : ''}

        ${report.recommendations && report.recommendations.length > 0 ? `
            <h2>優化建議</h2>
            ${report.recommendations.map(rec => `
                <div class="recommendation">
                    <strong>${rec.suggestion}</strong>
                    <p>${rec.reason}</p>
                </div>
            `).join('')}
        ` : ''}
    </div>
</body>
</html>`;
  }

  // 生成 Markdown 報告
  generateMarkdown(report) {
    const timestamp = new Date(report.timestamp).toLocaleString();
    let md = `# 效能基準測試報告

**測試時間**: ${timestamp}

## 測試摘要

- **總測試數**: ${report.totalTests}
- **成功測試**: ${report.successfulTests}
- **失敗測試**: ${report.failedTests}

## 詳細測試結果

| 測試名稱 | 類型 | 檔案大小 | 處理時間 | 吞吐量 | 狀態 |
|---------|------|---------|---------|--------|------|
`;

    report.results.forEach(r => {
      md += `| ${r.testName} | ${r.testType} | ${this.formatSize(r.fileSize || 0)} | ${this.formatTime(r.processingTime)} | ${r.throughput ? this.formatSize(r.throughput) + '/s' : 'N/A'} | ${r.success ? '✅ 成功' : '❌ 失敗'} |\n`;
    });

    if (report.summary) {
      md += `\n## 效能分析\n\n`;
      
      if (report.summary.optimalWorkerCount) {
        md += `- **最佳 Worker 數量**: ${report.summary.optimalWorkerCount}\n`;
      }
      if (report.summary.optimalChunkSize) {
        md += `- **最佳區塊大小**: ${this.formatSize(report.summary.optimalChunkSize)}\n`;
      }
      if (report.summary.concurrencyEfficiency) {
        md += `- **並發效率**: ${report.summary.concurrencyEfficiency.toFixed(1)}%\n`;
      }

      // 檔案大小效能表
      if (report.summary.fileSizePerformance) {
        md += `\n### 檔案大小效能\n\n`;
        md += `| 檔案大小 | 處理時間 | 吞吐量 | 效率 |\n`;
        md += `|---------|---------|--------|------|\n`;
        
        Object.entries(report.summary.fileSizePerformance).forEach(([size, perf]) => {
          md += `| ${size} | ${perf.processingTime} | ${perf.throughput} | ${perf.efficiency || 'N/A'} |\n`;
        });
      }
    }

    if (report.recommendations && report.recommendations.length > 0) {
      md += `\n## 優化建議\n\n`;
      report.recommendations.forEach((rec, index) => {
        md += `### ${index + 1}. ${rec.suggestion}\n\n`;
        md += `**優先級**: ${this.getPriorityText(rec.priority)}\n\n`;
        md += `**原因**: ${rec.reason}\n\n`;
      });
    }

    return md;
  }

  // 生成執行摘要（適合分享）
  generateExecutiveSummary(report) {
    const summary = report.summary || {};
    
    return {
      timestamp: report.timestamp,
      overview: {
        totalTests: report.totalTests,
        successRate: ((report.successfulTests / report.totalTests) * 100).toFixed(1) + '%',
        averageThroughput: this.calculateAverageThroughput(report.results),
      },
      recommendations: {
        configuration: {
          workerCount: summary.optimalWorkerCount || 'Default',
          chunkSize: summary.optimalChunkSize ? this.formatSize(summary.optimalChunkSize) : 'Default',
        },
        performance: {
          concurrencyEfficiency: summary.concurrencyEfficiency ? summary.concurrencyEfficiency.toFixed(1) + '%' : 'N/A',
          memoryEfficiency: summary.memoryEfficiency || 'N/A',
        },
      },
      topIssues: this.identifyTopIssues(report),
      nextSteps: this.generateNextSteps(report),
    };
  }

  // 計算平均吞吐量
  calculateAverageThroughput(results) {
    const validResults = results.filter(r => r.success && r.throughput);
    if (validResults.length === 0) return 'N/A';
    
    const avgThroughput = validResults.reduce((sum, r) => sum + r.throughput, 0) / validResults.length;
    return this.formatSize(avgThroughput) + '/s';
  }

  // 識別主要問題
  identifyTopIssues(report) {
    const issues = [];
    
    // 檢查失敗率
    const failureRate = report.failedTests / report.totalTests;
    if (failureRate > 0.1) {
      issues.push({
        severity: 'high',
        issue: '高失敗率',
        detail: `${(failureRate * 100).toFixed(1)}% 的測試失敗`,
      });
    }
    
    // 檢查效能問題
    if (report.summary) {
      if (report.summary.concurrencyEfficiency && report.summary.concurrencyEfficiency < 120) {
        issues.push({
          severity: 'medium',
          issue: '並發效率低',
          detail: '系統未能充分利用並發處理能力',
        });
      }
    }
    
    return issues;
  }

  // 生成後續步驟建議
  generateNextSteps(report) {
    const steps = [];
    
    if (report.summary?.optimalWorkerCount) {
      steps.push(`調整 Worker 數量為 ${report.summary.optimalWorkerCount}`);
    }
    
    if (report.summary?.optimalChunkSize) {
      steps.push(`設定區塊大小為 ${this.formatSize(report.summary.optimalChunkSize)}`);
    }
    
    if (report.failedTests > 0) {
      steps.push('調查並修復失敗的測試案例');
    }
    
    steps.push('在生產環境中驗證優化效果');
    
    return steps;
  }

  // 工具函數
  escapeCSV(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  formatSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  formatTime(ms) {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms} ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)} 秒`;
    return `${(ms / 60000).toFixed(1)} 分鐘`;
  }

  getPriorityText(priority) {
    const map = {
      high: '🔴 高',
      medium: '🟡 中',
      low: '🟢 低',
    };
    return map[priority] || priority;
  }

  // 下載檔案
  downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
  }

  // 複製到剪貼簿
  async copyToClipboard(content) {
    try {
      await navigator.clipboard.writeText(content);
      return true;
    } catch (error) {
      console.error('複製失敗:', error);
      return false;
    }
  }
}

// 匯出單例
export const reportExporter = new ReportExporter();