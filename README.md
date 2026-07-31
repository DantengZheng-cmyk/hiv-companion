# 小澄｜HIV 健康陪伴

以台灣使用情境設計的 HIV 陪伴型衛教網站，提供 PEP、PrEP、U=U、檢驗與治療資訊，以及回診問題整理。

## 重要說明

- 本網站提供一般衛教與就醫方向，不取代醫師診斷、個別醫療建議或緊急服務。
- 若暴露可能發生在 72 小時內，請儘速聯絡提供 PEP 的醫療院所或前往急診評估。
- 若有立即自傷危險，請撥 119／110 或前往急診。
- 使用者輸入只在目前瀏覽器頁面內處理；本版本未連接帳號、資料庫或分析追蹤。

## 本機執行

需要 Node.js 22.13 以上版本。

```bash
npm ci
npm run dev
```

## 建置

```bash
npm run build
npm run preview
```

正式靜態檔會輸出到 `dist/`。

## GitHub Pages

`main` 分支有新 commit 時，`.github/workflows/pages.yml` 會自動建置與部署。首次使用請在 repository 的 **Settings → Pages → Build and deployment → Source** 選擇 **GitHub Actions**。

## 資料來源

- 衛生福利部疾病管制署：PEP、PrEP、U=U 與 HIV/AIDS 衛教
- 美國 CDC：HIV 檢驗基礎資訊

院所與服務資訊可能異動；就醫前請向院所確認。
