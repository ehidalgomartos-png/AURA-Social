'use strict';
// V3.2.74 — Only relevant Marketplace category groups appear when a kind is selected.
(() => {
  const form=document.querySelector('.market-public-filters');
  if(!form)return;
  const type=form.querySelector('select[name="tipo"]');
  const category=form.querySelector('select[name="categoria"]');
  if(!type||!category)return;
  const initial=Array.from(category.children).map(node=>node.cloneNode(true));
  function refreshCategoryGroupsV3274(){
    const selected=category.value;
    const currentKind=type.value;
    const visible=initial.filter(node=>
      node.tagName==='OPTION' || !currentKind ||
      node.getAttribute('data-market-kind-v3274')===currentKind
    ).map(node=>node.cloneNode(true));
    category.replaceChildren(...visible);
    if(Array.from(category.options).some(option=>option.value===selected)){
      category.value=selected;
    }else{
      category.value='';
    }
  }
  type.addEventListener('change',refreshCategoryGroupsV3274);
  refreshCategoryGroupsV3274();
})();
