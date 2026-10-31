'use strict';
const express=require('express');
const {renderMap}=require('../services/services-map-v3645');
const router=express.Router();
router.get('/explorar',(_req,res)=>{
 res.set('Cache-Control','public, max-age=600');
 res.type('html').send(renderMap());
});
router.get('/servicios',(_req,res)=>res.redirect(301,'/explorar'));
module.exports={router};
