export function unityDataUrl(url:string) {
  // Older responses could persist an incomplete file in HTTP/Unity caches without a byte length.
  return /\.data\.gz(?:\?|$)/.test(url)?`${url}${url.includes('?')?'&':'?'}download=length-checked-v1`:url;
}

export function unityFailureMessage(reason:string) {
  if(/Invalid binary data|Unknown data format|Failed to download|could not download|Failed to fetch|NetworkError|Load failed/i.test(reason))
    return {title:'Game download interrupted',message:'The 3D game files did not download completely. Restore 3D to download a fresh copy. Your saved room and seat stay the same.',retry:true};
  if(/does not support WebAssembly|failed wasm-|WebGL.?2.*not support|does not support graphics API/i.test(reason))
    return {title:'Browser update needed',message:'Update your browser (and Android System WebView if using the Android app) to open this 3D board. You can continue in 2D in the same room.',retry:false};
  if(/does not support WebGL|context|graphics|GPU/i.test(reason))
    return {title:'3D graphics unavailable',message:'The browser could not start or keep its 3D graphics running. Close other 3D game tabs and restore this board, or continue in 2D.',retry:true};
  return {title:'Restore your board',message:'The 3D view could not open. Your confirmed moves stay saved. Restore the view or continue with the 2D board.',retry:true};
}
