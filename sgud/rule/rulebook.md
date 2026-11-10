# 規則帳本

本檔為套件設計與開發階段之規則帳本(藍圖),為要求程式碼須長成什麼樣,或由規格產出之測試(項目/說明/流程)有哪些,包含軸、單一擁有者、已知限制、破壞性變更紀錄,以及對應是哪些測試檔案或指令等,由agent自行編列、擴充與維護.當前已做到哪些記於`sgud/state/state.md`.過長時依類型拆為`rulebook_<類型>.md`,本檔只留索引.

**上游真理源為主控制式規格**,本檔只記本套件之實作須長成什麼樣並指回規格.

## 索引

| 規則 | 內容 |
|---|---|
| R-BIN-DOCXSPLIT-01 | 外部執行檔 `splitDocx.exe` 之存放、取得、校驗與離線(B 類,釘選模式) |
| R-SPLIT-RESULT-01 | `WDocxSplit()` 依 `splitDocx.exe` 之輸出判定成敗(exe 不論成敗離開碼皆 0) |
| R-WORD | 分割器須自行建立 Word 實例、只結束自己者、輸入檔唯讀開啟(R-WORD-01~05) |

## R-BIN-DOCXSPLIT-01 外部執行檔 splitDocx.exe 一律經 `ensureBins()`(wsemi `fsEnsureBins`)取得

