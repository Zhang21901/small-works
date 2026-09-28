export const CURRENCIES = ['USD','GBP','EUR','CNY','AUD','CAD','HKD','SGD','NZD','JPY'];
export const uid = () => globalThis.crypto.randomUUID();
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const today = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
export function validDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s||'')) return false;
  const d = new Date(s+'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0,10)===s && s>='1900-01-01' && s<='2200-12-31';
}
export function daysBetween(a,b) { if(!validDate(a)||!validDate(b)) throw Error('Invalid ISO date'); return Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000); }
export function addDays(date,n) { if(!validDate(date)) throw Error('Invalid date'); return new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10); }
export const digits = currency => currency==='JPY'?0:2;
export function moneyToMinor(value,currency='USD') {
  if (!CURRENCIES.includes(currency)) throw Error('Unsupported currency');
  const s=String(value??'').trim();
  const d=digits(currency);
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(s)) throw Error('Use 1234.56 or 1,234.56; no symbols / 请使用标准金额');
  const [whole,frac='']=s.replaceAll(',','').split('.');
  if(frac.length>d) throw Error(`Use at most ${d} decimal places`);
  const result=Number(whole)*10**d+Number(frac.padEnd(d,'0'));
  if (!Number.isSafeInteger(result)||result>1e12) throw Error('Amount too large');
  return result;
}
export const decimal = (minor,currency='USD') => (minor/10**digits(currency)).toFixed(digits(currency));
export const money = (minor,currency='USD') => new Intl.NumberFormat('en',{style:'currency',currency,maximumFractionDigits:digits(currency)}).format(minor/10**digits(currency));
export const balance = i => i.amount-i.paid;
export function validateInvoice(v) {
  if(!v||typeof v!=='object') throw Error('Invalid invoice');
  const str=(k,max=250)=>{ if(typeof v[k]!=='string'||v[k].length>max) throw Error(`Invalid ${k}`); return v[k].trim(); };
  const i={ id:str('id'),number:str('number',100),client:str('client'),email:str('email'),currency:str('currency'),due:str('due'),amount:v.amount,paid:v.paid,
    status:v.status||'open',promise:v.promise||'',nextContact:v.nextContact||'',notes:v.notes||'',history:v.history||[] };
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(i.id)||!i.number||!i.client||!CURRENCIES.includes(i.currency)||!validDate(i.due)) throw Error('Valid ID, invoice number, client, currency and ISO date are required');
  if(i.email&&!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(i.email)) throw Error('Invalid email');
  if(!Number.isSafeInteger(i.amount)||i.amount<=0||i.amount>1e12||!Number.isSafeInteger(i.paid)||i.paid<0||i.paid>i.amount) throw Error('Paid must be between 0 and invoice total');
  if(!['open','disputed','paused'].includes(i.status)) throw Error('Invalid invoice status');
  for(const k of ['promise','nextContact']) if(i[k]&&!validDate(i[k])) throw Error(`Invalid ${k} date`);
  if(typeof i.notes!=='string'||i.notes.length>10000) throw Error('Notes too long');
  if(!Array.isArray(i.history)||i.history.length>1000) throw Error('Invalid history');
  i.history=i.history.map(h=>{
    if(!h||typeof h.at!=='string'||!validDate(h.at)||typeof h.text!=='string'||h.text.length>10000) throw Error('Invalid activity entry');
    return {at:h.at,text:h.text};
  });
  return i;
}
export function actionFor(i,asOf=today()) {
  if(balance(i)===0) return 'paid';
  if(i.status==='disputed') return 'disputed';
  if(i.status==='paused') return 'paused';
  if(i.promise && i.promise>=asOf) return 'promised';
  if(i.nextContact && i.nextContact>asOf) return 'snoozed';
  if(i.promise && i.promise<asOf) return 'broken';
  const days=daysBetween(i.due,asOf);
  return days>30?'escalate':days>7?'followup':days>0?'gentle':days===0?'due':'upcoming';
}
export const actionable = (i,asOf=today())=>['broken','escalate','followup','gentle','due'].includes(actionFor(i,asOf));
export function prioritize(invoices,asOf=today()) {
  const rank={broken:5,escalate:4,followup:3,gentle:2,due:1};
  return invoices.filter(i=>actionable(i,asOf)).sort((a,b)=>(rank[actionFor(b,asOf)]-rank[actionFor(a,asOf)])||balance(b)-balance(a)||a.due.localeCompare(b.due));
}
export function metrics(invoices,asOf=today(),currency='USD') {
  const list=invoices.filter(i=>i.currency===currency);
  const sum=xs=>xs.reduce((s,i)=>s+balance(i),0);
  const overdue=list.filter(i=>balance(i)>0&&daysBetween(i.due,asOf)>0);
  const buckets=[0,0,0,0,0];
  for(const i of list){const d=daysBetween(i.due,asOf);buckets[d<=0?0:d<=7?1:d<=30?2:d<=60?3:4]+=balance(i);}
  return {outstanding:sum(list),overdue:sum(overdue),promised:sum(list.filter(i=>actionFor(i,asOf)==='promised')),actions:prioritize(list,asOf).length,buckets,open:list.filter(i=>balance(i)>0).length};
}
export function draftReminder(i,{asOf=today(),language='en',sender='Your team',tone='auto'}={}) {
  if(!actionable(i,asOf)) throw Error('Invoice is not in the follow-up queue');
  const kind=tone==='auto'?actionFor(i,asOf):tone;
  const amt=money(balance(i),i.currency);
  if(language==='zh') return {subject:`关于账单 ${i.number} 的付款跟进`,body:`您好，${i.client}：\n\n${kind==='broken'?`此前约定的付款日期为 ${i.promise}，目前我们还未记录到付款。`:`想与您确认一下账单 ${i.number} 的付款安排。`}\n该账单到期日为 ${i.due}，当前未付余额为 ${amt}。\n\n${['escalate','broken','firm'].includes(kind)?'请回复预计付款日期，以及是否存在需要我们协助解决的问题。':'方便时请确认付款计划。如需补充账单或验收资料，请告诉我们。'}\n如果您已付款，请将付款信息发给我们，以便核对记录。\n\n谢谢！\n${sender}`};
  return {subject:`Payment follow-up: invoice ${i.number}`,body:`Hi ${i.client},\n\n${kind==='broken'?`We had a payment date of ${i.promise} noted for invoice ${i.number}, but have not yet recorded the payment.`:`A quick check-in on invoice ${i.number}, due ${i.due}.`}\nThe outstanding balance is ${amt}.\n\n${['escalate','broken','firm'].includes(kind)?'Could you confirm a specific payment date and let us know if anything is blocking approval?':'Could you confirm this is in your payment queue? Happy to resend the invoice or any supporting details.'}\nIf you have already paid, please share the payment reference so we can update our records.\n\nThank you,\n${sender}`};
}
export function parseCSV(text) {
  if(typeof text!=='string'||text.length>2_000_000) throw Error('CSV exceeds 2 MB');
  text=text.replace(/^\uFEFF/,'');
  const counts=[',',';','\t'].map(d=>[d,0]);let headerQuoted=false;
  for(let n=0;n<text.length;n++){const ch=text[n];if(ch==='"'){if(headerQuoted&&text[n+1]==='"')n++;else headerQuoted=!headerQuoted;}else if(!headerQuoted){if(ch==='\r'||ch==='\n')break;const count=counts.find(x=>x[0]===ch);if(count)count[1]++;}}
  const delimiter=counts.sort((a,b)=>b[1]-a[1])[0][0];
  const rows=[];let row=[],field='',quoted=false,afterQuote=false;
  for(let n=0;n<text.length;n++){
    const c=text[n];
    if(quoted){if(c==='"'){if(text[n+1]==='"'){field+='"';n++;}else{quoted=false;afterQuote=true;}}else field+=c;continue;}
    if(c==='"'){if(field||afterQuote)throw Error('Unexpected quote in CSV');quoted=true;}
    else if(c===delimiter){row.push(field);field='';afterQuote=false;}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[n+1]==='\n')n++;row.push(field);if(row.some(x=>x.trim()))rows.push(row);row=[];field='';afterQuote=false;}
    else {if(afterQuote&&!/\s/.test(c))throw Error('Characters after CSV quote');if(!afterQuote)field+=c;}
  }
  if(quoted)throw Error('Unclosed CSV quote');
  row.push(field);if(row.some(x=>x.trim()))rows.push(row);
  if(rows.length<2)throw Error('CSV needs a header and at least one data row');
  if(rows.length>5001)throw Error('Maximum 5,000 invoices per import');
  const headers=rows.shift().map(x=>x.trim());
  if(new Set(headers).size!==headers.length||headers.some(x=>!x))throw Error('CSV headers must be unique and non-empty');
  rows.forEach((r,n)=>{if(r.length!==headers.length)throw Error(`Row ${n+2}: column count differs from header`);});
  return {headers,rows,delimiter};
}
const aliases={number:['invoice','invoice number','invoice_number','invoice no','invoicenumber','账单编号','发票编号'],client:['client','customer','contactname','customer name','客户','客户名称'],email:['email','emailaddress','邮箱'],amount:['amount','total','invoice amount','金额','总金额'],paid:['paid','amount paid','已付金额','已付'],currency:['currency','币种'],due:['due','due date','due_date','duedate','到期日','到期日期']};
export function autoMap(headers) {return Object.fromEntries(Object.entries(aliases).map(([key,values])=>[key,headers.findIndex(h=>values.includes(h.toLowerCase()))]));}
export function invoicesFromCSV(parsed,mapping,defaultCurrency='USD') {
  for(const k of ['number','client','amount','due'])if(!Number.isInteger(mapping[k])||mapping[k]<0)throw Error(`Map required column: ${k}`);
  const seen=new Set();
  return parsed.rows.map((row,n)=>{
    try{
      const get=k=>mapping[k]>=0?String(row[mapping[k]]??'').trim():'';
      const currency=(get('currency')||defaultCurrency).toUpperCase();
      const i=validateInvoice({id:uid(),number:get('number'),client:get('client'),email:get('email'),amount:moneyToMinor(get('amount'),currency),paid:moneyToMinor(get('paid')||'0',currency),due:get('due'),currency});
      const key=invoiceKey(i);if(seen.has(key))throw Error('Duplicate invoice in this file');seen.add(key);return i;
    }catch(e){throw Error(`Row ${n+2}: ${e.message}`);}
  });
}
export const invoiceKey = i => JSON.stringify([i.number.trim().toLowerCase(),i.client.trim().toLowerCase(),i.currency]);
export function mergeInvoices(existing,incoming) {
  const result=existing.map(i=>({...i}));let added=0,updated=0;
  for(const item of incoming){const index=result.findIndex(i=>invoiceKey(i)===invoiceKey(item));
    if(index<0){result.push(item);added++;}
    else{const old=result[index];result[index]={...item,id:old.id,status:old.status,promise:old.promise,nextContact:old.nextContact,notes:old.notes,history:old.history};updated++;}
  }
  if(result.length>5000)throw Error('Maximum 5,000 invoices per workspace');
  return {invoices:result,added,updated};
}
export function toCSV(rows) {return '\uFEFF'+rows.map(row=>row.map(value=>{let s=String(value??'');if(/^[\s]*[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}).join(',')).join('\r\n');}
export function invoiceCSV(invoices) {return toCSV([['invoice','client','email','amount','paid','currency','due','status','promise','next_contact','notes'],...invoices.map(i=>[i.number,i.client,i.email,decimal(i.amount,i.currency),decimal(i.paid,i.currency),i.currency,i.due,i.status,i.promise,i.nextContact,i.notes])]);}
export function sampleInvoices(asOf=today()) {
  const specs=[['INV-1042','Northstar Studio',2400,0,-42,'open',''],['INV-1046','Olive & Co.',1800,600,-16,'open',''],['INV-1048','Forma Collective',3200,0,-8,'open',addDays(asOf,-2)],['INV-1050','Fieldwork',950,0,-3,'open',''],['INV-1052','Studio August',2100,0,-12,'open',addDays(asOf,4)],['INV-1054','Morrow Design',1450,0,5,'open',''],['INV-1039','Kinfolk Labs',860,0,-31,'disputed',''],['INV-1036','Plain Studio',1200,1200,-20,'open','']];
  return specs.map(([number,client,amount,paid,offset,status,promise])=>validateInvoice({id:uid(),number,client,email:'accounts@example.com',amount:amount*100,paid:paid*100,currency:'USD',due:addDays(asOf,offset),status,promise,notes:'',history:[]}));
}
export function validateBackup(data) {
  if(!data||data.version!==1||!Array.isArray(data.workspaces)||data.workspaces.length<1||data.workspaces.length>20)throw Error('Invalid LedgerLeaf backup');
  const ids=new Set();
  const workspaces=data.workspaces.map(w=>{
    if(!w||typeof w.id!=='string'||!w.id||ids.has(w.id)||typeof w.name!=='string'||!w.name.trim()||w.name.length>100||!Array.isArray(w.invoices)||w.invoices.length>5000)throw Error('Invalid workspace');
    ids.add(w.id);const invoices=w.invoices.map(validateInvoice);
    if(new Set(invoices.map(i=>i.id)).size!==invoices.length||new Set(invoices.map(invoiceKey)).size!==invoices.length)throw Error('Duplicate invoices in backup');
    return {id:w.id,name:w.name,invoices};
  });
  return {version:1,active:workspaces.some(w=>w.id===data.active)?data.active:workspaces[0].id,workspaces};
}
export function download(name,content,type='text/plain;charset=utf-8') {
  const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
export function reportDocument(title,body,subtitle='') {return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>body{font:15px/1.7 system-ui,sans-serif;color:#183a32;max-width:960px;margin:50px auto;padding:0 28px}h1{font-size:34px;line-height:1.2}h2{font-size:19px;margin-top:30px}p{white-space:pre-wrap}table{width:100%;border-collapse:collapse;margin:24px 0}td,th{text-align:left;border-bottom:1px solid #dae2dc;padding:12px 8px;vertical-align:top;overflow-wrap:anywhere}th{background:#f3f5ef}.muted{color:#61726c}.big{font-size:28px;font-weight:700}.badge{background:#eff3ec;padding:5px 9px}footer{border-top:1px solid #dae2dc;margin-top:36px;padding-top:18px;font-size:12px}@media print{body{margin:0;max-width:none}tr{break-inside:avoid}h2{break-after:avoid}}@page{size:A4;margin:16mm}</style><h1>${esc(title)}</h1><p class="muted">${esc(subtitle)}</p>${body}</html>`;}
export function weeklyReport(workspace,asOf=today()) {
  const currencies=[...new Set(workspace.invoices.map(i=>i.currency))];
  const body=currencies.map(c=>{const m=metrics(workspace.invoices,asOf,c);const list=workspace.invoices.filter(i=>i.currency===c&&balance(i)>0).sort((a,b)=>a.due.localeCompare(b.due));return `<h2>${c}</h2><p>Outstanding: <b>${money(m.outstanding,c)}</b> · Overdue: <b>${money(m.overdue,c)}</b> · Follow-ups ready: ${m.actions}</p><table><thead><tr><th>Client / invoice</th><th>Outstanding</th><th>Due / days late</th><th>Next step</th></tr></thead><tbody>${list.map(i=>`<tr><td>${esc(i.client)}<br>${esc(i.number)}</td><td>${money(balance(i),c)}</td><td>${esc(i.due)} / ${Math.max(0,daysBetween(i.due,asOf))}</td><td>${esc(actionFor(i,asOf))}${i.promise?`<br>Promise: ${esc(i.promise)}`:''}${i.nextContact?`<br>Next contact: ${esc(i.nextContact)}`:''}${i.notes?`<br>${esc(i.notes)}`:''}</td></tr>`).join('')}</tbody></table>`;}).join('');
  return reportDocument(`${workspace.name} · Receivables review`,body+'<footer>Prepared with LedgerLeaf. Based on recorded invoices and payments as of the review date; currencies are shown separately. A promise is not a payment. Confirm balances against your records before following up.</footer>',`As of ${asOf}`);
}
