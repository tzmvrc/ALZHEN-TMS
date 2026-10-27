export function rememberedEmail(){try{return localStorage.getItem('alzhen.remembered-email')??'';}catch{return '';}}
export function rememberEmail(email:string,remember:boolean){try{if(remember)localStorage.setItem('alzhen.remembered-email',email);else localStorage.removeItem('alzhen.remembered-email');}catch{/* Remembering an email is optional; credentials are never persisted here. */}}
