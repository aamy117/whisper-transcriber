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
      'vtt': {
        name: 'WebVTT 字幕檔',
        extension: 'vtt',
        mimeType: 'text/vtt',
        handler: this.exportToVtt.bind(this)
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

  // WebVTT 字幕格式匯出
  exportToVtt(segments) {
    if (!segments || segments.length === 0) {
      return 'WEBVTT\n\n';
    }

    // VTT 檔案必須以 WEBVTT 開頭
    let content = 'WEBVTT\n\n';

    content += segments
      .map(segment => {
        const start = this.formatVttTime(segment.start);
        const end = this.formatVttTime(segment.end);
        const text = segment.edited || segment.text || '';

        // VTT 格式：時間 --> 時間，然後是文字
        return `${start} --> ${end}\n${text}\n`;
      })
      .join('\n');

    return content;
  }

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

  // 格式化 VTT 時間（hh:mm:ss.mmm）
  formatVttTime(seconds) {
    // VTT 使用點(.)而不是逗號(,)
    return this.formatSrtTime(seconds).replace(',', '.');
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
