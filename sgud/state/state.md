# 狀態

本檔記 w-docx-split 各功能之**現況**(做到哪裡、對應之規則帳本條目與測試檔、已知缺口與待辦、最近一次驗證);只記現況、不寫過程(過程見 `sgud/exp/experience.md`).

## 依指定字串分割 docx(`WDocxSplit`)

- 現況: 僅 Windows;以 `splitDocx.exe`(`srcPython/` 以 win32com 驅動 Word,PyInstaller 打包)分割,輸入 base64 JSON(`fpIn`、`strSep`、`fdOut`、`padZero`),輸出 `001.docx`…;函數以字串 reject(參數錯誤、取不到執行檔、執行失敗).
- **exe 內部失敗判定(R-SPLIT-RESULT-01,2026-10-31 已修)**: exe 不論成敗離開碼皆為 0,故 `WDocxSplit()` 依輸出判定(`src/judgeSplitOutput.mjs`): 須有 `success` 行且無 `error:` 行才 resolve `'ok'`,否則 reject `[E_SPLIT_FAILED] 原因`(非 docx、損毀 docx 已實測 reject);輸出以 `codeCmd: 'auto'` 解碼.exe 本身未重建.對外行為變化見 README〈Breaking changes〉.
- 測試: `test/WDocxSplit.test.mjs`(需本機有 Word;執行檔以本機鏡像或本機 HTTP 伺服器供檔,不連外網;含 exe 失敗之 describe)、`test/unit-judgeSplitOutput.test.mjs`(純函數,不需 Word).指令: `npm test`.
- 已知缺口: ①Word 對 0 位元組之 `.docx` 視為空白文件並成功(exe 回 `success`、輸出 `001.docx`),屬 Word 行為、本輪未處理;②參數檢測之既有訊息(`fpIn[…] does not exist`、`strSep[…] is not an effective string`)回顯輸入值,與輸入參數規格 V20 不合,本輪範圍外未改;③分割中途失敗時,失敗前已寫出之 `00N.docx` 不清除.

## 外部執行檔 `splitDocx.exe`(R-BIN-DOCXSPLIT-01)

- 現況: 已改制式規格(2026-10-28,主控任務 20261028054319,B 類→釘選模式): `bin/splitDocx.exe`(主控已提交推送,提交 `c85382f9a8ce42477844afa5b53b8df55e5a4b19`)＋`bin/manifest.json`(由 `toolg/genBinManifest.mjs` 產生)＋`src/ensureBins.mjs`(轉呼叫 wsemi `fsEnsureBins`,wsemi 1.9.27).`WDocxSplit()` 經 `ensureBins({ names: 'splitDocx.exe' })` 取得路徑;`WDocxSplit.ensureBins` 與 `src/ensureBins.mjs` 供部署前預先取得;`autoDownloadFiles()` 保留為 `@deprecated` 薄包裝.已移除 `postinstall`、`scripts/install.mjs`、`src/downloadFiles.mjs`(自寫之 `fsDownloadFile` 直連).本套件無交換檔(exe 只收 argv),故無 `os.tmpdir()` 改動.
- 舊版相容: `src/splitDocx.exe` 保留於 repo(舊版自主幹下載;與 `bin/` 位元相同),不入 npm 包.
- 規則: `sgud/rule/rulebook.md` R-BIN-DOCXSPLIT-01.
- 測試: `test/unit-binManifest.test.mjs`、`test/api-ensureBins.test.mjs`(本機 HTTP `127.0.0.1:8967`、不連外網;子行程工具 `test/tools/ensureBinsChild.mjs`)、`test/WDocxSplit.test.mjs`(本機 HTTP `127.0.0.1:8968`;子行程工具 `test/tools/splitChild.mjs`).
- 已知缺口與待辦:
  1. 真實 GitHub 網址之下載未實測(測試不得連外網;網址形狀由本機伺服器路徑斷言).
  2. 至舊版淘汰後移除 `src/splitDocx.exe`(另案).
  3. `dist/` 隨發布重新產製(repo 內 `dist/` 仍為舊版);以現行 `toolg/gDistRollup.mjs` 設定建置到暫存夾並模擬安裝實測: UMD 可用、`ensureBins` 靜態屬性可用、快取落在模擬套件根、經 UMD 實際分割輸出 `001.docx`/`002.docx`.
  4. (已於 2026-10-31 處理,見上〈exe 內部失敗判定〉.)
  5. `toolg/gDistRollup.mjs` 有既有未使用之 `getFiles` import(eslint `no-unused-vars`),依規範只提出、未刪.
- 最近一次驗證(2026-10-31,docxsplit): `npm test` 49 passing(4 檔: `unit-binManifest`、`unit-judgeSplitOutput`、`api-ensureBins`、`WDocxSplit`);修前紅(非 docx、損毀 docx 回 `'ok'`)、本輪變異 15 式皆殺(對照組全綠);wsemi 1.9.33;報告見主控任務 20261031065406 `agent-out/docxsplit-修正報告.md`.
- 前次驗證(2026-10-28): `npm test` 35 passing;bin-docxsplit 變異 37 式皆殺;報告見主控任務 20261028054319 `agent-out/bin-docxsplit-修正報告.md`.
