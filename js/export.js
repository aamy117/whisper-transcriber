// 匯出功能模組
class ExportManager {
  constructor() {
    this.formats = {
      'txt': {
        name: '純文字',
        extension: 'txt',
        mimeType: 'text/plain',
        handler: this.exportToTxt.bind(this)
      },
      'txt-timestamps': {
        name: '含時間戳文字',
        extension: 'txt',
        mimeType: 'text/plain',
        handler: this.exportToTxtWithTimestamps.bind(this)
      },
      'srt': {
        name: 'SRT 字幕檔',
        extension: 'srt',
        mimeType: 'text/plain',
        handler: this.exportToSrt.bind(this)
      },
      'youtube': {
        name: 'YouTube 時間戳',
        extension: 'txt',
        mimeType: 'text/plain',
        handler: this.exportToYouTubeTimestamps.bind(this)
      },
      'markdown': {
        name: 'Markdown 格式',
        extension: 'md',
        mimeType: 'text/markdown',
        handler: this.exportToMarkdown.bind(this)
      }
    };
  }

  // 匯出方法
  export(segments, format, filename) {
    const formatConfig = this.formats[format];
    if (!formatConfig) {
      throw new Error(`不支援的格式：${format}`);
    }

    // 產生內容
    const content = formatConfig.handler(segments);

    // 建立檔案名稱
    const fullFilename = `${filename}.${formatConfig.extension}`;

    // 下載檔案
    this.download(content, fullFilename, formatConfig.mimeType);
  }

  // 純文字匯出（不含時間）
  exportToTxt(segments) {
    if (!segments || segments.length === 0) {
      return '暫無內容';
    }

    // 只匯出文字內容，段落之間用空行分隔
    return segments
      .map(segment => {
        // 優先使用編輯後的文字，否則使用原始文字
        return segment.edited || segment.text || '';
      })
      .filter(text => text.trim() !== '') // 過濾空段落
      .join('\n\n'); // 用兩個換行分隔段落
  }

  // 含時間戳的文字匯出
  exportToTxtWithTimestamps(segments) {
    if (!segments || segments.length === 0) {
      return '暫無內容';
    }

    return segments
      .map(segment => {
        const time = this.formatTime(segment.start);
        const text = segment.edited || segment.text || '';
        return `[${time}] ${text}`;
      })
      .filter(line => line.trim() !== '[00:00] ') // 過濾空內容
      .join('\n\n');
  }

  // SRT 字幕格式匯出
  exportToSrt(segments) {
    if (!segments || segments.length === 0) {
      return '';
    }

    return segments
      .map((segment, index) => {
        const start = this.formatSrtTime(segment.start);
        const end = this.formatSrtTime(segment.end);
        const text = segment.edited || segment.text || '';

        // SRT 格式：序號、時間、文字內容
        return `${index + 1}\n${start} --> ${end}\n${text}\n`;
      })
      .join('\n');
  }

  // [已移除 WebVTT 匯出方法]

  // 下載檔案
  download(content, filename, mimeType = 'text/plain') {
    // 建立 Blob
    const blob = new Blob([content], {
      type: `${mimeType};charset=utf-8`
    });

    // 建立下載連結
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;

    // 觸發下載
    document.body.appendChild(link);
    link.click();

    // 清理
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);
  }

  // 格式化時間（mm:ss）
  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // 格式化 SRT 時間（hh:mm:ss,mmm）
  formatSrtTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);

    return `${hours.toString().padStart(2, '0')}:` +
           `${mins.toString().padStart(2, '0')}:` +
           `${secs.toString().padStart(2, '0')},` +
           `${ms.toString().padStart(3, '0')}`;
  }

  // [已移除 formatVttTime 方法 - VTT 格式已不再支援]

  // YouTube 時間戳格式匯出
  exportToYouTubeTimestamps(segments) {
    if (!segments || segments.length === 0) {
      return '00:00 開始';
    }

    const timestamps = [];
    
    // YouTube 格式要求從 00:00 開始
    const hasStart = segments.some(seg => seg.start === 0);
    if (!hasStart) {
      timestamps.push('00:00 開始');
    }

    // 加入所有段落的時間戳
    segments.forEach(segment => {
      const time = this.formatYouTubeTime(segment.start);
      const text = segment.edited || segment.text || '';
      
      // 取前 50 個字元作為標題（YouTube 限制）
      const title = text.substring(0, 50).trim() || '段落';
      timestamps.push(`${time} ${title}`);
    });

    // 複製到剪貼簿（如果支援）
    const content = timestamps.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(content).catch(() => {
        // 失敗時不顯示錯誤，因為檔案會下載
      });
    }

    return content;
  }

  // Markdown 格式匯出
  exportToMarkdown(segments) {
    if (!segments || segments.length === 0) {
      return '# 轉譯結果\n\n暫無內容';
    }

    let markdown = '# 轉譯結果\n\n';
    markdown += `**日期**：${new Date().toLocaleDateString()}\n`;
    markdown += `**段落數**：${segments.length}\n\n`;
    markdown += '---\n\n';

    // 加入每個段落
    segments.forEach((segment, index) => {
      const time = this.formatTime(segment.start);
      const text = segment.edited || segment.text || '';
      
      markdown += `## ${index + 1}. [${time}]\n\n`;
      markdown += `${text}\n\n`;
    });

    return markdown;
  }

  // 格式化 YouTube 時間（不顯示小時如果是 0）
  formatYouTubeTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // 取得支援的格式列表
  getSupportedFormats() {
    return Object.keys(this.formats).map(key => ({
      value: key,
      name: this.formats[key].name
    }));
  }
}

// 匯出單例
export const exportManager = new ExportManager();