- 依據: 制式規格 `C:\opensrcOper\dspec\外部執行檔之存放下載校驗與離線.md`(使用者 2026-10-28 裁示;以下「規格」皆指此檔,條號 S/M/D/O/E/T 為其條號);主控任務 20261028054319(bin-docxsplit).本套件於主控帳本 G10 為 **B 類**(改造前自主幹 `src/splitDocx.exe` 直連下載、不校驗),採**釘選模式**.
- 單一擁有者: `src/ensureBins.mjs`(轉呼叫 wsemi `fsEnsureBins`,`pkgRoot` 由本檔位置推得);清單 `bin/manifest.json`(`toolg/genBinManifest.mjs` 產生,不手寫).
- 規則:
  1. **存放**(S1、S2、S5): 執行檔放 repo `bin/splitDocx.exe`(納入 git,`.gitattributes` 設 `bin/** binary`);npm 包只含 `bin/manifest.json`(`.npmignore` 第 1 條段: `/bin/*`、`!/bin/manifest.json`、`src/splitDocx.exe`、`/test/_tmp/`;`/bin-cache/` 在首段抄自 `.gitignore`;**不排除 `sgud`**,見規則 10);`.gitignore` 列 `/bin-cache/`.
  2. **舊版相容**(S2): 舊版執行時自主幹 `src/splitDocx.exe` 下載,故 `src/splitDocx.exe` **保留於 repo、與 `bin/splitDocx.exe` 位元相同**(`test/unit-binManifest.test.mjs` 比對),不入 npm 包;至舊版淘汰後另案移除.該檔由 `srcPython/` 以 PyInstaller 打包而成,**更新執行檔時須同步 `bin/` 與 `src/` 兩處**.
  3. **清單**(M1、M2、M4): `mode: "pinned"`,`commit` 為含 `bin/splitDocx.exe` 之提交(40 碼),sha256 與大小由 `node toolg/genBinManifest.mjs --commit <提交>` 依實檔計算;`test/unit-binManifest.test.mjs` 比對清單與實檔,並比對釘選提交內之位元組(`git show <commit>:bin/splitDocx.exe`)＝清單＝工作樹.更新流程(U1): 替換 `bin/` 檔(並同步 `src/splitDocx.exe`,見規則 2)→ 提交並推 GitHub → `genBinManifest --commit <該提交>` → 跑測試 → 發布新版.
  4. **取得**(D1~D4、O1~O3): 只經 `ensureBins({ names: 'splitDocx.exe' })`;首次使用時下載,**不在 `postinstall` 下載**(已移除 `postinstall` 與 `scripts/install.mjs`);快取 `<套件根>/bin-cache/<sha256>/splitDocx.exe`(`W_BIN_CACHE` 時為 `<W_BIN_CACHE>/w-docx-split/<sha256>/splitDocx.exe`);鏡像 `W_BIN_MIRROR`;離線 `W_BIN_OFFLINE=1`.**不得**另寫下載、快取、鏡像、校驗(`src/downloadFiles.mjs` 之 `fsDownloadFile` 直連已刪除).
  5. **匯出**(D1、E2③): `src/ensureBins.mjs` 之預設匯出;主檔 `WDocxSplit.ensureBins`(靜態屬性,因 UMD 主檔為預設匯出單一函數,不加具名匯出以免改變 `require()` 之形狀).`autoDownloadFiles()`(`src/autoDownloadFiles.mjs`,對外深層匯入點)保留為 `@deprecated` 薄包裝,回傳 `{ fpExe }`(位於快取),內部亦經 `ensureBins`.
  6. **reject 型態**(E3): `WDocxSplit()` 既有以字串 reject,取不到執行檔時為 `[code] message`(如 `[E_OFFLINE_MISSING] …`);`ensureBins()` 與 `autoDownloadFiles()` 則 reject 帶 `code` 之 Error.
  7. `ensureBins()` 不轉傳 `opt.floatingManifestUrl`(改變清單信任錨).
  8. **交換檔**(規格 §9): 本套件之 exe 僅以 argv 收 base64 JSON、不寫交換檔,故無須改 `os.tmpdir()`;日後若新增交換檔,不得寫快取夾(執行檔所在夾).
  9. **rollup UMD**(規格 §9): `toolg/gDistRollup.mjs` 之 external/globals 含 `url`、`crypto`、`stream`、`stream/promises`(`os` 僅交換檔需要,本套件不用).
  10. **npm 包範圍**(`C:\opensrcOper\dspec\自有套件之npm發布範圍.md` 原則 1~4;使用者 2026-11-01、2026-11-02 裁示): npm 包＝git 版控之內容,`sgud/`、`docs/`、`test/`、`toolg/` 皆隨包;`.npmignore` 首段完整抄錄 `.gitignore`,其後只有第 1 條(外部執行檔與其附屬)之排除項並逐項加註;不排除 `sgud/`、`test/tools/`.T1 之「不得入包」只列: 外部執行檔與壓縮檔(`.exe`、`.dll`、`.node`、`.msi`、`.zip`、`.7z`、`.gz`、`.tgz`、`.NNN` 分片)、`bin/` 除 `manifest.json` 外之檔、`CLAUDE*.md`、`tmp/`、`test/_tmp/`、`.env`;並斷言 `sgud/state/state.md` 與 `test/tools/*` 隨包.大小上限(只計 `src/`、`dist/`、`bin/`)本套件原無此斷言,未新增(門檻由主控判定).`.gitignore` 改動時 `.npmignore` 首段同步.
- 盤點指令: Grep `fsDownloadFile|downloadFiles|raw/refs/heads|raw\.githubusercontent` 於 `src/`、`scripts/`、`toolg/`(應無下載站點);`node C:/opensrcOper/tools/scan-bins.mjs --only w-docx-split`(應為 OK).
- 站點全集與判準: 外部執行檔 1 個(`splitDocx.exe`,自有檔);取得站點 1 個(`src/WDocxSplit.mjs` 之 `ensureBins`,以及薄包裝 `src/autoDownloadFiles.mjs`);下載站點 0 個(下載只在 wsemi `fsEnsureBins` 內).
- 測試: `test/unit-binManifest.test.mjs`(M1/M2/M4、T1〔含誘餌檔;npm 包範圍依規則 10〕、T2、S2 舊版相容、釘選提交位元組、D1 無安裝時下載、src 無自寫下載、gDistRollup 外部模組)、`test/api-ensureBins.test.mjs`(T3~T7、環境變數、pkgRoot 與載入時之工作目錄無關〔子行程工具 `test/tools/ensureBinsChild.mjs`〕、不轉傳 `floatingManifestUrl`、`WDocxSplit.ensureBins` 與薄包裝〔全域 fetch 攔截〕;本機 HTTP `127.0.0.1:8967`、本地資料夾鏡像、不連外網;T8 為主幹模式專屬,不適用)、`test/WDocxSplit.test.mjs`(功能測試需本機有 Word: 鏡像供檔、經全域 fetch 走釘選網址〔本機 `127.0.0.1:8968`〕、模擬安裝夾〔套件夾無執行檔、他處 cwd,子行程工具 `test/tools/splitChild.mjs`〕、取不到時之字串 reject).夾具 `test/_tmp/ensureBins/`、`test/_tmp/autoDownloadFiles/`、`test/_tmp/binManifest/`、`test/_tmp/WDocxSplit/`,測試自行刪除.
- 變更紀錄: 2026-10-28 改造(主控任務 20261028054319,bin-docxsplit);2026-11-10 換版為 Word 實例隔離之分割器(R-WORD,主控排程第 408 項;`bin/` 與 `src/` 兩處同步〔規則 2〕,清單待主控提交後重產〔規則 3〕).

