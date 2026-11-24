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
 const date=$('starts').value?new Date($('starts').value+':00+03:00'):null;
 $('preview-date').textContent=date&&!Number.isNaN(date.getTime())?new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'}).format(date)+' МСК':'Выберите дату и время · МСК';
 $('counter').textContent=$('text').value.length+' / 3000';
 const chosen=[...document.querySelectorAll('#roles input:checked')];
 const n=chosen.length;
 $('preview-roles').replaceChildren();
 for(const input of chosen.slice(0,4)){
  const chip=document.createElement('span');chip.className='role-chip';chip.textContent=input.parentElement.querySelector('span').textContent;
  $('preview-roles').append(chip);
 }
 if(n>4){const more=document.createElement('span');more.className='role-chip';more.textContent='Ещё '+(n-4);$('preview-roles').append(more);}
 $('role-summary').textContent=n?'Выбрано ролей: '+n:'Выбрать роли';
}
async function history(){
 try{
 const data=await api('/api/events');$('events').replaceChildren();$('event-count').textContent=data.events.length;
 if(!data.events.length){$('events').textContent='Пока ничего не запланировано. Создайте первое событие — оно появится здесь.';return;}
 for(const event of data.events){
  const row=document.createElement('article');row.className='event';
  const title=document.createElement(event.url?'a':'strong');title.textContent=event.title;
  if(event.url){title.href=event.url;title.target='_blank';title.rel='noopener noreferrer';}
  const meta=document.createElement('p');meta.textContent='#'+event.channel_name+' · '+new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Moscow'}).format(new Date(event.starts_at*1000))+' МСК';
  const votes=document.createElement('p');votes.textContent=event.state==='published'?`Иду: ${event.votes.yes} · Не иду: ${event.votes.no} · Возможно: ${event.votes.maybe}`:event.state==='cancelled'?'Событие отменено':'Отправка не подтверждена — проверьте канал Discord';
  const state=document.createElement('span');state.className='event-state';
  if(event.state==='cancelled'){state.textContent='ОТМЕНЕНО';state.classList.add('cancelled');}
  else if(event.state!=='published'){state.textContent='ТРЕБУЕТ ПРОВЕРКИ';state.classList.add('cancelled');}
  else if(event.starts_at*1000<=Date.now()){state.textContent='ЗАПИСЬ ЗАКРЫТА';state.classList.add('started');}
  else{state.textContent='СБОР ОТКРЫТ';}
  row.append(state,title,meta,votes);
  if(event.title_sync_pending){const pending=document.createElement('p');pending.textContent='Название сохранено · Discord обновляется';row.append(pending);}
  if(event.state==='published'||event.state==='cancelled'){
   const edit=document.createElement('button');edit.type='button';edit.className='secondary rename-toggle';edit.textContent='Изменить название';
   const form=document.createElement('form');form.className='rename-form';form.hidden=true;
   const label=document.createElement('label');label.textContent='Новое название';
   const input=document.createElement('input');input.value=event.title;input.maxLength=100;input.required=true;input.setAttribute('aria-label','Новое название события');label.append(input);
   const actions=document.createElement('div');actions.className='rename-actions';
   const save=document.createElement('button');save.type='submit';save.className='secondary';save.textContent='Сохранить';
   const back=document.createElement('button');back.type='button';back.className='secondary';back.textContent='Закрыть';
   actions.append(save,back);form.append(label,actions);
   edit.addEventListener('click',()=>{form.hidden=!form.hidden;if(!form.hidden){input.focus();input.select();}});
   back.addEventListener('click',()=>{form.hidden=true;input.value=event.title;});
   form.addEventListener('submit',async e=>{
    e.preventDefault();const title=input.value.trim();if(!title){notice('Введите название события.');return;}
    save.disabled=true;back.disabled=true;input.disabled=true;
    try{
     const result=await api('/api/events/'+encodeURIComponent(event.id)+'/rename',{method:'POST',body:JSON.stringify({title})});
     notice(result.title_sync_pending?'Название сохранено. Обновление Discord будет повторено автоматически.':'Название изменено. Связанный лист обновится при синхронизации.',true);
     await history();
    }catch(error){notice(error.message);save.disabled=false;back.disabled=false;input.disabled=false;}
   });
   row.append(edit,form);
  }
  if(event.state==='published'){
   const cancel=document.createElement('button');cancel.type='button';cancel.className='secondary';cancel.textContent='Отменить событие';
   cancel.addEventListener('click',async()=>{
    if(!confirm('Отменить событие «'+event.title+'»? Его лист будет удалён через сутки после отмены (или раньше, если уже прошло время начала).'))return;
    cancel.disabled=true;
    try{await api('/api/events/'+encodeURIComponent(event.id)+'/cancel',{method:'POST',body:'{}'});notice('Событие отменено. Запись закрыта.',true);await history();}
    catch(error){notice(error.message);cancel.disabled=false;}
   });row.append(cancel);
  }
  $('events').append(row);
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
