const API_URL=import.meta.env.VITE_API_URL??"http://localhost:4000";
export class ApiError extends Error{status:number;constructor(status:number,message:string){super(message);this.status=status;}}
export async function api<T>(path:string,init:RequestInit={},token?:string):Promise<T>{
 const response=await fetch(`${API_URL}${path}`,{...init,headers:{"content-type":"application/json",...(token?{authorization:`Bearer ${token}`}:{}) ,...init.headers}});
 const body=await response.json() as {ok:boolean;data?:T;error?:{message?:string}};
 if(!response.ok||!body.ok)throw new ApiError(response.status,body.error?.message??"Request failed.");return body.data as T;
}
