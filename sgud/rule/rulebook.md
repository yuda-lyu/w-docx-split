# 規則帳本

本檔為套件設計與開發階段之規則帳本(藍圖),為要求程式碼須長成什麼樣,或由規格產出之測試(項目/說明/流程)有哪些,包含軸、單一擁有者、已知限制、破壞性變更紀錄,以及對應是哪些測試檔案或指令等,由agent自行編列、擴充與維護.當前已做到哪些記於`sgud/state/state.md`.過長時依類型拆為`rulebook_<類型>.md`,本檔只留索引.

**上游真理源為主控制式規格**,本檔只記本套件之實作須長成什麼樣並指回規格.

## 索引

| 規則 | 內容 |
|---|---|
| R-BIN-DOCXSPLIT-01 | 外部執行檔 `splitDocx.exe` 之存放、取得、校驗與離線(B 類,釘選模式) |

## R-BIN-DOCXSPLIT-01 外部執行檔 splitDocx.exe 一律經 `ensureBins()`(wsemi `fsEnsureBins`)取得

- 依據: 制式規格 `C:\opensrcOper\dspec\外部執行檔之存放下載校驗與離線.md`(使用者 2026-10-28 裁示;以下「規格」皆指此檔,條號 S/M/D/O/E/T 為其條號);主控任務 20261028054319(bin-docxsplit).本套件於主控帳本 G10 為 **B 類**(改造前自主幹 `src/splitDocx.exe` 直連下載、不校驗),採**釘選模式**.
- 單一擁有者: `src/ensureBins.mjs`(轉呼叫 wsemi `fsEnsureBins`,`pkgRoot` 由本檔位置推得);清單 `bin/manifest.json`(`toolg/genBinManifest.mjs` 產生,不手寫).
- 規則:
  1. **存放**(S1、S2、S5): 執行檔放 repo `bin/splitDocx.exe`(納入 git,`.gitattributes` 設 `bin/** binary`);npm 包只含 `bin/manifest.json`(`.npmignore`: `/bin/*`、`!/bin/manifest.json`、`/bin-cache/`、`/test/_tmp/`、`src/splitDocx.exe`、`sgud`);`.gitignore` 列 `/bin-cache/`.
  2. **舊版相容**(S2): 舊版執行時自主幹 `src/splitDocx.exe` 下載,故 `src/splitDocx.exe` **保留於 repo、與 `bin/splitDocx.exe` 位元相同**(`test/unit-binManifest.test.mjs` 比對),不入 npm 包;至舊版淘汰後另案移除.該檔由 `srcPython/` 以 PyInstaller 打包而成,**更新執行檔時須同步 `bin/` 與 `src/` 兩處**.
  3. **清單**(M1、M2、M4): `mode: "pinned"`,`commit` 為含 `bin/splitDocx.exe` 之提交(40 碼),sha256 與大小由 `node toolg/genBinManifest.mjs --commit <提交>` 依實檔計算;`test/unit-binManifest.test.mjs` 比對清單與實檔,並比對釘選提交內之位元組(`git show <commit>:bin/splitDocx.exe`)＝清單＝工作樹.更新流程(U1): 替換 `bin/` 檔(並同步 `src/splitDocx.exe`,見規則 2)→ 提交並推 GitHub → `genBinManifest --commit <該提交>` → 跑測試 → 發布新版.
  4. **取得**(D1~D4、O1~O3): 只經 `ensureBins({ names: 'splitDocx.exe' })`;首次使用時下載,**不在 `postinstall` 下載**(已移除 `postinstall` 與 `scripts/install.mjs`);快取 `<套件根>/bin-cache/<sha256>/splitDocx.exe`(`W_BIN_CACHE` 時為 `<W_BIN_CACHE>/w-docx-split/<sha256>/splitDocx.exe`);鏡像 `W_BIN_MIRROR`;離線 `W_BIN_OFFLINE=1`.**不得**另寫下載、快取、鏡像、校驗(`src/downloadFiles.mjs` 之 `fsDownloadFile` 直連已刪除).
  5. **匯出**(D1、E2③): `src/ensureBins.mjs` 之預設匯出;主檔 `WDocxSplit.ensureBins`(靜態屬性,因 UMD 主檔為預設匯出單一函數,不加具名匯出以免改變 `require()` 之形狀).`autoDownloadFiles()`(`src/autoDownloadFiles.mjs`,對外深層匯入點)保留為 `@deprecated` 薄包裝,回傳 `{ fpExe }`(位於快取),內部亦經 `ensureBins`.
  6. **reject 型態**(E3): `WDocxSplit()` 既有以字串 reject,取不到執行檔時為 `[code] message`(如 `[E_OFFLINE_MISSING] …`);`ensureBins()` 與 `autoDownloadFiles()` 則 reject 帶 `code` 之 Error.
  7. `ensureBins()` 不轉傳 `opt.floatingManifestUrl`(改變清單信任錨).
  8. **交換檔**(規格 §9): 本套件之 exe 僅以 argv 收 base64 JSON、不寫交換檔,故無須改 `os.tmpdir()`;日後若新增交換檔,不得寫快取夾(執行檔所在夾).
  9. **rollup UMD**(規格 §9): `toolg/gDistRollup.mjs` 之 external/globals 含 `url`、`crypto`、`stream`、`stream/promises`(`os` 僅交換檔需要,本套件不用).
- 盤點指令: Grep `fsDownloadFile|downloadFiles|raw/refs/heads|raw\.githubusercontent` 於 `src/`、`scripts/`、`toolg/`(應無下載站點);`node C:/opensrcOper/tools/scan-bins.mjs --only w-docx-split`(應為 OK).
- 站點全集與判準: 外部執行檔 1 個(`splitDocx.exe`,自有檔);取得站點 1 個(`src/WDocxSplit.mjs` 之 `ensureBins`,以及薄包裝 `src/autoDownloadFiles.mjs`);下載站點 0 個(下載只在 wsemi `fsEnsureBins` 內).
- 測試: `test/unit-binManifest.test.mjs`(M1/M2/M4、T1〔含誘餌檔〕、T2、S2 舊版相容、釘選提交位元組、D1 無安裝時下載、src 無自寫下載、gDistRollup 外部模組)、`test/api-ensureBins.test.mjs`(T3~T7、環境變數、pkgRoot 與載入時之工作目錄無關〔子行程工具 `test/tools/ensureBinsChild.mjs`〕、不轉傳 `floatingManifestUrl`、`WDocxSplit.ensureBins` 與薄包裝〔全域 fetch 攔截〕;本機 HTTP `127.0.0.1:8967`、本地資料夾鏡像、不連外網;T8 為主幹模式專屬,不適用)、`test/WDocxSplit.test.mjs`(功能測試需本機有 Word: 鏡像供檔、經全域 fetch 走釘選網址〔本機 `127.0.0.1:8968`〕、模擬安裝夾〔套件夾無執行檔、他處 cwd,子行程工具 `test/tools/splitChild.mjs`〕、取不到時之字串 reject).夾具 `test/_tmp/ensureBins/`、`test/_tmp/autoDownloadFiles/`、`test/_tmp/binManifest/`、`test/_tmp/WDocxSplit/`,測試自行刪除.
- 變更紀錄: 2026-10-28 改造(主控任務 20261028054319,bin-docxsplit).
