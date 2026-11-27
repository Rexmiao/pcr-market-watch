// Read-only projection of already saved authorization metadata. Never returns
// credentials, validates connectivity, renews a token, or writes a bundle.
const iso=value=>Number.isFinite(value)&&value>0&&Number.isFinite(new Date(value).valueOf())?new Date(value).toISOString():null;
export function authorizationHealth(bundle,{now=()=>Date.now(),configured=Boolean(bundle),renewable=true}={}){
  if(!configured||!bundle)return {configured:false,status:'not_configured',accessExpiresAt:null,refreshExpiresAt:null,refreshExpiryKnown:false,renewable:false};
  if(bundle.scope!=='quote:read')return authorizationUnavailable();
  const accessExpiresAt=iso(bundle.expiresAt),refreshExpiresAt=iso(bundle.refreshExpiresAt);
  if(!accessExpiresAt)return authorizationUnavailable();
  const canRenew=renewable&&typeof bundle.refreshToken==='string'&&bundle.refreshToken.length>0&&(!refreshExpiresAt||bundle.refreshExpiresAt>now());
  const status=bundle.expiresAt>now()+60000?'available':canRenew?'refresh_needed':'reconnect_required';
  return {configured:true,status,accessExpiresAt,refreshExpiresAt,refreshExpiryKnown:refreshExpiresAt!==null,renewable:Boolean(canRenew)};
}
export function authorizationUnavailable(){return {configured:null,status:'unavailable',accessExpiresAt:null,refreshExpiresAt:null,refreshExpiryKnown:false,renewable:false};}
