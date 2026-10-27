'use strict';

// Public /p/:id must never expose the text of restricted content to a visitor.
// A public audience does not override the content-level restrictions.
const MAX_POST_ID=9223372036854775807n;

function validPublicPostId(value){
  return typeof value==='string' &&
    /^[1-9][0-9]{0,18}$/.test(value) &&
    BigInt(value)<=MAX_POST_ID;
}

function publicPostPreview(post){
  const showContent=post?.content_level==='normal';
  return {
    showContent,
    indexable:showContent && post?.discoverable===true && post?.is_admin===false,
    safeCaption:showContent?String(post.caption||''):''
  };
}

module.exports={validPublicPostId,publicPostPreview};
