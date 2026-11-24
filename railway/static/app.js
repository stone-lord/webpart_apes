const $ = id => document.getElementById(id);
let ready=false, busy=false, pending=null, forums=[];
async function api(path, options={}) {
 const response=await fetch(path,{...options,headers:{'Content-Type':'application/json','X-Panel-Request':'1',...(options.headers||{})}});
 if(response.status===401) throw new Error('Нет доступа. Обновите страницу и войдите снова.');
 let result; try {result=await response.json();}catch{throw new Error('Сервер вернул неожиданный ответ.');}
 if(!response.ok) throw new Error(result.error||'Не удалось выполнить запрос');
 return result;
}
function notice(text,ok=false){$('notice').textContent=text;$('notice').className=ok?'success':'error';}
function preview(){
 $('preview-title').textContent=$('title').value||'Название события';
 $('preview-text').textContent=$('text').value||'Здесь появится текст вашего события.';
 $('preview-date').textContent=$('starts').value?$('starts').value.replace('T',' · ')+' МСК':'Дата и время · МСК';
 $('counter').textContent=$('text').value.length+' / 3000';
 const n=document.querySelectorAll('#roles input:checked').length;
 $('role-summary').textContent=n?'Выбрано ролей: '+n:'Выбрать роли';
}
async function history(){
 try{
 const data=await api('/api/events');$('events').replaceChildren();
 if(!data.events.length){$('events').textContent='Событий пока нет.';return;}
 for(const event of data.events){
  const row=document.createElement('article');row.className='event';
  const title=document.createElement(event.url?'a':'strong');title.textContent=event.title;
  if(event.url){title.href=event.url;title.target='_blank';title.rel='noopener noreferrer';}
  const meta=document.createElement('p');meta.textContent='#'+event.channel_name+' · '+new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Moscow'}).format(new Date(event.starts_at*1000))+' МСК';
  const votes=document.createElement('p');votes.textContent=event.state==='published'?`Иду: ${event.votes.yes} · Не иду: ${event.votes.no} · Возможно: ${event.votes.maybe}`:'Отправка не подтверждена — проверьте канал Discord';
  row.append(title,meta,votes);$('events').append(row);
 }
 }catch(error){$('events').textContent=error.message;}
}
async function load(){
 try{
 const data=await api('/api/catalog');$('guild').textContent=data.guild;
 forums=data.channels;
 $('channel').replaceChildren(new Option('Выберите форум',''));
 for(const channel of data.channels)$('channel').add(new Option((channel.category?channel.category+' / ':'')+'#'+channel.name,channel.id));
 $('channel').disabled=false;$('roles').replaceChildren();
 for(const role of data.roles){
  const label=document.createElement('label');label.className='role';label.dataset.name=role.name.toLocaleLowerCase();
  const input=document.createElement('input');input.type='checkbox';input.value=role.id;input.disabled=!role.can_mention;
  const name=document.createElement('span');name.textContent='@'+role.name+(role.can_mention?'':' · нет прав на упоминание');
  label.append(input,name);$('roles').append(label);
 }
 if(!data.roles.length)$('roles').textContent='На сервере нет доступных ролей.';
 ready=true;$('submit').disabled=false;
 if(!data.channels.length)notice('Нет доступных форумов. Проверьте права бота на создание постов, сообщения в постах и встраивание ссылок.');
 }catch(error){notice(error.message);$('guild').textContent='Нет связи с ботом';}
 await history();
}
function updateTags(){
 const forum=forums.find(f=>f.id===$('channel').value);
 $('tag').replaceChildren(new Option(forum?.requires_tag?'Выберите тег':'Без тега',''));
 for(const tag of forum?.tags||[])$('tag').add(new Option(tag.name,tag.id));
 $('tag-label').hidden=!(forum?.tags?.length||forum?.requires_tag);
 $('tag').required=!!forum?.requires_tag;
}
$('channel').addEventListener('change',updateTags);
$('role-search').addEventListener('input',()=>{const q=$('role-search').value.toLocaleLowerCase();document.querySelectorAll('.role').forEach(r=>r.hidden=!r.dataset.name.includes(q));});
$('event-form').addEventListener('input',preview);
$('event-form').addEventListener('submit',async event=>{
 event.preventDefault();if(!ready||busy)return;
 const body={title:$('title').value.trim(),text:$('text').value.trim(),starts_at:$('starts').value+':00+03:00',channel_id:$('channel').value,tag_id:$('tag').value,role_ids:[...document.querySelectorAll('#roles input:checked')].map(r=>r.value)};
 if(body.role_ids.length>50){notice('Выберите не больше 50 ролей.');return;}
 const fingerprint=JSON.stringify(body);
 if(!pending||pending.fingerprint!==fingerprint)pending={fingerprint,id:crypto.randomUUID()};
 body.request_id=pending.id;busy=true;$('submit').disabled=true;$('submit').textContent='Публикуем…';notice('');
 try{
  await api('/api/events',{method:'POST',body:JSON.stringify(body)});
  notice('Событие опубликовано. Участники могут записываться в Discord.',true);
  $('event-form').reset();pending=null;updateTags();preview();await history();
 }catch(error){notice(error.message);}
 finally{busy=false;$('submit').disabled=false;$('submit').textContent='Опубликовать событие';}
});
$('refresh').addEventListener('click',async()=>{if(!ready)await load();else await history();});
load();
