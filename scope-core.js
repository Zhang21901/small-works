import {moneyToMinor,money,esc,validDate,addDays,reportDocument} from './core.js';
export function quoteTotals(items,{currency='USD',contingency=0,tax=0,deposit=50}={}) {
  if(!Array.isArray(items)||items.length<1||items.length>100)throw Error('Add 1–100 line items / 请添加 1–100 个增项');
  for(const n of [contingency,tax,deposit])if(!Number.isFinite(Number(n))||Number(n)<0||Number(n)>100)throw Error('Percentages must be between 0 and 100');
  const lines=items.map(i=>{
    if(!i.description?.trim()||i.description.length>2000)throw Error('Describe each change / 请填写增项说明');
    if(!/^\d+(\.\d{1,2})?$/.test(String(i.hours))||Number(i.hours)<=0||Number(i.hours)>10000)throw Error('Hours must be 0.01–10,000 / 工时需为 0.01–10,000');
    const rate=moneyToMinor(i.rate,currency);if(rate>1e8)throw Error('Hourly rate too high');
    const amount=Math.round(Math.round(Number(i.hours)*100)*rate/100);
    return {...i,amount};
  });
  const subtotal=lines.reduce((s,i)=>s+i.amount,0),buffer=Math.round(subtotal*Number(contingency)/100),taxAmount=Math.round((subtotal+buffer)*Number(tax)/100),total=subtotal+buffer+taxAmount;
  if(!Number.isSafeInteger(total)||total>1e12)throw Error('Quote total too large');
  return {lines,subtotal,buffer,taxAmount,total,depositAmount:Math.round(total*Number(deposit)/100)};
}
export function validateQuote(q) {
  if(!q||typeof q!=='object')throw Error('Invalid ScopeKit document');
  const keys=['id','number','studio','client','project','originalScope','request','currency','date','originalDue','exclusions','acceptance','status'];
  const result={};for(const k of keys){if(typeof q[k]!=='string'||q[k].length>10000)throw Error(`Invalid ${k}`);result[k]=q[k];}
  for(const k of ['id','number','studio','client','project','originalScope','request'])if(!result[k].trim())throw Error(`Required: ${k}`);
  if(!validDate(q.date)||!validDate(q.originalDue))throw Error('Use valid ISO dates');
  if(!['draft','proposed','accepted','declined'].includes(q.status))throw Error('Invalid status');
  if(q.status==='accepted'&&!q.acceptance.trim())throw Error('Record the client confirmation reference before marking accepted / 标记已确认前请记录客户回复依据');
  if(!Number.isInteger(Number(q.extraDays))||Number(q.extraDays)<0||Number(q.extraDays)>365)throw Error('Extra days must be 0–365');
  for(const k of ['extraDays','contingency','tax','deposit'])result[k]=Number(q[k]);
  result.items=q.items.map(i=>({description:String(i.description),hours:String(i.hours),rate:String(i.rate)}));
  quoteTotals(result.items,result);return result;
}
export function quoteBody(q,lang='en') {
  const r=quoteTotals(q.items,q),t=(zh,en)=>lang==='zh'?zh:en;
  return `<p><b>${esc(q.studio)}</b> → ${esc(q.client)}<br>${esc(q.project)} · ${esc(q.number)} · ${esc(q.date)}</p><p class="badge">${t('记录状态','Recorded status')}: ${esc(q.status)} · ${t('客户确认需通过邮件或签署流程另行取得','Client confirmation is collected separately by email or signing workflow')}</p><h2>${t('原定范围','Original agreed scope')}</h2><p>${esc(q.originalScope)}</p><h2>${t('本次变更','Requested change')}</h2><p>${esc(q.request)}</p><table><thead><tr><th>${t('增项内容','Additional work')}</th><th>${t('小时','Hours')}</th><th>${t('时薪','Rate')}</th><th>${t('费用','Amount')}</th></tr></thead><tbody>${r.lines.map(i=>`<tr><td>${esc(i.description)}</td><td>${esc(i.hours)}</td><td>${money(moneyToMinor(i.rate,q.currency),q.currency)}</td><td>${money(i.amount,q.currency)}</td></tr>`).join('')}</tbody></table><p>${t('小计','Subtotal')}: ${money(r.subtotal,q.currency)}<br>${t('预留工作量','Contingency')} (${q.contingency}%): ${money(r.buffer,q.currency)}<br>${t('税额（按填写税率计算）','Tax (at entered rate)')} (${q.tax}%): ${money(r.taxAmount,q.currency)}</p><p class="big">${t('增项合计','Additional fee')} ${money(r.total,q.currency)}</p><p>${t('预付款','Deposit')} (${q.deposit}%): ${money(r.depositAmount,q.currency)}<br>${t('原交付日期','Original delivery')}: ${esc(q.originalDue)}<br>${t('增加日历天数','Additional calendar days')}: ${q.extraDays}<br>${t('拟议交付日期','Proposed delivery')}: ${addDays(q.originalDue,q.extraDays)}</p><h2>${t('不包含的内容','Exclusions')}</h2><p>${esc(q.exclusions||'—')}</p><h2>${t('确认记录','Confirmation record')}</h2><p>${esc(q.acceptance||t('等待客户书面确认。','Awaiting written client confirmation.'))}</p><footer>${t('本单用于记录商业范围、费用和时间调整。状态由制作者填写；本工具未验证客户身份，也未收集电子签名。','This document records scope, fee and timeline changes. Status is entered by the preparer; this tool does not verify client identity or collect electronic signatures.')}</footer>`;
}
export const quoteHTML=(q,lang='en')=>reportDocument(lang==='zh'?'项目增项确认单':'Project change order',quoteBody(q,lang),q.number);
export function quoteEmail(q,lang='en'){const r=quoteTotals(q.items,q);return lang==='zh'?`您好，${q.client}：\n\n可以为「${q.project}」增加这部分工作：\n${q.request}\n\n本次增项报价为 ${money(r.total,q.currency)}（按填写税率计税），需要增加 ${q.extraDays} 个日历天，拟议交付日期为 ${addDays(q.originalDue,q.extraDays)}。\n详细范围与不包含内容见确认单 ${q.number}。如果您认可，请回复确认范围、报价和交付日期；收到确认后，我们再安排这部分工作。\n\n谢谢！\n${q.studio}`:`Hi ${q.client},\n\nHappy to add this to ${q.project}:\n${q.request}\n\nThe additional fee is ${money(r.total,q.currency)}, including tax at the entered rate. This adds ${q.extraDays} calendar days, with proposed delivery on ${addDays(q.originalDue,q.extraDays)}.\nPlease review change order ${q.number} for the scope and exclusions. If this works for you, please reply confirming the scope, fee and delivery date before we schedule the additional work.\n\nThank you,\n${q.studio}`;}
