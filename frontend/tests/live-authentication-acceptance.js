// Manual localhost-only acceptance. Never reads/logs the masked value through MCP.
// User clicks the form after this preparation tool has returned.
async(page)=>{
 await page.evaluate(()=>{
  document.getElementById('auth-only-acceptance')?.remove();
  const panel=document.createElement('form');panel.id='auth-only-acceptance';
  Object.assign(panel.style,{position:'fixed',bottom:'20px',right:'20px',zIndex:'9999',background:'white',border:'2px solid #2678b9',borderRadius:'12px',padding:'20px',width:'340px',boxShadow:'0 5px 25px #0003'});
  panel.innerHTML='<h2 style="font-weight:bold">Authentication-only acceptance</h2><p style="font-size:13px;margin:8px 0">Sign in as the test Admin first. This verifies your password and session. It cannot delete trips or reports.</p><label>Current account password<input type="password" maxlength="1024" autocomplete="current-password" style="display:block;width:100%;padding:8px;border:1px solid #ccc;margin:8px 0" /></label><button type="submit" style="background:#0b2341;color:white;padding:8px 16px;border-radius:8px">Verify authentication only</button><p role="status" style="font-size:13px;margin-top:8px">Waiting for manual entry.</p>';
  panel.addEventListener('submit',async event=>{
   event.preventDefault();const input=panel.querySelector('input'),button=panel.querySelector('button'),status=panel.querySelector('[role=status]');
   if(button.disabled)return;button.disabled=true;
   let password=input.value;input.value='';
   window.__authenticationAcceptance={finished:false,mutationRequests:0};
   try{
    if(!password)throw Error('Enter your current password.');
    const {supabase}=await import('/src/lib/supabase.ts');
    const {apiPost}=await import('/src/services/api.service.ts');
    const before=(await supabase.auth.getSession()).data.session;
    if(!before)throw Error('Sign in with the dedicated Admin account first.');
    status.textContent='Checking authentication without deleting anything…';
    const request=apiPost('/auth/password-confirmation-check',{current_password:password},before.access_token);password='';
    const result=await request;
    if(!result.success||!result.data?.verified||result.data.destructive_operation!==false)throw Error(result.message??'Authentication check was not confirmed.');
    const refreshed=await supabase.auth.refreshSession();
    if(refreshed.error||!refreshed.data.session||refreshed.data.session.user.id!==before.user.id)throw Error('Original session did not survive verification/refresh.');
    const sessionId=token=>JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).session_id;
    const sameSession=sessionId(before.access_token)===sessionId(refreshed.data.session.access_token);
    if(!sameSession)throw Error('Provider session identity changed unexpectedly.');
    window.__authenticationAcceptance={finished:true,verified:true,originalUserPreserved:true,originalProviderSessionPreserved:true,refreshSucceeded:true,mutationRequests:0};
    status.textContent='Passed: password verified; original user and session preserved through refresh. No trips or reports changed.';
   }catch(error){window.__authenticationAcceptance={finished:true,verified:false,message:error instanceof Error?error.message:'Authentication check failed.',mutationRequests:0};status.textContent=window.__authenticationAcceptance.message;}
   finally{password='';input.value='';button.disabled=false;}
  });
  document.body.append(panel);
 });
 return {prepared:true,passwordReadByTool:false,deletionRequests:0};
}