## R-SPLIT-RESULT-01 `WDocxSplit()` 依 `splitDocx.exe` 之輸出判定成敗

- 依據: 主控排程第 170 項(任務 20261031065406,docxsplit);專案原則 14(不做舊版相容);輸入參數規格 `C:\opensrcOper\dspec\輸入參數之檢測機制.md` §5.1(Promise 者 reject、不同步 throw)、§6 V20(不回顯輸入值).
- 成因與事實: `srcPython/splitDocx.py` 之 `core()` 以 `except:` 吞掉所有例外,`run()` 只 `print(state)`(成功為 `success`,失敗為 `error: <訊息>`),不論成敗離開碼皆為 0,故 `execProcess` 不 reject.exe 以 ANSI 字碼頁(中文系統為 big5)輸出.
- 單一擁有者: `src/judgeSplitOutput.mjs`(純函數,回 `{ ok, msg }`);`src/WDocxSplit.mjs` 呼叫之.
- 規則:
  1. **依輸出判定,fail-closed**: 任一行(trim 後)以 `error:` 開頭 → 失敗(即使同時有 `success` 行);無 `error:` 行時須有整行為 `success` 之行才成功;空輸出、未知輸出、非字串一律失敗.不得改回只看離開碼.
  2. **失敗通道**(規格 §5.1): reject 字串 `[E_SPLIT_FAILED] 原因`(沿用本套件「字串 reject」之宣告型式與 `[code] message` 之呈現);原因取自 exe 之 `error:` 行(無原因時為固定說明);無 `error:` 行而判失敗時為固定說明 `splitDocx.exe returned no success result`,**不回顯其餘輸出**(規格 V20).Word 之診斷可能自行含檔名,不改寫.不同步 throw.
  3. **解碼**: `execProcess(prog, b64Input, { codeCmd: 'auto' })`,使 big5 之失敗訊息不亂碼.
  4. **不動之範圍**: 參數檢測之既有訊息(`fpIn[…] does not exist` 等,有回顯輸入值,與規格 V20 不合)本輪未改(範圍外);exe 未重建(離開碼仍為 0).若日後重建 exe 使失敗以非 0 離開碼結束,走 R-BIN-DOCXSPLIT-01 之更新流程(`execProcess` 之 reject 型態 `code[N]:\n…` 已在 `WDocxSplit()` 路徑上,本規則之輸出判定仍須保留,因舊版 exe 仍可能被釘選).
- 盤點指令: Grep `execProcess\(` 於 `src/`、`toolg/`、`g.mjs`(exe 呼叫點全集應只有 `src/WDocxSplit.mjs` 一處,且其後接 `judgeSplitOutput`).
- 站點全集與判準: exe 呼叫點 1 個(`src/WDocxSplit.mjs`,已套);`src/autoDownloadFiles.mjs`、`src/ensureBins.mjs` 只取得路徑、不執行(不適用);`toolg/genBinManifest.mjs` 不執行 exe(不適用).
- 測試: `test/unit-judgeSplitOutput.test.mjs`(11 案: 成功行、夾雜警告、`error:` 含空原因、error 優先、取首個、空輸出、未知輸出不回顯、整行比對、非字串不拋錯;不需 Word)、`test/WDocxSplit.test.mjs` 之 describe「when splitDocx.exe fails internally」(真 Word: 非 docx、損毀 docx 須 reject `[E_SPLIT_FAILED]`、訊息無亂碼、不含輸入路徑、無輸出檔;其後正常 docx 仍 resolve `ok`;需本機有 Word).
- 變更紀錄: 2026-10-31 新增(主控任務 20261031065406,docxsplit).

