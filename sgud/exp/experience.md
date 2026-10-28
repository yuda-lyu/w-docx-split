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
- `WDocxSplit()` 在 `ensureBins` 之後的錯誤處理沿用原狀(exe 把 `error: …` 印到 stdout 且離開碼 0 時,`execProcess` 不 reject,函數仍回 `'ok'`)——此為既有行為,**本輪未動**(範圍外,見狀態檔〈已知缺口〉).
- 平行測試下 Word 只由 `test/WDocxSplit.test.mjs` 啟動(各案循序);輸出夾放 `test/_tmp/WDocxSplit/…`,原 `convert` 案維持用 `./test/out`.
- 測試鎖排隊可達數十分鐘(他套件獨佔負載試驗時);腳本類驗證(變異、UMD 建置)併入同一次 `--lock` 內執行,減少排隊次數.
- 變異用副本放 `./tmp/bin-docxsplit/` 下(父層 `node_modules` 自動解析,免目錄連結);`.npmignore`、`.gitignore`、`WDocxSplit.mjs`、`README.md`、`gDistRollup.mjs` 為 CRLF,字串式變異須用 `\r?\n` 或逐行比對.
