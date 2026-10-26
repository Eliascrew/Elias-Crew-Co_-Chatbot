/* Elias Crew Co. — mobile menu
   The burger button (shown at 940px and below) opens the main menu as a
   panel. "Services" and "Service Areas" expand inline. Closes on Escape,
   on outside click, after choosing a link, or when widened to desktop. */
(function(){
  var burger=document.querySelector('.burger'), menu=document.getElementById('site-menu');
  if(!burger||!menu) return;
  var mq=window.matchMedia('(max-width:940px)');
  var icon=burger.querySelector('path');
  var BARS='M4 7h16M4 12h16M4 17h16', CROSS='M6 6l12 12M18 6L6 18';

  function setOpen(open){
    menu.classList.toggle('open',open);
    burger.setAttribute('aria-expanded',open?'true':'false');
    burger.setAttribute('aria-label',open?'Close menu':'Open menu');
    if(icon) icon.setAttribute('d',open?CROSS:BARS);
    if(!open) closeSubs();
  }
  function closeSubs(except){
    menu.querySelectorAll('li.sub-open').forEach(function(li){
      if(li===except) return;
      li.classList.remove('sub-open');
      li.querySelector('a').setAttribute('aria-expanded','false');
    });
  }

  burger.addEventListener('click',function(){
    var open=!menu.classList.contains('open');
    setOpen(open);
    if(open){var first=menu.querySelector('a'); if(first) first.focus();}
  });

  // Dropdown parents ("Services", "Service Areas") toggle their submenu on mobile.
  menu.querySelectorAll(':scope > li').forEach(function(li){
    var sub=li.querySelector('.submenu'); if(!sub) return;
    var trigger=li.querySelector(':scope > a');
    trigger.setAttribute('aria-haspopup','true');
    trigger.setAttribute('aria-expanded','false');
    trigger.addEventListener('click',function(e){
      e.preventDefault();
      if(!mq.matches) return;
      var open=!li.classList.contains('sub-open');
      closeSubs(li);
      li.classList.toggle('sub-open',open);
      trigger.setAttribute('aria-expanded',open?'true':'false');
    });
  });

  // Choosing a real link closes the panel (matters for same-page links and back/forward cache).
  menu.addEventListener('click',function(e){
    var a=e.target.closest('a');
    if(a&&a.getAttribute('href')!=='#') setOpen(false);
  });
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'&&menu.classList.contains('open')){setOpen(false);burger.focus();}
  });
  document.addEventListener('click',function(e){
    if(menu.classList.contains('open')&&!menu.contains(e.target)&&!burger.contains(e.target)) setOpen(false);
  });
  (mq.addEventListener?mq.addEventListener.bind(mq,'change'):mq.addListener.bind(mq))(function(){ if(!mq.matches) setOpen(false); });
  window.addEventListener('pageshow',function(){ setOpen(false); });
})();
