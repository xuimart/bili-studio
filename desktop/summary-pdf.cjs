const {BrowserWindow}=require('electron');
async function renderPdf(html){
 const window=new BrowserWindow({show:false,width:900,height:1100,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,spellcheck:false}});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.session.setPermissionRequestHandler((_wc,_p,cb)=>cb(false));
 try{
  await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));
  await window.webContents.executeJavaScript('document.fonts.ready.then(()=>true)');
  return await window.webContents.printToPDF({printBackground:true,preferCSSPageSize:true,generateTaggedPDF:true,generateDocumentOutline:true,displayHeaderFooter:true,headerTemplate:'<span></span>',footerTemplate:'<div style="font-size:9px;width:100%;text-align:center;color:#777">Bili Studio · <span class="pageNumber"></span> / <span class="totalPages"></span></div>'});
 }finally{window.destroy();}
}
module.exports={renderPdf};
