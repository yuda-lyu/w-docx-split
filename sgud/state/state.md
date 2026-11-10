# 狀態

本檔記 w-docx-split 各功能之**現況**(做到哪裡、對應之規則帳本條目與測試檔、已知缺口與待辦、最近一次驗證);只記現況、不寫過程(過程見 `sgud/exp/experience.md`).

## 依指定字串分割 docx(`WDocxSplit`)

- 現況: 僅 Windows;以 `splitDocx.exe`(`srcPython/` 以 win32com 驅動 Word,PyInstaller 打包)分割,輸入 base64 JSON(`fpIn`、`strSep`、`fdOut`、`padZero`),輸出 `001.docx`…;函數以字串 reject(參數錯誤、取不到執行檔、執行失敗).
- **exe 內部失敗判定(R-SPLIT-RESULT-01,2026-10-31 已修)**: exe 不論成敗離開碼皆為 0,故 `WDocxSplit()` 依輸出判定(`src/judgeSplitOutput.mjs`): 須有 `success` 行且無 `error:` 行才 resolve `'ok'`,否則 reject `[E_SPLIT_FAILED] 原因`(非 docx、損毀 docx 已實測 reject);輸出以 `codeCmd: 'auto'` 解碼.exe 本身未重建.對外行為變化見 README〈Breaking changes〉.
- 測試: `test/WDocxSplit.test.mjs`(需本機有 Word;執行檔以本機鏡像或本機 HTTP 伺服器供檔,不連外網;含 exe 失敗之 describe)、`test/unit-judgeSplitOutput.test.mjs`(純函數,不需 Word).指令: `npm test`.
- 已知缺口: ①Word 對 0 位元組之 `.docx` 視為空白文件並成功(exe 回 `success`、輸出 `001.docx`),屬 Word 行為、本輪未處理;②參數檢測之既有訊息(`fpIn[…] does not exist`、`strSep[…] is not an effective string`)回顯輸入值,與輸入參數規格 V20 不合,本輪範圍外未改;③分割中途失敗時,失敗前已寫出之 `00N.docx` 不清除.

## Word 實例隔離(R-WORD-01~05,主控排程第 408 項,ds408)

- 現況(2026-11-11,**第一段完成**): `srcPython/splitDocx.py` 已改為每次 `DispatchEx` 另起 Word、收尾經 `closeOwnWord`(只關本行程之文件;實例內有他人文件或無法判定時不 `Quit`)、輸入檔唯讀開啟(輸入檔位於 `fdOut` 且檔名為輸出檔名之形式者例外可寫);`bin/splitDocx.exe` 與 `src/splitDocx.exe`(兩處位元相同)已換為新建置,sha256 `1df933b6c593481021f77f8f2f1f70226e47208ad735ac7d64462ce88194ed73`、9518106 位元組(前版 `6954a731…`/11184180).`WDocxSplit` 之參數、回傳型態、輸出檔內容、`judgeSplitOutput` 皆不變.規則見 `sgud/rule/rulebook.md` R-WORD.
- **待辦(第二段,主控)**: 提交並推送後,依 U1 以 `node toolg/genBinManifest.mjs --commit <新提交>` 重產 `bin/manifest.json`(目前仍為前版: `commit` c85382f9a8ce42477844afa5b53b8df55e5a4b19、sha256 `6954a731…`、11184180),再跑全套.清單重產前 `npm test` 預期 21 條紅(皆為清單與 `bin/` 實檔不符所致:`unit-binManifest` 2〔T2 實檔比對、釘選提交位元組〕、`WDocxSplit` 內以鏡像取檔之 7 案、隔離組 `before all` 1〔其下 6 案未執行〕、`api-ensureBins` 9、`autoDownloadFiles` 2),清單重產後預期 55 passing / 0 failing / 0 pending(無其他 WINWORD 時).
- 測試: `test/WDocxSplit.test.mjs` 之 describe〈WDocxSplit Word instance isolation〉6 案(①③②a②b④⑤);輔助 `test/tools/wordInstance.mjs`、`docxFixture.mjs`、`binEnv.mjs`.與 `convert` 同檔(mocha `--parallel` 下不同檔會同時用 Word).整組前置:有任何其他 WINWORD 即整組略過.須在測試閘(Word 類全機一次一個)內執行.
- 已知限制: ①盤點與 `Quit` 之間他人仍可連入;②他人取用本行程已開之同一文件物件時,本行程之 Close 仍會關掉它(須對方改用 `DispatchEx`);③唯讀只解「檔案使用中」,編碼、密碼、修復、安全警告等互動仍可能出現(改前即有);④`isOutputName` 之可寫例外於 Word 16.0 不可觀察(輸入即輸出改前亦回報 `-2146823135`);⑤使用者互動中之可見 Word、檔案總管雙擊開檔(DDE)未實測(測試不得開可見視窗);⑥`countOtherDocs` 之「無法判定」分支無法在測試中注入(讀碼確認).
- 最近一次驗證(2026-11-11,ds408): 修前 exe(`6954a731…`)紅: ①③②a④ 4 案敗、②b 8 次分割 7 次敗(⑤ 修前修後皆綠);新 exe 綠: 隔離組 6 案通過,非競賽 5 案連續 3 次通過(3/3),②b 另獨立通過 5 次(每次 8 次分割,共 40 次分割 0 失敗);模擬夾(新 exe＋清單改為其 sha256/大小)全套 55 案 54 passing + 1 預期紅(`unit-binManifest` 釘選提交位元組案: 舊提交內為舊 exe,待主控提交後轉綠;排除該案 54 passing / 0 failing);變異 5 式: Dispatch〔M1〕、收尾一律 Quit〔M2〕、輸入檔可寫開啟〔M3〕、從不 Quit〔M5〕皆殺,一律唯讀〔M4〕存活〔等價,見限制④〕;新舊輸出等價(L3,3 組輸入).