## R-WORD Word 實例須自行建立、只結束自己者

來源:主控排程第 408 項(2026-11-10,源自使用端之調查:兩行程同時轉檔,後者結束 Word 時關掉前者之文件).範本為 w-html2docx 之 `sgud/rule/rulebook.md`〈R-WORD〉與 w-docx2html 之同名節(docx 輸入;同形站點另有 w-docx2pdf);本節條號與其一致,內容依本套件(docx 輸入、分割為多份 docx 輸出)調整.

| 規則 | 內容 | 站點 | 驗證 |
|---|---|---|---|
| R-WORD-01 | 取得 Word 一律 `win32com.client.DispatchEx('Word.Application')`(CoCreateInstanceEx,每次另起 WINWORD;實測已有其他 Word 時亦另起).**不得**用 `Dispatch`:pywin32 之 `Dispatch` 內部先 `pythoncom.connect`(GetActiveObject)連上已在執行之 Word(他行程之分割或使用者開啟者),分割完 `Quit(0)` 即以不儲存結束對方 | `srcPython/splitDocx.py` 之 `splitDocx` | 〈Word instance isolation〉①②④ |
| R-WORD-02 | 只結束自己之實例:收尾一律經 `closeOwnWord`——關閉本行程之文件(輸入檔與各輸出檔;關閉失敗者仍屬本行程,以 COM 物件身分比對,不以路徑:他人可能重開同一路徑),再以 `countOtherDocs` 盤點實例內非本行程之文件(含不在 `Documents` 內之受保護檢視視窗 `ProtectedViewWindows`);有他人文件**或無法判定**(讀取失敗,有界重試 10×0.5 秒後)時**不 Quit**(stderr 印 `Word instance is kept since …`,不以 `error:` 起首,故 `judgeSplitOutput` 仍判成功),實例已不存在(RPC 斷線類錯誤)則不再動作,否則 `Quit(0)`.why:`DispatchEx` 所建之實例仍登錄於 ROT,他行程之 `Dispatch` 可連上並於其中開文件(實測);寧可留下實例,不關他人之文件.限制:盤點與 Quit 之間他人仍可連入;他人取用本行程已開之同一文件物件時,本行程之 Close 仍會關掉它(須對方改用 `DispatchEx`) | `closeOwnWord`,`countOtherDocs`,`closeDoc` | ④ |
| R-WORD-03 | 例外路徑不殘留:`Visible`/`DisplayAlerts` 之設定與分割同在 `try` 內,任何例外(含開檔失敗、`SaveAs2` 失敗)皆經 `finally` 之 `closeOwnWord`;每份輸出文件於其迴圈之 `finally` 以 `closeDoc` 關閉,失敗者留在 `docs` 由 `closeOwnWord` 再試 | `splitDocx`,`splitDocxCore` | ③ |
| R-WORD-04 | 輸入檔以唯讀開啟 `Documents.Open(fpIn, False, not isOutputName(fpIn, fdOut, padZero))`(位置參數依序為 FileName,ConfirmConversions,ReadOnly);分割器只 `SaveAs2` 至輸出檔.why:各分割各一個 Word 實例,兩分割以可寫方式同開同一輸入檔時,後開者跳出「檔案使用中」對話框(可見)而停住(實測;DisplayAlerts=False 擋不住);可寫開啟亦使 Word 於輸入檔旁建立擁有者檔 `~$…`.**例外**:輸入檔可能被輸出覆寫時(位於 `fdOut` 且檔名為輸出檔名之形式:`padZero` 為正整數時為依位數補 0 之 `001.docx`…,否則 `1.docx`…;總數 n 於分割前未知故不限上限)可寫開啟(同範本之同檔例外);於 Word 16.0 此情境改前即回報 error(儲存之檔名與開啟中之文件同名,`-2146823135`),唯讀開啟亦同一 error,故例外在本機不可觀察(等價變異),保留以維持改前語意.限制:唯讀只解此鎖檔情境,編碼、密碼、修復、安全警告等互動仍可能出現(改前即有) | `splitDocxCore`,`isOutputName`,`isSamePath` | ①(無 `~$` 擁有者檔);②(同一輸入檔同時,錯開 1.5 秒,交錯);⑤(保留測試) |
| R-WORD-05 | 不開可見視窗:`app.Visible = False`,`app.DisplayAlerts = False`;測試中扮演他行程之 Word 亦一律隱藏 | `splitDocx`,`test/tools/wordInstance.mjs` | 全組 |

