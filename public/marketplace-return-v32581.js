'use strict';
// Show the way back only on navigation from a Marketplace header.
(function(){
  const params=new URLSearchParams(location.search);
  if(params.get('marketReturn')!=='1')return;
  const link=document.getElementById('marketReturnLink');
  if(!link)return;
  link.classList.remove('hidden');
})();
