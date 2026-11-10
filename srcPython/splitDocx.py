from win32com import client as wc  

#使用win32com
#win32com因更新問題會出現 ImportError: DLL load failed while importing win32api: 找不到指定的模組。
#1. 安裝 pip install pywin32
#2. 使用系統管理員權限開啟cmd
#3. cd至安裝目錄 C:\ProgramData\Anaconda3\Scripts
#4. 用python安裝腳本 python pywin32_postinstall.py -install

#編譯
#1. 安裝編譯套件 pip install pyinstaller
#2. 編譯 pyinstaller -F splitDocx.py

#win32com教學
#https://zhuanlan.zhihu.com/p/67543981


def getError():
    import sys

    #exc_info
    type, message, traceback = sys.exc_info()

    #es
    es=[]
    while traceback:
        e={
            'name':traceback.tb_frame.f_code.co_name,
            'filename':traceback.tb_frame.f_code.co_filename,
        }
        es.append(e)
        traceback = traceback.tb_next

    #err
    err={
        'type':type,
        'message':message,
        'traceback':es,
    }

    return err


def j2o(v):
    #json轉物件
    import json
    return json.loads(v)


def o2j(v):
    #物件轉json
    import json
    return json.dumps(v, ensure_ascii=False)


def str2b64(v):
    #字串轉base64字串
    import base64
    v=base64.b64encode(v.encode('utf-8'))
    return str(v,'utf-8')
    

def b642str(v):
    #base64字串轉字串
    import base64
    return base64.b64decode(v).decode('utf-8')


def readText(fn):
    #讀取檔案fn內文字
    import codecs
    with codecs.open(fn,'r',encoding='utf8') as f:
        return f.read()

    
def writeText(fn,str):
    #寫出文字str至檔案fn
    import codecs
    with codecs.open(fn,'w',encoding='utf8') as f:
        f.write(str)


def isSamePath(fp1, fp2):
    #兩路徑是否為同一檔(大小寫, 相對路徑, 符號連結與短檔名皆正規化); 無法判定時視為不同
    import os
    try:
        return os.path.normcase(os.path.realpath(fp1)) == os.path.normcase(os.path.realpath(fp2))
    except:
        return False


def isOutputName(fpIn, fdOut, padZero):
    #輸入檔是否可能被本次分割之輸出覆寫: 輸入檔位於fdOut, 且檔名為輸出檔名之形式(1.docx~n.docx, padZero>0時依位數補0之001.docx~)
    #  輸出檔名見splitDocx之fn; 總數n分割前未知, 故不限上限(寧可判為可能, 屬較嚴之一側: 此時輸入檔以可寫開啟, 與改前相同)
    import os
    try:
        if not isSamePath(os.path.dirname(os.path.abspath(fpIn)), fdOut):
            return False
        stem, ext = os.path.splitext(os.path.basename(fpIn))
        if ext.lower() != '.docx' or not stem.isascii() or not stem.isdigit() or int(stem) < 1:
            return False
        fn = str(int(stem))
        if isinstance(padZero, int) and padZero > 0:
            fn = fn.zfill(padZero)
        return fn == stem
    except:
        return False


def countOtherDocs(app, docsLeft):
    #實例內非本行程之文件數, 含受保護檢視之視窗(其不在Documents內); docsLeft為本行程關閉失敗而仍開著者, 以COM物件身分比對(不以路徑: 他人可能重開同一路徑)
    #回傳(數量, 狀態): 狀態'ok'為已判定, 'gone'為實例已不存在(如已被他人Quit), 'unknown'為無法判定(忙碌或讀取失敗)
    import time
    import pythoncom

    #實例已不存在之錯誤: RPC_S_SERVER_UNAVAILABLE, RPC_S_CALL_FAILED, RPC_E_DISCONNECTED
    hrsGone = (-2147023174, -2147023170, -2147417848)

    for i in range(10):
        try:
            try:
                n = app.ProtectedViewWindows.Count
            except AttributeError:
                n = 0 #無此集合之Word版本
            for d in app.Documents:
                if not any(d == o for o in docsLeft):
                    n += 1
            return n, 'ok'
        except pythoncom.com_error as e:
            if getattr(e, 'hresult', None) in hrsGone:
                return 0, 'gone'
        except:
            pass
        time.sleep(0.5) #他人呼叫中(忙碌)等暫時失敗, 稍候重試
    return None, 'unknown'


