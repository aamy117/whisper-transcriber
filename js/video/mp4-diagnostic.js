// MP4 檔案診斷工具
const DEBUG = typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : location.hostname === 'localhost';

/**
 * 檢查 MP4 檔案中的 'moov' 原子頭位置
 * 'moov' 原子頭包含視訊的中繼資料，對於串流播放至關重要。
 * 如果它在檔案末尾，會導致需要下載整個檔案才能開始播放。
 *
 * @param {File} file - 要檢查的 MP4 檔案
 * @returns {Promise<{found: boolean, position: 'start' | 'end' | 'middle' | 'not_found', offset: number}>}
 *          一個包含 'moov' 原子頭位置資訊的 Promise。
 */
export function checkMp4MoovAtom(file) {
  return new Promise((resolve, reject) => {
    // 只檢查 MP4 檔案
    if (!file.type.includes('mp4')) {
      resolve({ found: false, position: 'not_found', offset: -1 });
      return;
    }

    // 檢查檔案的前 1MB，這對大多數 'moov' 在開頭的情況都足夠了
    const searchRange = Math.min(file.size, 1024 * 1024);
    const reader = new FileReader();

    reader.onload = (e) => {
      const buffer = e.target.result;
      const view = new DataView(buffer);
      let found = false;
      let offset = -1;

      // 遍歷緩衝區，尋找 'moov' 原子頭
      // MP4 原子頭結構：4位元組長度 + 4位元組類型
      for (let i = 0; i < view.byteLength - 8; i++) {
        const length = view.getUint32(i);
        const type = String.fromCharCode(
          view.getUint8(i + 4),
          view.getUint8(i + 5),
          view.getUint8(i + 6),
          view.getUint8(i + 7)
        );

        if (type === 'moov') {
          found = true;
          offset = i;
          break;
        }

        // 跳到下一個原子頭
        if (length > 1) {
          i += length - 1;
        } else {
          // 處理長度為 0 或 1 的情況
          break;
        }
      }

      if (found) {
        DEBUG && console.log(`[MP4 Diagnostic] 'moov' 原子頭找到，位置: ${offset}`);
        resolve({
          found: true,
          position: offset < 100 ? 'start' : 'middle', // 假設前 100 位元組內為開頭
          offset: offset
        });
      } else {
        // 如果在前 1MB 沒找到，我們假設它在檔案末尾
        DEBUG && console.log("[MP4 Diagnostic] 'moov' 原子頭未在檔案開頭找到，可能在末尾");
        resolve({ found: false, position: 'end', offset: -1 });
      }
    };

    reader.onerror = (e) => {
      if (typeof DEBUG !== 'undefined' && DEBUG) console.error('[MP4 Diagnostic] 讀取檔案失敗:', e);
      reject(new Error('讀取檔案進行 MP4 診斷時失敗'));
    };

    reader.readAsArrayBuffer(file.slice(0, searchRange));
  });
}
