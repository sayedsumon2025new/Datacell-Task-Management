/* Styled Excel and printable PDF exports for the User Interface table. */
(function(global){
 'use strict';
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
 const column=i=>{let out='';for(i++;i;i=Math.floor((i-1)/26))out=String.fromCharCode(65+(i-1)%26)+out;return out};
 function zip(files){
  const enc=new TextEncoder(),parts=[],central=[];let offset=0;
  const header=(size,values)=>{const bytes=new Uint8Array(size),view=new DataView(bytes.buffer);for(const [at,value,len] of values)view[len===2?'setUint16':'setUint32'](at,value,true);return bytes};
  for(const [path,text] of Object.entries(files)){
   const name=enc.encode(path),body=enc.encode(text);let crc=0xffffffff;
   for(const byte of body){crc^=byte;for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0)}crc=(crc^0xffffffff)>>>0;
   const local=header(30,[[0,0x04034b50,4],[4,20,2],[6,0x800,2],[14,crc,4],[18,body.length,4],[22,body.length,4],[26,name.length,2]]);
   const directory=header(46,[[0,0x02014b50,4],[4,20,2],[6,20,2],[8,0x800,2],[16,crc,4],[20,body.length,4],[24,body.length,4],[28,name.length,2],[42,offset,4]]);
   parts.push(local,name,body);central.push(directory,name);offset+=local.length+name.length+body.length;
  }
  const length=central.reduce((sum,p)=>sum+p.length,0),end=header(22,[[0,0x06054b50,4],[8,Object.keys(files).length,2],[10,Object.keys(files).length,2],[12,length,4],[16,offset,4]]);
  return new Blob([...parts,...central,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
 }
 const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
 const xml=body=>'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+body;
 function xlsx(spec,rows,totals){
  const cell=(ref,value,style=0,number=false)=>number&&value!==''&&value!=null&&Number.isFinite(Number(value))?`<c r="${ref}" s="${style}"><v>${Number(value)}</v></c>`:`<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escape(value)}</t></is></c>`;
  const header='<row r="1" ht="45.75" customHeight="1">'+spec.map(([,label],i)=>cell(column(i)+'1',label,1)).join('')+'</row>';
  const total='<row r="2" ht="19.5" customHeight="1">'+spec.map(([key,,type],i)=>cell(column(i)+'2',i===0?'Total':type==='number'?totals[key]:'',1,type==='number')).join('')+'</row>';
  const body=rows.map((row,index)=>{const n=index+3;return `<row r="${n}" ht="20.625" customHeight="1">`+spec.map(([key,,type],i)=>{
   let value=row[key],style=0,number=type==='number';
   if(type==='date'&&/^\d{4}-\d{2}-\d{2}$/.test(value)){value=(Date.parse(value+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000;style=2;number=true}
   return cell(column(i)+n,value,style,number);
  }).join('')+'</row>'}).join('');
  return zip({
   '[Content_Types].xml':xml('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'),
   '_rels/.rels':xml('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
   'xl/workbook.xml':xml(`<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="User Interface" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">'User Interface'!$1:$2</definedName></definedNames></workbook>`),
   'xl/_rels/workbook.xml.rels':xml('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
   'xl/styles.xml':xml(`<styleSheet xmlns="${ns}"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><fonts count="2"><font><sz val="8.25"/><name val="Arial"/></font><font><b/><sz val="8.25"/><name val="Arial"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border>${['left','right','top','bottom'].map(side=>`<${side} style="thin"><color rgb="FF666666"/></${side}>`).join('')}<diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`),
   'xl/worksheets/sheet1.xml':xml(`<worksheet xmlns="${ns}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="20.625"/><cols>${spec.map(([, , ,width],i)=>`<col min="${i+1}" max="${i+1}" width="${((width-5)/7).toFixed(3)}" customWidth="1"/>`).join('')}</cols><sheetData>${header}${total}${body}</sheetData><printOptions gridLines="0"/><pageMargins left="0.2" right="0.2" top="0.2" bottom="0.2" header="0" footer="0"/><pageSetup paperSize="8" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`)
  });
 }
 function printHtml(spec,rows,totals){
  const widths=spec.reduce((sum,[,,,width])=>sum+width,0);
  return `<!doctype html><html><head><meta charset="utf-8"><title>User Interface</title><style>@page{size:A3 landscape;margin:8mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#000}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:0.5pt solid #666;padding:1px 3px;font-size:8px;vertical-align:middle;overflow-wrap:anywhere}thead{display:table-header-group}th{background:#FFF2CC;print-color-adjust:exact;-webkit-print-color-adjust:exact;font-weight:bold;text-align:center;height:45px}tr.totals th{height:20px}td{height:21px;text-align:left}td.number{text-align:center}tr{break-inside:avoid}</style></head><body><table><colgroup>${spec.map(([, , ,width])=>`<col style="width:${100*width/widths}%">`).join('')}</colgroup><thead><tr>${spec.map(([,label])=>`<th>${escape(label)}</th>`).join('')}</tr><tr class="totals">${spec.map(([key,,type],i)=>`<th>${i===0?'Total':type==='number'?escape(Number(totals[key].toFixed(6))):''}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>'<tr>'+spec.map(([key,,type])=>`<td class="${type==='number'?'number':''}">${escape(type==='date'&&row[key]?row[key].split('-').reverse().join('/'):row[key])}</td>`).join('')+'</tr>').join('')}</tbody></table></body></html>`;
 }
 global.UserInterfaceExports={xlsx,printHtml};
})(window);