def closeDoc(docs, doc):
    #關閉本行程開啟之文件, 成功才自docs移除(失敗者仍屬本行程, 由closeOwnWord再試並於盤點時排除)
    WdDoNotSaveChanges = 0 #wdDoNotSaveChanges
    try:
        doc.Close(WdDoNotSaveChanges)
        for i in range(len(docs)):
            if docs[i] is doc: #以物件識別比對, 不經COM
                del docs[i]
                break
    except:
        pass


def closeOwnWord(app, docs):
    #關閉本行程開啟之文件, 再結束本行程所開之Word實例; 實例內另有他人之文件或無法判定時不結束
    #why: DispatchEx所開之實例仍登錄於ROT, 他行程以Dispatch(先GetActiveObject)可連上並於其中開文件(實測), 此時Quit會關掉對方之文件且不儲存;
    #  連上者(舊寫法)用畢自會Quit, 故保留實例; 無法判定時亦保留(寧可留下實例, 不關他人之文件); 盤點與Quit之間他人仍可連入, 此窗口無法消除
    import sys

    #Close, 關閉失敗者仍屬本行程
    WdDoNotSaveChanges = 0 #wdDoNotSaveChanges
    docsLeft = []
    for doc in reversed(docs):
        try:
            doc.Close(WdDoNotSaveChanges)
        except:
            docsLeft.append(doc)

    #nOther
    nOther, st = countOtherDocs(app, docsLeft)
    if st == 'gone':
        return
    if st != 'ok' or nOther > 0:
        print('Word instance is kept since ' + (f'{nOther} document(s) opened by another client' if st == 'ok' else 'its documents can not be checked'), file=sys.stderr)
        return

    #Quit
    WdSaveOptions = 0 #wdDoNotSaveChanges=0(不儲存擱置中變更) #https://learn.microsoft.com/zh-tw/office/vba/api/word.wdsaveoptions
    try:
        app.Quit(WdSaveOptions)
    except:
        pass


def splitDocx(fpIn, strSep, fdOut, opt):

    #DispatchEx, 每次另開獨立之Word實例(CoCreateInstanceEx, 實測已有其他Word時亦另起WINWORD)
    #why: Dispatch會先以GetActiveObject連上已在執行之Word(他行程之轉檔或使用者開啟者), 轉完Quit即關掉對方之文件且不儲存, 兩邊同時分割則互相失敗
    app = wc.DispatchEx('Word.Application')

    #docs, 本行程開啟之文件(輸入檔與各輸出檔), 由splitDocxCore推入
    docs = []

    #任一步驟(含下列設定)例外時亦須關閉已開啟之文件並結束本行程所開之Word, 否則殘留之WINWORD會鎖住輸入檔與輸出檔, 使後續分割失敗
    try:

        #正式版須隱藏
        app.Visible = False

        #不詢問使用者
        app.DisplayAlerts = False

        return splitDocxCore(app, docs, fpIn, strSep, fdOut, opt)

    finally:
        closeOwnWord(app, docs)


