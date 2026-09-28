// Keep the interface available when browser storage is blocked; never pretend a write succeeded.
export let storageReadError='';
export function readStored(key){try{return localStorage.getItem(key);}catch{storageReadError='Browser storage is blocked. Enable site storage to save records. You can still preview and export drafts.';return null;}}
export function defaultLanguage(){const requested=new URLSearchParams(location.search).get('lang');return ['en','zh'].includes(requested)?requested:readStored('smallworks.lang')||(navigator.language.startsWith('zh')?'zh':'en');}
