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

## npm 包檢查隨發布範圍規格改斷言(2026-11-02,pk-docx-split)

- 舊 T1 斷言 `sgud/` 不入包,與現行 `dspec/自有套件之npm發布範圍.md`(npm 包＝git 版控之內容,`sgud/` 隨包)相反,全庫連動跟跑時紅;改為「不得入包」只列外部執行檔與壓縮檔、`bin/` 除清單外之檔、`CLAUDE*.md`、`tmp/`、`test/_tmp/`、`.env`,另斷言 `sgud/state/state.md` 與 `test/tools/*` 隨包.不要再於 T1 加 `docs/`、`test/`、`toolg/`、`sgud/` 之「不在」斷言.
- 變異以暫放假檔(`dist/_mut_fake.exe`、`src/_mut_fake.dll`)與暫改 `.npmignore`(加 `sgud`、加 `test/tools`、拿掉 `CLAUDE*.md`、拿掉 `tmp`)進行;逐式還原後以 `sha256sum` 與變異前比對,還原 `.npmignore` 時 Edit 的 `old_string` 須先確認唯一(曾因重複行而還原錯位,以 hash 比對發現並修正).
- `.npmignore` 一旦存在即不讀 `.gitignore`,首段須逐行抄錄 `.gitignore`;`#` 註解行與空行不影響 npm 打包(改寫前後 `npm pack --dry-run` 之檔案清單相同).

## exe 內部失敗被當成功(2026-10-31,docxsplit)

- 屬實證據: 直接以 `bin/splitDocx.exe` 處理純文字檔(副檔名 `.docx`)與截半之 docx,stdout 為 `error: (-2147352567, '發生例外狀況。', (0, 'Microsoft Word', '檔案似乎已毀損。', …), None)`、離開碼 0;正常 docx 為 `success`.經 `WDocxSplit()` 修前回 `'ok'`、無輸出檔.根因: `splitDocx.py` 之 `core()` 以 `except:` 吞例外,`run()` 只 print;`execProcess` 只看離開碼.
- 作法: **不重建 exe**(重建須走 PyInstaller 與 U1 之釘選流程,且須主控提交推送),改在 `WDocxSplit()` 依輸出判定(`src/judgeSplitOutput.mjs`,fail-closed: 須有 `success` 行且無 `error:` 行).即使日後 exe 改以非 0 離開碼回報,輸出判定仍須保留(舊版 exe 可能被釘選).
- exe 以 ANSI 字碼頁輸出(中文系統 big5),`execProcess` 預設 utf8 解碼會成亂碼(U+FFFD);給 `codeCmd: 'auto'` 即可讀.測試以「訊息不含 U+FFFD」鎖住(變異 `C-no-codeCmd-auto` 被殺).
- 測試設計: 判定邏輯拆成純函數以便單元測試(不需 Word),真 Word 之整合案只覆蓋「非 docx、損毀 docx」兩種真實失敗;exe 之 sha256 釘在清單,無法以假 exe 替換,故不用假 exe 造失敗輸出.
- 0 位元組之 `.docx` 被 Word 當空白文件成功開啟(exe 回 `success`、輸出 `001.docx`),不屬 exe 失敗,別拿它當失敗案例.
- 變異腳本思路: 單一工作副本(`./tmp/docxsplit/mut/work`: `src/`、`bin/`〔exe 與清單〕、`test/`、`package.json`)逐式改 `src` 後以 mocha 絕對路徑執行,對照組前後各跑一次;變異字串避開 CRLF(只用單行子字串).

## Word 實例隔離(2026-11-10,ds408)

