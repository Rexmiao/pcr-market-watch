import {getLanguage,t} from './i18n.js';

export function createCalendar(onSelect){
  const $=id=>document.getElementById(id);
  let month=null,previousSelected=null,latest=null;
  function move(offset){if(!month)return;const date=new Date(month+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+offset);month=date.toISOString().slice(0,7);draw();}
  $('calendar-prev').addEventListener('click',()=>move(-1));
  $('calendar-next').addEventListener('click',()=>move(1));
  function draw(){
    if(!latest)return;
    const {selected,dates,min,max,coverage,oiCoverage,oiTotal}=latest,available=new Set(dates),language=getLanguage();
    const first=new Date(month+'-01T12:00:00Z'),count=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate(),padding=(first.getUTCDay()+6)%7;
    $('calendar-month').textContent=new Intl.DateTimeFormat(language==='en'?'en-US':'zh-CN',{year:'numeric',month:'long',timeZone:'UTC'}).format(first);
    $('calendar-prev').disabled=month<=min.slice(0,7);
    $('calendar-next').disabled=month>=max.slice(0,7);
    $('calendar-weekdays').replaceChildren(...(language==='en'?['Mon','Tue','Wed','Thu','Fri','Sat','Sun']:['一','二','三','四','五','六','日']).map(text=>{const span=document.createElement('span');span.textContent=text;return span;}));
    const fragment=document.createDocumentFragment();
    for(let index=0;index<padding;index++){const blank=document.createElement('span');blank.className='calendar-blank';fragment.append(blank);}
    for(let day=1;day<=count;day++){
      const date=month+'-'+String(day).padStart(2,'0'),button=document.createElement('button');
      button.type='button';button.className='calendar-day';button.textContent=String(day);button.dataset.date=date;
      const hasRecord=available.has(date),isSelected=date===selected;
      const archived=oiCoverage?.[date],oiCount=Number.isInteger(archived?.count)?archived.count:Array.isArray(archived)?archived.length:Number.isInteger(archived)?archived:0;
      button.classList.toggle('has-oi-archive',oiCount>0);
      button.classList.toggle('has-record',hasRecord);button.classList.toggle('is-selected',isSelected);
      button.disabled=date<min||date>max;
      button.setAttribute('aria-label',date+' · '+t(hasRecord?'calendarAvailable':'calendarMissing')+(isSelected?' · '+t('calendarSelected'):''));
      if(coverage){const label=t('calendarDayCoverage',{date,count:coverage.byDate[date]?.length||0,total:coverage.total})+(oiCoverage?' · '+t('oiArchiveDayCoverage',{count:oiCount,total:oiTotal??coverage.total}):'');button.title=label;button.setAttribute('aria-label',label+' · '+t(hasRecord?'calendarAvailable':'calendarMissing')+(isSelected?' · '+t('calendarSelected'):''));}
      if(isSelected)button.setAttribute('aria-current','date');
      button.addEventListener('click',()=>onSelect(date));fragment.append(button);
    }
    $('calendar-grid').replaceChildren(fragment);
  }
  return {render(options){latest=options;if(!month||previousSelected!==options.selected){month=options.selected.slice(0,7);previousSelected=options.selected;}if(month<options.min.slice(0,7))month=options.min.slice(0,7);if(month>options.max.slice(0,7))month=options.max.slice(0,7);draw();}};
}
