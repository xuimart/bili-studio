function allowFullscreen(permission,url,base,isMainFrame=true){
 if(permission!=='fullscreen'||isMainFrame===false)return false;
 try{const trusted=new URL(base),request=new URL(url);return trusted.protocol==='http:'&&trusted.hostname==='127.0.0.1'&&!!trusted.port&&request.origin===trusted.origin&&!request.username&&!request.password;}catch{return false;}
}
module.exports={allowFullscreen};