- 三件須成套:R-WORD-01(`DispatchEx`)、R-WORD-02(只結束自己者,有他人文件或無法判定不 Quit)、R-WORD-04(唯讀開啟輸入檔,輸出即輸入者例外可寫);只做其一會互相抵觸(只改 `DispatchEx` 則並行分割同一輸入檔時跳「檔案使用中」;不加收尾判定則被借用之實例仍會關掉對方文件).
- 盤點指令:`git grep -n "Dispatch(\|DispatchEx(\|GetActiveObject\|\.Quit(\|Documents.Open(\|Documents.Add(" -- srcPython`:Word 取得站點 1 個(`DispatchEx(`,已套)、`Quit(` 1 個(`closeOwnWord` 內,已套)、`Documents.Open(` 1 個(輸入檔,已套唯讀)、`Documents.Add(` 1 個(各輸出文件,於迴圈內,以 `closeDoc` 關閉);不得再出現 `Dispatch('Word.Application')`.
- 對外行為不變:輸出檔(`001.docx`…)內容、`WDocxSplit` 之參數與回傳型態、`success`/`error:` 輸出協定、`judgeSplitOutput` 判定皆不動;`bin/` 與 `src/` 之 exe 位元相同(R-BIN-DOCXSPLIT-01 規則 2).
- 驗證法:`test/WDocxSplit.test.mjs` 之 describe〈WDocxSplit Word instance isolation〉6 案(與 `convert` 同檔:mocha `--parallel` 下不同檔會同時用 Word):①他行程隱藏 Word(含未存文件)不被借用不被結束且輸入檔旁無 `~$`;③例外路徑(輸出夾不存在、輸入檔不存在、輸入檔非 docx)後他行程之 Word 不變;②a 交錯、②b 同一輸入檔並行(同時、錯開 1.5 秒各 2 次);④本行程之實例被他行程連上並開文件時不結束;⑤輸入檔即輸出檔之保留測試.輔助 `test/tools/wordInstance.mjs`(他行程 Word、借用者、可見視窗看門狗、停用項目清除)、`docxFixture.mjs`(最小 docx 產生器與輸出 docx 讀取)、`binEnv.mjs`(本機鏡像).輸入為 docx 無 http 資源可扣住,以大量段落之 docx(分割經 COM 逐段落掃描與拷貝,約每 1000 段 20 秒)使分割持續十餘秒,並以可觀察條件同步(分割器之 WINWORD 出現;借用者見實例內文件數達 1=輸入檔已開啟;首份輸出檔出現).整組前置:有任何其他 WINWORD 即整組略過;須在測試閘(Word 類全機一次一個)內執行.
- 注意:強制結束(taskkill)開著文件之 Word 會使 Word 把該文件列入 `HKCU\Software\Microsoft\Office\16.0\Word\Resiliency\DisabledItems`,其後每次開啟該檔都跳可見訊息框;測試輔助 `clearDisabledItems` 只清路徑在本 repo 之下者(見 `sgud/exp/experience.md`).
- 變更紀錄:2026-11-10 新增(主控排程第 408 項,ds408).