- 範本與規則見 `sgud/rule/rulebook.md` R-WORD(來源 w-html2docx hd408、w-docx2html dh408;本套件為其三.機轉細節〔pywin32 `Dispatch` = `_GetGoodDispatch` 先 GetActiveObject、`DispatchEx` 之實例仍可被他行程連上、強制結束 Word 留下 DisabledItems、唯讀開啟避免「檔案使用中」〕不重述,見該二套件之 `sgud/exp/experience.md`).以下只記本套件特有者.
- **修前 exe 之紅(對舊 `Dispatch` 寫法)**:①他行程之隱藏 Word(H)存在時分割,不另起 WINWORD(借用 H);③例外路徑後 H 之文件數變 3(分割器之文件遺留在 H);②a 乙分割完,甲回 `物件已被刪除`(`-2146822463`);④借用者之最終讀取 `RPC 伺服器無法使用 0x800706BA`(實例已被 Quit);②b 兩分割各回 `遠端程序呼叫失敗 -2147023170`(8 次中 7 次失敗,另跳出「檔案使用中」與停用項目之 `#32770` 訊息框,看門狗各約 0.3 秒內結束).⑤(輸入即輸出)修前修後皆綠.
- **分割耗時由段落數決定**:分割器逐段落經 COM 掃描(`p.Range.Text`)與拷貝(`Paragraphs(pi).Range`、`FormattedText`),實測 500 段約 9 秒、1500 段約 29 秒(約每 1000 段 20 秒),故以 `genSplit`(每側 400 段,共 800 段,約 15~19 秒)造「分割進行中」之確定時點,不需 http 扣住點;並行案每側 150 段(兩個實例同跑每份約 6~10 秒).可觀察之同步點:分割器之 WINWORD 出現;借用者見實例內文件數達 1(輸入檔已開啟);第一份輸出檔(`001.docx`)出現而 `002.docx` 尚未完成.
- **唯讀開啟可由 `~$` 擁有者檔觀察**:可寫開啟時 Word 於輸入檔旁建立 `~$<檔名>.docx`,唯讀開啟不建立;①於分割進行中斷言夾內無 `~$` 檔,即不靠並行競賽(②b 之「檔案使用中」對話框)即可確定性地殺掉「輸入檔可寫開啟」之變異.
- **輸入檔即輸出檔之情境**:輸入檔為 `fdOut/001.docx`(`padZero` 3)時,Word 對第一份輸出之 `SaveAs2` 回 `-2146823135`(無法給一個與開啟文件相同的檔名),`WDocxSplit` 以 `[E_SPLIT_FAILED]` reject,輸入檔不變、無其他輸出;改前即如此,唯讀開啟亦同,故 `isOutputName` 之可寫例外不可觀察(變異「一律唯讀」存活,屬等價變異),保留以維持改前語意(與 w-docx2html 之 R-WORD-04 同).
- 分割器之 stderr 提示(`Word instance is kept since …`)與 stdout 之 `success` 由 `execProcess` 合併回傳;`judgeSplitOutput` 只看是否有 `error:` 起首行與整行 `success`,故保留實例時仍判成功(④ 實測).
- 輸出 docx 之讀取:Word 存出之 docx 為 deflate 壓縮,測試輔助 `docxFixture.mjs` 之 `docxXml` 以 zip 中央目錄自行讀取 `word/document.xml`(無第三方依賴;本套件無 `fflate`).
- 新舊 exe 之輸出等價(L3):3 組輸入(`test/docin.docx` 補零 3 位與不補零、500 段含中文與表情符號之生成 docx 補零 2 位)各跑舊 2 次、新 2 次,輸出各份 docx 之 `document.xml`、`styles.xml`、`numbering.xml`、`fontTable.xml`、`settings.xml`、`document.xml.rels`、`[Content_Types].xml` 去除 rsid 類標記後:前六者新舊相同;`settings.xml` 僅 `w:rsidRoot`/`w:rsid`/`w14:docId`/`w15:docId` 逐次不同(舊對舊、新對新亦同),為 Word 逐次雜訊.
- 建置:`srcPython/build.bat` 為舊式手動腳本(`pyinstaller -F`、不存在之 `build.spec`、onedir 各接 `pause`,且 `-F` 會重產 `splitDocx.spec`),不能無人值守;本輪以 `python -m PyInstaller srcPython/splitDocx.spec --noconfirm --clean --distpath <暫存夾> --workpath <暫存夾>` 建置(與 `-F` 等效,約 10 秒;spec 檔不變),再把產物複製到 `bin/` 與 `src/`(R-BIN-DOCXSPLIT-01 規則 2).產物由 11,184,180 縮為約 9.5 MB(建置環境 Python 3.14.3、PyInstaller 6.22.3;與 w-docx2html 同).每次建置位元組不同,故每次重建後須重產清單.
- **模擬夾不能通過「釘選提交位元組」案**:`unit-binManifest` 之「pin a commit whose bin/splitDocx.exe bytes equal the manifest」取 `manifest.commit` 內之 `git show` 位元組比對清單與實檔;模擬夾(新 exe＋改寫清單 sha256/大小、提交雜湊仍為舊值)下舊提交內為舊 exe,此案必紅,待主控提交新 exe 並以 `genBinManifest --commit <新提交>` 重產後才轉綠.不在模擬夾內自建提交(禁止 git commit);報告逐條列出此預期紅.
- 測試之 `mocha --grep` 排除單案:`--grep "(?=.*Word instance isolation)(?!.*1\.5)"`(②b 標題含 `1.5`,ASCII 即可);經 Git Bash 傳遞時勿以 `/` 起首.模擬夾(複製 repo 追蹤檔至 `./tmp/<任務>/rc/`,換入新 exe 並改寫清單)以包裝腳本內之 `spawnSync` 參數陣列(不經 shell)執行 mocha,模組自上層 `node_modules` 解析;取鎖仍以 repo 根為 `--cwd`(包裝腳本由 repo 根經 `quiet-run --lock` 執行).
