# 回饋

任務中發現之自有套件、全域技能、全域設定之調整與抽提提案(只增不改;處置結果另記一列並寫明承接哪一列).

| # | 日期 | 類別 | 對象 | 內容 | 依據 |
| --- | --- | --- | --- | --- | --- |
| 1 | 2026-11-11 | 自有套件 | w-html2docx、w-docx2html、w-docx2pdf、w-docx-split 共用之 Word 測試輔助(`test/tools/wordInstance.mjs`) | 該輔助(他行程 Word、借用者、可見視窗看門狗、停用項目清除,約 380 行)已在 4 個套件各複製一份,日後修正(如 w-docx2html 加入之 `attachMs`/`waitDocs`/RPC 斷線不重試)須逐包同步,宜抽提為單一自有套件(僅供測試用)或由主控維護單一正本;`docxFixture.mjs`(最小 docx 產生器)與本套件新增之 `docxXml`(讀取輸出 docx 內文)同理 | 本輪自 w-docx2html 複製 `wordInstance.mjs`、`docxFixture.mjs`、`binEnv.mjs`;`test/tools/` |
| 2 | 2026-11-11 | 自有套件 | w-docx-split(`srcPython/build.bat`) | `build.bat` 為舊式手動多步驟(`pyinstaller -F`、不存在之 `build.spec`、onedir 各接 `pause`,且 `-F` 會重產 `splitDocx.spec`),不能無人值守建置;宜改為單一指令(`python -m PyInstaller splitDocx.spec --noconfirm --clean --distpath ..\bin`,並同步 `src/splitDocx.exe`),另案(同 w-docx2html feedback #3) | `srcPython/build.bat`;本輪改以 `python -m PyInstaller srcPython/splitDocx.spec …` 建到暫存夾再複製 |
| 3 | 2026-11-11 | 全域技能 | 新建之 Word COM 自動化隔離修正技能(承 w-html2docx feedback #4、w-docx2html feedback #5) | 同形套件(w-html2docx、w-docx2html、w-docx-split、w-docx2pdf)的修正與驗證步驟高度重複,宜成技能:①`DispatchEx` + `closeOwnWord`/`countOtherDocs` + 唯讀開啟三件成套;②驗證法(他行程 Word、借用者、看門狗、DisabledItems 清除、模擬夾 `mkrc`/`runrc`、L3 等價比對、變異體建置);③各形態輸入之長任務同步點(html 引用 http 圖〔可扣住〕、docx 輸入〔以大量段落或拉長參數,不可用含外部連結圖之 docx:會跳安全性注意事項〕、分割〔輸出檔出現〕);④唯讀開啟可由 `~$` 擁有者檔斷言(可寫時 Word 於檔旁建立);⑤模擬夾下 `unit-binManifest` 之「釘選提交位元組」案必紅(待主控提交後轉綠)的預期處置 | 本輪 `sgud/exp/experience.md`〈Word 實例隔離〉;`sgud/rule/rulebook.md` R-WORD |
| 4 | 2026-11-11 | 全域設定 | 全域設定 §8 或專案共通守則之測試鎖與等待 | 長任務等待:前景 `until … sleep` 迴圈可行(每次 ≤10 分鐘),而共通守則 7 要求同回合輪詢;守門 hook 擋 `sleep N` 後接指令,但未說明 `until` 迴圈可用,agent 易誤以為只能 `Monitor`;建議在守則 7 或 §8.5 補一句可用之等待寫法 | 本輪被擋一次(`sleep 60; …`),改以 `until grep -q … ; do sleep 5; done` 通過 |
