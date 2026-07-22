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


def splitDocx(fpIn, strSep, fdOut, opt):

    #Dispatch
    app = wc.Dispatch('Word.Application')

    #正式版須隱藏
    app.Visible = False  

    #不詢問使用者
    app.DisplayAlerts = False 

    docIn = None
    try:

        # Open
        docIn = app.Documents.Open(fpIn)

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

        # padZero
        padZero = opt.get('padZero', None)

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
                # Close output doc
                try:
                    WdDoNotSaveChanges = 0  # wdDoNotSaveChanges
                    docOut.Close(WdDoNotSaveChanges)
                except:
                    pass

        return {
            'total': total,
            'fdOut': fdOut,
        }

    finally:
        # Close input doc & quit word
        try:
            if docIn is not None:
                WdDoNotSaveChanges = 0
                docIn.Close(WdDoNotSaveChanges)
        except:
            pass

        try:
            WdSaveOptions = 0  # wdDoNotSaveChanges
            app.Quit(WdSaveOptions)
        except:
            pass


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

