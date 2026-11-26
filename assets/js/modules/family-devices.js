async function familyDevicesTab(S,F,L){
 const note=(p,t)=>p.append(el("div","sub",t)), row=(p,...n)=>{const r=el("div","row");r.append(...n);p.append(r)};
 S.append(el("b",null,"Family workspace · members · approved devices"));
 let family=null,members=[],devices=[],accounts=[],links=[];
 const f=await sb.from("families").select("*").eq("owner_user_id",me.id).maybeSingle();
 if(f.error){note(S,f.error.message);return} family=f.data;
 if(!family){
  note(S,"Create your family workspace to manage members and devices.");
  const name=el("input");name.placeholder="Family name";const b=el("button","add","Create workspace");row(S,name,b);
  b.onclick=async()=>{if(!name.value.trim())return msg("Enter a family name.");b.disabled=true;
   let q=await sb.from("families").insert({name:name.value.trim(),owner_user_id:me.id});if(q.error){b.disabled=false;return msg(q.error.message)}
   q=await sb.from("families").select("*").eq("owner_user_id",me.id).single();if(q.error){b.disabled=false;return msg(q.error.message)}
   const m=await sb.from("family_members").insert({family_id:q.data.id,auth_user_id:me.id,display_name:prof?.name||me.email||"Owner",role:"admin",status:"active"});
   if(m.error){b.disabled=false;return msg("Workspace created; owner membership failed: "+m.error.message)}draw();
  };return;
 }
 const [mr,dr,ar,lr]=await Promise.all([
  sb.from("family_members").select("*").eq("family_id",family.id).order("created_at"),
  sb.from("family_devices").select("*").eq("family_id",family.id).order("created_at",{ascending:false}),
  sb.from("financial_accounts").select("id,account_type,institution,nickname,account_last4,is_active,family_id,family_member_id").eq("user_id",me.id).eq("is_active",true).order("institution"),
  sb.from("financial_account_devices").select("*").eq("family_id",family.id).eq("is_active",true)
 ]);
 for(const x of [mr,dr,ar,lr])if(x.error){note(S,x.error.message);return}
 members=mr.data||[];devices=dr.data||[];accounts=ar.data||[];links=lr.data||[];
 if(!members.some(x=>x.auth_user_id===me.id)){const z=await sb.from("family_members").insert({family_id:family.id,auth_user_id:me.id,display_name:prof?.name||me.email||"Owner",role:"admin",status:"active"});if(z.error){note(S,z.error.message);return}draw();return}
 S.append(el("div","sub",family.name+" · owner workspace"));
 S.append(el("b",null,"Members"));
 const mn=el("input");mn.placeholder="Add member (e.g. Zeba)";const mb=el("button","add","Add member");row(S,mn,mb);
 mb.onclick=async()=>{if(!mn.value.trim())return;mb.disabled=true;const z=await sb.from("family_members").insert({family_id:family.id,display_name:mn.value.trim(),role:"member",status:"active"});if(z.error){mb.disabled=false;return msg(z.error.message)}draw()};
 members.forEach(m=>S.append(el("div","item",m.display_name+" · "+m.role+" · "+m.status)));
 S.append(el("b",null,"Device registration · new devices require approval"));
 const dn=el("input");dn.placeholder="Friendly device name (Vikas Personal)";
 const owner=el("select");members.forEach(m=>{const o=el("option",null,m.display_name);o.value=m.id;owner.append(o)});
 const typ=el("select");[["iphone","iPhone"],["android","Android"],["ipad","iPad"],["tablet","Tablet"],["other","Other"]].forEach(([v,t])=>{const o=el("option",null,t);o.value=v;typ.append(o)});
 const add=el("button","add","Register pending");row(S,dn,owner,typ,add);
 add.onclick=async()=>{if(!dn.value.trim())return msg("Enter a device name.");add.disabled=true;
  const z=await sb.from("family_devices").insert({family_id:family.id,family_member_id:owner.value,device_identifier:dn.value.trim(),device_type:typ.value,status:"pending_approval",registered_by:me.id}).select("id").single();
  if(z.error){add.disabled=false;return msg(z.error.message)}
  await sb.from("family_device_audit").insert({family_id:family.id,device_id:z.data.id,actor_user_id:me.id,action:"registered",details:{device_identifier:dn.value.trim()}});
  msg("Device registered; it cannot import until approved.");draw();
 };
 devices.forEach(d=>{
  const m=members.find(x=>x.id===d.family_member_id),box=el("div","item"),left=el("div"),controls=el("div","row");
  left.append(el("b",null,d.device_identifier),el("div","sub",(m?.display_name||"Member")+" · "+d.device_type+" · "+d.status));
  const audit=async(action,details={})=>sb.from("family_device_audit").insert({family_id:family.id,device_id:d.id,actor_user_id:me.id,action,details});
  const rename=el("button","x","Rename");rename.onclick=async()=>{const v=prompt("Device identifier",d.device_identifier);if(!v?.trim())return;const z=await sb.from("family_devices").update({device_identifier:v.trim()}).eq("id",d.id);if(z.error)return msg(z.error.message);await audit("renamed",{from:d.device_identifier,to:v.trim()});draw()};controls.append(rename);
  if(["pending_approval","rejected","suspended"].includes(d.status)){const b=el("button","add","Approve");b.onclick=async()=>{const z=await sb.from("family_devices").update({status:"approved",approved_by:me.id,approved_at:new Date().toISOString(),revoked_by:null,revoked_at:null}).eq("id",d.id);if(z.error)return msg(z.error.message);await audit("approved");draw()};controls.append(b)}
  if(d.status==="pending_approval"){const b=el("button","x","Reject");b.onclick=async()=>{const z=await sb.from("family_devices").update({status:"rejected"}).eq("id",d.id);if(z.error)return msg(z.error.message);await audit("rejected");draw()};controls.append(b)}
  if(d.status==="approved"){const b=el("button","x","Suspend");b.onclick=async()=>{const z=await sb.from("family_devices").update({status:"suspended"}).eq("id",d.id);if(z.error)return msg(z.error.message);await audit("suspended");draw()};controls.append(b)}
  if(d.status!=="revoked"){const b=el("button","x","Revoke");b.onclick=async()=>{if(!confirm("Revoke this device?"))return;const z=await sb.from("family_devices").update({status:"revoked",revoked_by:me.id,revoked_at:new Date().toISOString()}).eq("id",d.id);if(z.error)return msg(z.error.message);await audit("revoked");draw()};controls.append(b)}
  box.append(left,controls);S.append(box);
 });
 F.append(el("b",null,"Banks and cards by device"));
 const df=el("select"),all=el("option",null,"All family devices");all.value="";df.append(all);devices.forEach(d=>{const o=el("option",null,d.device_identifier);o.value=d.id;df.append(o)});
 const tf=el("select");[["all","All account types"],["bank","Banks"],["credit_card","Credit cards"]].forEach(([v,t])=>{const o=el("option",null,t);o.value=v;tf.append(o)});
 row(F,df,tf);const out=el("div");F.append(out);
 const paint=()=>{out.textContent="";const ls=links.filter(x=>!df.value||x.device_id===df.value),ids=new Set(ls.map(x=>x.financial_account_id));
  const as=accounts.filter(a=>ids.has(a.id)&&(tf.value==="all"||a.account_type===tf.value));
  if(!as.length){note(out,df.value?"No accounts linked to this device yet.":"No accounts linked to approved family devices yet.");return}
  as.forEach(a=>{const names=ls.filter(x=>x.financial_account_id===a.id).map(x=>devices.find(d=>d.id===x.device_id)?.device_identifier).filter(Boolean);out.append(el("div","item",a.institution+" · "+a.nickname+" · •••• "+a.account_last4+" · "+names.join(", ")))})
 };df.onchange=tf.onchange=paint;paint();
 F.append(el("b",null,"Link an existing account to an approved device"));
 const as=el("select");accounts.forEach(a=>{const o=el("option",null,a.institution+" · "+a.nickname+" · •••• "+a.account_last4);o.value=a.id;as.append(o)});
 const ds=el("select");devices.filter(d=>d.status==="approved").forEach(d=>{const o=el("option",null,d.device_identifier);o.value=d.id;ds.append(o)});
 const link=el("button","add","Link account");row(F,as,ds,link);link.disabled=!as.options.length||!ds.options.length;
 link.onclick=async()=>{const a=accounts.find(x=>x.id===as.value),d=devices.find(x=>x.id===ds.value);if(!a||!d)return;
  if(a.family_member_id&&a.family_member_id!==d.family_member_id&&!confirm("Reassign account to this device owner?"))return;
  let z=await sb.from("financial_accounts").update({family_id:family.id,family_member_id:d.family_member_id}).eq("id",a.id);if(z.error)return msg(z.error.message);
  z=await sb.from("financial_account_devices").upsert({family_id:family.id,financial_account_id:a.id,device_id:d.id,discovery_source:"manual",is_active:true},{onConflict:"financial_account_id,device_id"});
  if(z.error)return msg(z.error.message);msg("Account linked.");draw();
 };
 L.append(el("b",null,"Recent device audit"));
 const au=await sb.from("family_device_audit").select("*").eq("family_id",family.id).order("created_at",{ascending:false}).limit(25);
 if(au.error)note(L,au.error.message);else if(!au.data?.length)note(L,"No audit events yet.");else au.data.forEach(x=>L.append(el("div","item",x.action+" · "+new Date(x.created_at).toLocaleString())));
}
