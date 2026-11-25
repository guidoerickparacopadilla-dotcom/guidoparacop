/* Measures intent, not a qualified lead or sale. No message text or personal details sent. */
document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href]');if(!a)return;try{var u=new URL(a.href,location.href);if(u.hostname!=='wa.me'||typeof window.fbq!=='function')return;window.fbq('trackCustom','WhatsAppClick',{page:location.pathname});}catch(_){}});
