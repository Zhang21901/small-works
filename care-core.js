import {esc,validDate,reportDocument} from './core.js';
export function siteURL(value){let u;try{u=new URL(value);}catch{throw Error('Enter a full http(s) URL / 请填写完整网站地址');}if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('Use an http(s) URL without credentials');return u;}
export function validateScan(scan){
  if(!scan||scan.version!==1||typeof scan.url!=='string'||typeof scan.checkedAt!=='string'||isNaN(Date.parse(scan.checkedAt))||!Array.isArray(scan.checks)||scan.checks.length>100)throw Error('Invalid CareProof scan file');
  siteURL(scan.url);
  const checks=scan.checks.map(c=>{if(!c||typeof c.label!=='string'||c.label.length>200||!['pass','review','fail','info'].includes(c.status)||typeof c.detail!=='string'||c.detail.length>5000)throw Error('Invalid check result');return {label:c.label,status:c.status,detail:c.detail};});
  return {version:1,url:scan.url,checkedAt:scan.checkedAt,sample:scan.sample===true,checks};
}
export function validateCare(r){
  if(!r||typeof r!=='object')throw Error('Invalid CareProof document');
  const result={};for(const k of ['id','agency','client','url','month','summary','nextSteps']){if(typeof r[k]!=='string'||r[k].length>10000)throw Error(`Invalid ${k}`);result[k]=r[k];}
  if(!r.id||!r.agency.trim()||!r.client.trim())throw Error('Enter your business and client name / 请填写公司与客户');
  siteURL(r.url);if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(r.month)||!validDate(r.month+'-01'))throw Error('Choose a reporting month');
  if(!Array.isArray(r.tasks)||r.tasks.length>100)throw Error('Maximum 100 tasks');
  result.tasks=r.tasks.map(task=>{
    for(const k of ['date','title','detail','evidence'])if(typeof task[k]!=='string'||task[k].length>10000)throw Error(`Invalid task ${k}`);
    if(!task.title.trim()||!validDate(task.date)||!task.date.startsWith(r.month))throw Error('Every task needs a title and date within the report month / 工作日期需在报告月份内');
    if(!['done','planned','blocked'].includes(task.status))throw Error('Invalid task status');
    if(task.evidence)siteURL(task.evidence);
    return {date:task.date,title:task.title,detail:task.detail,evidence:task.evidence,status:task.status};
  });
  result.scan=r.scan?validateScan(r.scan):null;
  if(result.scan&&new URL(result.scan.url).origin!==new URL(r.url).origin)throw Error('Scan belongs to a different website / 检查结果的网站不匹配');
  return result;
}
export function careBody(r,lang='en'){
  const t=(zh,en)=>lang==='zh'?zh:en,done=r.tasks.filter(x=>x.status==='done');
  return `<p><b>${esc(r.agency)}</b> → ${esc(r.client)}<br>${esc(r.url)} · ${esc(r.month)}</p><p class="big">${done.length} ${t('项已完成工作','completed tasks')}</p><h2>${t('本月概览','This month, in brief')}</h2><p>${esc(r.summary||'—')}</p><h2>${t('工作记录','Work log')}</h2>${r.tasks.length?`<table><thead><tr><th>${t('日期 / 状态','Date / status')}</th><th>${t('工作与影响','Work & impact')}</th></tr></thead><tbody>${r.tasks.map(x=>`<tr><td>${esc(x.date)}<br>${esc(x.status)}</td><td><b>${esc(x.title)}</b><br>${esc(x.detail)}${x.evidence?`<br><a href="${esc(x.evidence)}" target="_blank" rel="noopener noreferrer">${t('查看工作依据','View evidence')}</a>`:''}</td></tr>`).join('')}</tbody></table>`:`<p>${t('未记录工作。','No work recorded.')}</p>`}<h2>${t('网站检查快照','Website check snapshot')}</h2>${r.scan?`${r.scan.sample?`<p class="badge">${t('虚构演示检查数据','Fictional sample checks')}</p>`:''}<p class="muted">${t('检查时间','Checked at')}: ${esc(r.scan.checkedAt)}${r.scan.checkedAt.slice(0,7)!==r.month?`<br>${t('此快照不在报告月份内，不能作为本月检查证明。','This snapshot is outside the report month and is not evidence of a check during this month.')}`:''}</p><table><thead><tr><th>${t('检查项','Check')}</th><th>${t('状态','Status')}</th><th>${t('结果','Result')}</th></tr></thead><tbody>${r.scan.checks.map(c=>`<tr><td>${esc(c.label)}</td><td>${esc(c.status)}</td><td>${esc(c.detail)}</td></tr>`).join('')}</tbody></table>`:`<p>${t('尚未导入检查结果。未检查的项目不作正常状态展示。','No scan imported. Unchecked items are not reported as passing.')}</p>`}<h2>${t('下月计划与待客户确认事项','Next steps & client decisions')}</h2><p>${esc(r.nextSteps||'—')}</p><footer>${t('本报告依据人工工作记录和注明时间的检查快照生成。单次网页请求不代表持续在线率；扫描不验证登录、表单投递、付款、备份或安全性。','Prepared from manually entered work logs and timestamped checks. A one-time page request does not measure uptime. The scan does not verify logins, form delivery, payments, backups or security.')}</footer>`;
}
export const careHTML=(r,lang='en')=>reportDocument(lang==='zh'?'网站维护月报':'Website care report',careBody(r,lang),r.month);
