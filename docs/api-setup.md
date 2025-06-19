# OpenAI API Key 設定指南

## 什麼是 API Key？

API Key 是您使用 OpenAI 服務的身份憑證，類似於密碼。Whisper 轉譯器需要這個 Key 來呼叫 OpenAI 的語音轉文字服務。

## 申請 API Key

### 步驟 1：註冊 OpenAI 帳號

1. 訪問 [OpenAI 官網](https://openai.com)
2. 點擊「Sign up」註冊
3. 使用 Email 或 Google 帳號註冊
4. 驗證 Email

### 步驟 2：設定付款方式

> ⚠️ **注意**：Whisper API 是付費服務，需要綁定信用卡

1. 登入後訪問 [Billing 頁面](https://platform.openai.com/account/billing)
2. 點擊「Add payment method」
3. 輸入信用卡資訊
4. 設定用量限制（建議設定月限額）

### 步驟 3：建立 API Key

1. 前往 [API Keys 頁面](https://platform.openai.com/api-keys)
2. 點擊「Create new secret key」
3. 為 Key 命名（例如：「Whisper Transcriber」）
4. 點擊「Create secret key」
5. **立即複製並保存 Key**（只會顯示一次！）

## 在應用程式中設定

### 方法一：透過設定介面

1. 開啟 Whisper 轉譯器
2. 點擊右上角設定按鈕 ⚙️
3. 在「OpenAI API Key」欄位貼上您的 Key
4. 點擊「儲存設定」

### 方法二：第一次使用時設定

1. 當您嘗試轉譯時，系統會提示設定 API Key
2. 在彈出的設定視窗中輸入 Key
3. 儲存後即可開始使用

## API Key 安全須知

### ✅ 應該做的事

- **保密存放**：將 Key 視為密碼般保護
- **定期更換**：每隔幾個月更新一次
- **設定限額**：在 OpenAI 設定使用上限
- **監控用量**：定期檢查使用情況

### ❌ 不應該做的事

- **不要分享**：絕不與他人分享 API Key
- **不要公開**：避免在公開場合展示
- **不要硬編碼**：不要將 Key 寫在程式碼中
- **不要上傳**：避免將 Key 上傳到 GitHub

## 費用說明

### Whisper API 定價

- **收費標準**：$0.006 USD / 分鐘
- **計費方式**：按實際音訊長度計算
- **最小計費**：無最小費用

### 費用範例

| 音訊長度 | 預估費用 | 新台幣約 |
|---------|---------|----------|
| 10 分鐘 | $0.06 | NT$ 2 |
| 30 分鐘 | $0.18 | NT$ 6 |
| 1 小時 | $0.36 | NT$ 12 |
| 5 小時 | $1.80 | NT$ 60 |

> 💡 **提示**：一般使用每月花費通常不超過 $5-10 USD

### 如何控制費用

1. **設定用量上限**
   - 在 OpenAI 後台設定月限額
   - 建議初期設定 $10-20 USD

2. **優化使用**
   - 避免重複轉譯相同檔案
   - 大檔案先裁切必要部分
   - 測試時使用短音訊

3. **監控用量**
   - 定期查看 [Usage 頁面](https://platform.openai.com/usage)
   - 設定用量警告通知

## 常見問題

### Q: API Key 存在哪裡？
A: 儲存在您瀏覽器的 Local Storage 中，不會上傳到任何伺服器。

### Q: 忘記 API Key 怎麼辦？
A: 需要在 OpenAI 網站重新建立一個新的 Key。

### Q: 可以使用免費額度嗎？
A: OpenAI 新帳號可能有試用額度，但 Whisper API 通常需要付費帳號。

### Q: 多人可以共用 Key 嗎？
A: 技術上可以，但不建議。共用可能導致：
- 安全風險
- 用量難以追蹤
- 超出預算

### Q: Key 被盜用怎麼辦？
1. 立即在 OpenAI 網站刪除該 Key
2. 建立新的 Key
3. 檢查使用記錄
4. 聯絡 OpenAI 客服

## 疑難排解

### 錯誤：401 Unauthorized
- **原因**：API Key 無效
- **解決**：檢查 Key 是否正確複製

### 錯誤：429 Too Many Requests  
- **原因**：超出速率限制
- **解決**：稍後再試或升級方案

### 錯誤：402 Payment Required
- **原因**：帳戶餘額不足
- **解決**：檢查付款方式和餘額

## 相關資源

- [OpenAI 官方文件](https://platform.openai.com/docs)
- [定價說明](https://openai.com/pricing)
- [使用條款](https://openai.com/terms)
- [API 狀態](https://status.openai.com)

---

如有其他問題，請參考[完整使用指南](user-guide.md)或[常見問題](faq.md)。