import sys,json,zipfile,xml.etree.ElementTree as ET
from pathlib import Path
sys.stdout.reconfigure(encoding="utf-8")
p=Path(sys.argv[1]); ext=p.suffix.lower(); chunks=[]; warnings=[]; count=0

def add(locator,text,page=None):
    global count
    text=text.strip()
    if not text:return
    count+=len(text)
    if count>4000000:raise ValueError("提取文字超过400万字，请拆分文件")
    for i in range(0,len(text),4000):
        chunks.append(dict(locator=locator+(f" · 片段{i//4000+1}" if len(text)>4000 else ""),text=text[i:i+4000],page=page))
    if len(chunks)>20000:raise ValueError("片段过多，请拆分文件")
try:
    if ext in ['.txt','.md','.markdown']:
        b=p.read_bytes()
        if b.startswith((b'\xff\xfe',b'\xfe\xff')):text=b.decode('utf-16')
        else:
            try:text=b.decode('utf-8-sig')
            except UnicodeDecodeError:text=b.decode('gb18030')
        if '\x00' in text:raise ValueError('文件可能不是纯文字')
        for i,line in enumerate(text.splitlines(),1):add(f'第{i}行',line)
    elif ext=='.docx':
        ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        with zipfile.ZipFile(p) as z:
            if sum(x.file_size for x in z.infolist())>80000000:raise ValueError('Word解压内容过大')
            root=ET.fromstring(z.read('word/document.xml'))
        body=root.find('w:body',ns);para=0;table=0
        for el in body:
            if el.tag.endswith('}p'):
                para+=1;add(f'正文第{para}段',''.join(t.text or '' for t in el.findall('.//w:t',ns)))
            elif el.tag.endswith('}tbl'):
                table+=1
                for ri,row in enumerate(el.findall('w:tr',ns),1):
                    for ci,cell in enumerate(row.findall('w:tc',ns),1):add(f'表{table} · 第{ri}行第{ci}格','\n'.join(''.join(t.text or '' for t in par.findall('.//w:t',ns)) for par in cell.findall('w:p',ns)))
        warnings.append('Word按正文段落和表格位置定位，不推算页码；图片、公式、页眉脚注等不在文字检索范围。')
    elif ext=='.pdf':
        from pypdf import PdfReader
        doc=PdfReader(p)
        if doc.is_encrypted:raise ValueError('PDF已加密，请提供可读取的副本')
        if len(doc.pages)>1500:raise ValueError('PDF超过1500页，请拆分文件')
        empty=[]
        for i,page in enumerate(doc.pages,1):
            text=page.extract_text() or ''
            if not text.strip():empty.append(i)
            add(f'PDF第{i}页',text,i)
        if empty:warnings.append('以下页无可提取文字，可能需要OCR：'+','.join(map(str,empty[:60])))
        warnings.append('PDF按文件页序定位；排版复杂的公式、表格和多栏文字需对照原件。')
    else:
        print(json.dumps({'status':'unsupported','message':'当前支持TXT、Markdown、DOCX和带文字层PDF','chunks':[]},ensure_ascii=False));sys.exit()
    status='ready' if chunks else ('needs_ocr' if ext=='.pdf' else 'empty')
    print(json.dumps({'status':status,'message':'；'.join(warnings) or ('可检索' if chunks else '没有可提取文字'),'chunks':chunks},ensure_ascii=False))
except Exception as e:
    print(json.dumps({'status':'error','message':str(e)[:400],'chunks':[]},ensure_ascii=False))