## 外部執行檔 `splitDocx.exe`(R-BIN-DOCXSPLIT-01)

- 現況: 已改制式規格(2026-10-28,主控任務 20261028054319,B 類→釘選模式): `bin/splitDocx.exe`(主控已提交推送,提交 `c85382f9a8ce42477844afa5b53b8df55e5a4b19`)＋`bin/manifest.json`(由 `toolg/genBinManifest.mjs` 產生)＋`src/ensureBins.mjs`(轉呼叫 wsemi `fsEnsureBins`,wsemi 1.9.27).`WDocxSplit()` 經 `ensureBins({ names: 'splitDocx.exe' })` 取得路徑;`WDocxSplit.ensureBins` 與 `src/ensureBins.mjs` 供部署前預先取得;`autoDownloadFiles()` 保留為 `@deprecated` 薄包裝.已移除 `postinstall`、`scripts/install.mjs`、`src/downloadFiles.mjs`(自寫之 `fsDownloadFile` 直連).本套件無交換檔(exe 只收 argv),故無 `os.tmpdir()` 改動.
- 2026-11-11 更新(ds408): `bin/splitDocx.exe` 與 `src/splitDocx.exe` 已換為 Word 實例隔離版(見上節),`bin/manifest.json` 待主控提交推送後以 `genBinManifest --commit <新提交>` 重產(此前清單仍指向前版提交 c85382f…).
- 舊版相容: `src/splitDocx.exe` 保留於 repo(舊版自主幹下載;與 `bin/` 位元相同),不入 npm 包.
- npm 包範圍(2026-11-02,規則 R-BIN-DOCXSPLIT-01 之 10): 依 `dspec/自有套件之npm發布範圍.md` 原則 1~4,`sgud/`、`docs/`、`test/`、`toolg/` 隨包(`npm pack --dry-run` 78 檔,其中 `sgud/` 3 檔、`test/tools/` 2 檔);`.npmignore` 首段抄 `.gitignore`、其後只有第 1 條(外部執行檔)排除項並加註;`test/unit-binManifest.test.mjs` T1 之「不得入包」只列外部執行檔與壓縮檔、`bin/` 除清單外之檔、`CLAUDE*.md`、`tmp/`、`test/_tmp/`、`.env`,並斷言 `sgud/state/state.md`、`test/tools/*` 隨包.執行期 `src/`+`dist/`+`bin/` 共 286,493 B(原無大小斷言,未新增).
- 規則: `sgud/rule/rulebook.md` R-BIN-DOCXSPLIT-01.
- 測試: `test/unit-binManifest.test.mjs`、`test/api-ensureBins.test.mjs`(本機 HTTP `127.0.0.1:8967`、不連外網;子行程工具 `test/tools/ensureBinsChild.mjs`)、`test/WDocxSplit.test.mjs`(本機 HTTP `127.0.0.1:8968`;子行程工具 `test/tools/splitChild.mjs`).
- 已知缺口與待辦:
  1. 真實 GitHub 網址之下載未實測(測試不得連外網;網址形狀由本機伺服器路徑斷言).
  2. 至舊版淘汰後移除 `src/splitDocx.exe`(另案).
  3. `dist/` 隨發布重新產製(repo 內 `dist/` 仍為舊版);以現行 `toolg/gDistRollup.mjs` 設定建置到暫存夾並模擬安裝實測: UMD 可用、`ensureBins` 靜態屬性可用、快取落在模擬套件根、經 UMD 實際分割輸出 `001.docx`/`002.docx`.
  4. (已於 2026-10-31 處理,見上〈exe 內部失敗判定〉.)
  5. `toolg/gDistRollup.mjs` 有既有未使用之 `getFiles` import(eslint `no-unused-vars`),依規範只提出、未刪.
- 最近一次驗證(2026-11-02,pk-docx-split,npm 包檢查依 2026-11-02 裁示 A 改斷言): `npm test` 49 passing(修前 48 passing + 1 failing: 舊斷言要求 `sgud/` 不入包);變異 6 式皆殺(假 `.exe`、假 `.dll`、排除 `sgud`、排除 `test/tools`、移除 `CLAUDE*.md` 規則、移除 `tmp` 規則),還原後 `.npmignore` 與測試檔 sha256 與變異前相同;報告見主控任務 20261102182000 `agent-out/pk-docx-split-修正報告.md`.
- 前前次驗證(2026-10-31,docxsplit): `npm test` 49 passing(4 檔: `unit-binManifest`、`unit-judgeSplitOutput`、`api-ensureBins`、`WDocxSplit`);修前紅(非 docx、損毀 docx 回 `'ok'`)、本輪變異 15 式皆殺(對照組全綠);wsemi 1.9.33;報告見主控任務 20261031065406 `agent-out/docxsplit-修正報告.md`.
- 前次驗證(2026-10-28): `npm test` 35 passing;bin-docxsplit 變異 37 式皆殺;報告見主控任務 20261028054319 `agent-out/bin-docxsplit-修正報告.md`.
