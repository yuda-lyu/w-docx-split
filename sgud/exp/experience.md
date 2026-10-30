# 累積經驗

本檔為執行工作時特有之累積經驗,留給後續之嘗試、執行與判斷,由agent自行編列、擴充與維護.過長時抽出舊者為`experience_<年月日>.md`,並於本檔註明何時抽出.

## 外部執行檔改制式規格(2026-10-28,bin-docxsplit)

- 範本來源: 主控任務 20261028054319 `agent-out/wsemi-run04-修正報告.md` §8 與第 1 批同類套件(w-html2docx、w-docx2html、w-process-status);規則見 `sgud/rule/rulebook.md` R-BIN-DOCXSPLIT-01.
- 本套件之 exe 由 `srcPython/` 以 PyInstaller 打包(`build.bat`: `pyinstaller -F splitDocx.py`,產物 `srcPython/dist/splitDocx.exe`),只以 argv 收 base64 JSON、**無交換檔**,故規格 §9「交換檔改 `os.tmpdir()`」與 rollup 之 `os` 皆不適用.重編後須把新 exe 同步複製到 `bin/` 與 `src/` 兩處(`src/` 供舊版自主幹下載),再走 U1 流程(提交推送 → `node toolg/genBinManifest.mjs --commit <提交>` → 測試 → 發布).
- 範本測試的變異盲點與本套件補法:
  - 單靠「快取檔存在」不足以證明主函數**執行的是快取檔**: 把 `prog` 換成 `src/splitDocx.exe` 時,`ensureBins` 仍照常把檔放進快取,斷言照過(變異存活風險).補法: `test/WDocxSplit.test.mjs` 以子行程在「模擬安裝夾」(套件夾只含 `src/*.mjs`、`bin/manifest.json`、`package.json`;`cwd/src`、套件夾 `src`、`bin` 皆放假檔誘餌)內分割,只有真正取自快取才會成功(子行程工具 `test/tools/splitChild.mjs`).
  - 驗證 `pkgRoot` 與工作目錄無關,**不能在測試行程內 `process.chdir` 後再呼叫**(`pkgRoot` 於模組載入時固定),須以子行程於他處工作目錄載入(`test/tools/ensureBinsChild.mjs`).
  - 驗證「不轉傳 `floatingManifestUrl`」須傳**無效值**: 該選項只在主幹模式生效,傳有效網址時轉傳與否行為相同(等價變異).
  - `WDocxSplit()` 無法注入 `fetch`: 以攔截 `globalThis.fetch` 斷言(鏡像供檔時一次都不被呼叫;走 GitHub 時只見釘選提交網址一次),攔截器只放行 `https://raw.githubusercontent.com/` 並改指本機 HTTP 伺服器,其餘一律拒絕.
  - T1(`npm pack --dry-run`)須先放誘餌檔(`test/_tmp/…/splitDocx.exe`、`bin-cache/_decoy_/splitDocx.exe`)才能使缺 `/test/_tmp/`、`/bin-cache/` 規則時確定性變紅;`mocha --parallel` 下他測試檔之夾具會與 T1 並行.
- `WDocxSplit()` 在 `ensureBins` 之後的錯誤處理沿用原狀(exe 把 `error: …` 印到 stdout 且離開碼 0 時,`execProcess` 不 reject,函數仍回 `'ok'`)——此為當時之既有行為,**該輪未動**;已於 2026-10-31 修(見下〈exe 內部失敗被當成功〉).
- 平行測試下 Word 只由 `test/WDocxSplit.test.mjs` 啟動(各案循序);輸出夾放 `test/_tmp/WDocxSplit/…`,原 `convert` 案維持用 `./test/out`.
- 測試鎖排隊可達數十分鐘(他套件獨佔負載試驗時);腳本類驗證(變異、UMD 建置)併入同一次 `--lock` 內執行,減少排隊次數.
- 變異用副本放 `./tmp/bin-docxsplit/` 下(父層 `node_modules` 自動解析,免目錄連結);`.npmignore`、`.gitignore`、`WDocxSplit.mjs`、`README.md`、`gDistRollup.mjs` 為 CRLF,字串式變異須用 `\r?\n` 或逐行比對.

## exe 內部失敗被當成功(2026-10-31,docxsplit)

- 屬實證據: 直接以 `bin/splitDocx.exe` 處理純文字檔(副檔名 `.docx`)與截半之 docx,stdout 為 `error: (-2147352567, '發生例外狀況。', (0, 'Microsoft Word', '檔案似乎已毀損。', …), None)`、離開碼 0;正常 docx 為 `success`.經 `WDocxSplit()` 修前回 `'ok'`、無輸出檔.根因: `splitDocx.py` 之 `core()` 以 `except:` 吞例外,`run()` 只 print;`execProcess` 只看離開碼.
- 作法: **不重建 exe**(重建須走 PyInstaller 與 U1 之釘選流程,且須主控提交推送),改在 `WDocxSplit()` 依輸出判定(`src/judgeSplitOutput.mjs`,fail-closed: 須有 `success` 行且無 `error:` 行).即使日後 exe 改以非 0 離開碼回報,輸出判定仍須保留(舊版 exe 可能被釘選).
- exe 以 ANSI 字碼頁輸出(中文系統 big5),`execProcess` 預設 utf8 解碼會成亂碼(U+FFFD);給 `codeCmd: 'auto'` 即可讀.測試以「訊息不含 U+FFFD」鎖住(變異 `C-no-codeCmd-auto` 被殺).
- 測試設計: 判定邏輯拆成純函數以便單元測試(不需 Word),真 Word 之整合案只覆蓋「非 docx、損毀 docx」兩種真實失敗;exe 之 sha256 釘在清單,無法以假 exe 替換,故不用假 exe 造失敗輸出.
- 0 位元組之 `.docx` 被 Word 當空白文件成功開啟(exe 回 `success`、輸出 `001.docx`),不屬 exe 失敗,別拿它當失敗案例.
- 變異腳本思路: 單一工作副本(`./tmp/docxsplit/mut/work`: `src/`、`bin/`〔exe 與清單〕、`test/`、`package.json`)逐式改 `src` 後以 mocha 絕對路徑執行,對照組前後各跑一次;變異字串避開 CRLF(只用單行子字串).