def splitDocxCore(app, docs, fpIn, strSep, fdOut, opt):

    # padZero
    padZero = opt.get('padZero', None)

    # Open, 開啟之文件推入docs, 供splitDocx於finally以closeOwnWord關閉
    #  以唯讀開啟(Open之參數依序為FileName, ConfirmConversions, ReadOnly): 本分割器只SaveAs2輸出檔, 不存回輸入檔;
    #  惟輸入檔可能被輸出覆寫時(位於fdOut且檔名為輸出檔名之形式)須可寫開啟, 與改前行為相同
    #why: 各分割各自一個Word實例, 兩個分割以可寫方式同開同一輸入檔時, 後開者跳出「檔案使用中」對話框而停住(實測)
    docIn = app.Documents.Open(fpIn, False, not isOutputName(fpIn, fdOut, padZero))
    docs.append(docIn)

    # 逐段落掃描
    # Word 的 Paragraphs 索引是 1-based
    # 先掃一次切成多組 paragraph index 區間
    groups = []
    cur = []
    i = 0
    for p in docIn.Paragraphs:
        i += 1
        t = p.Range.Text or ""

        # 判斷是否為分隔段
        is_sep = (strSep in t)

        if is_sep:
            if len(cur) > 0:
                groups.append(cur)
            cur = []
        else:
            cur.append(i)

    if len(cur) > 0:
        groups.append(cur)

    # 沒任何內容也要合理處理
    # groups 可能為 []，代表整份文件都是分隔符或空
    total = len(groups)

    # 逐組輸出
    for idx, paraIdxList in enumerate(groups, start=1):

        # 檔名：1.docx ~ n.docx
        if isinstance(padZero, int) and padZero > 0:
            fn = str(idx).zfill(padZero) + '.docx'
        else:
            fn = str(idx) + '.docx'

        # 若 fdOut 結尾已有\會變成\\, 得使用rstrip處理
        fpOut = fdOut.rstrip('\\/') + '\\' + fn

        # Add new document
        docOut = app.Documents.Add()
        docs.append(docOut)

        try:
            # 逐段落拷貝格式化內容（不走剪貼簿）
            # 用 rngOut 的結尾做 append
            rngOut = docOut.Content
            WdCollapseEnd = 0  # wdCollapseEnd
            for pi in paraIdxList:
                rngSrc = docIn.Paragraphs(pi).Range
                rngOut.Collapse(WdCollapseEnd)

                # 這句是關鍵：不經剪貼簿，直接拷貝格式化文字
                rngOut.FormattedText = rngSrc.FormattedText

            # SaveAs2
            WdSaveFormat = 16  # wdFormatDocumentDefault=16 (.docx)
            docOut.SaveAs2(fpOut, WdSaveFormat)

        finally:
            # Close output doc, 失敗者留在docs, 由closeOwnWord再試
            closeDoc(docs, docOut)

    return {
        'total': total,
        'fdOut': fdOut,
    }


def core(b64):
    state=''

    try:

        #b642str
        s=b642str(b64)

        #j2o
        o=j2o(s)

        #params
        fpIn=o['fpIn']
        strSep=o['strSep']
        fdOut=o['fdOut']

        #opt
        opt={}
        opt['padZero']=o['padZero']

        #splitDocx
        splitDocx(fpIn, strSep, fdOut, opt)

        state='success'
    except:
        err=getError()
        state='error: '+str(err["message"])

    return state


def run():
    import sys

    #由外部程序呼叫或直接給予檔案路徑
    state=''
    argv=sys.argv
    #argv=['','']
    if len(argv)==2:
        
        #b64
        b64=sys.argv[1]
        
        #core
        state=core(b64)
        
    else:
        #print(sys.argv)
        state='error: invalid length of argv'
    
    #print & flush
    print(state)
    sys.stdout.flush()


if True:
    #正式版
    
    #run
    run()
    
    
if False:
    #產生測試輸入b64
    
    #inp
    inp={
        'fpIn':'./test/docin.docx',
        'strSep':'[systag:sepline]',
        'fdOut':'./test',
        'padZero': 0,
    }
    # print(o2j(inp))
    
    #str2b64
    b64=str2b64(o2j(inp))
    print(b64)

    #core
    state=core(b64)

    print(state)

