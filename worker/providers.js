// A cloud Worker cannot reach the desktop application's loopback listener.
// The local server intercepts these routes with the actual read-only adapter.
export function handleProviderApi(request) {
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/api/providers/moomoo/'))return null;
  const status=url.pathname.endsWith('/status')&&request.method==='GET';
  return new Response(JSON.stringify({provider:'moomoo',configured:false,connectionStatus:'local_backend_required',readOnly:true,capabilities:[],code:'LOCAL_BACKEND_REQUIRED',message:'The desktop moomoo API is available through the local backend. A cloud connection needs a separately configured local-to-cloud bridge.'}),{status:status?200:503,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}
