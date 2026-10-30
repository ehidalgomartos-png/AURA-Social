'use strict';
// V3.5.0: RedLibertad Resuelve, solo personas reales, sin mensajes automáticos.
const db=require('../db');
const {resuelveReplyEmailService}=require('./resuelve-reply-email-v3521');
let ready=null;
const CATEGORIES=['consejo','busco','ayuda','experiencia'];
// V3.5.31: clasificación explícita por quien pregunta. No se infiere de textos privados.
const TOPICS=['hogar','tecnologia','tramites','estudios','vida-cotidiana'];
const validId=x=>/^[1-9]\d{0,15}$/.test(String(x??''));
function clean(v,max){return typeof v==='string'?v.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').trim().replace(/\s+/g,' ').slice(0,max+1):'';}
async function ensureSchema(){
 if(!ready)ready=(async()=>{
  const ddl=[
   "CREATE TABLE IF NOT EXISTS resuelve_questions (id BIGSERIAL PRIMARY KEY,",
   "author_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,",
   "title VARCHAR(125) NOT NULL CHECK(char_length(title) BETWEEN 8 AND 125),",
   "body VARCHAR(1800) NOT NULL CHECK(char_length(body) BETWEEN 20 AND 1800),",
   "category VARCHAR(24) NOT NULL CHECK(category IN ('consejo','busco','ayuda','experiencia')),",
   "status VARCHAR(12) NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','hidden')),",
   "accepted_answer_id BIGINT,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),",
   "updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),solved_at TIMESTAMPTZ)"
  ].join(' ');
  const answers=[
   "CREATE TABLE IF NOT EXISTS resuelve_answers (id BIGSERIAL PRIMARY KEY,",
   "question_id BIGINT NOT NULL REFERENCES resuelve_questions(id) ON DELETE CASCADE,",
   "author_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,",
   "body VARCHAR(1500) NOT NULL CHECK(char_length(body) BETWEEN 10 AND 1500),",
   "status VARCHAR(12) NOT NULL DEFAULT 'visible' CHECK(status IN ('visible','hidden')),",
   "created_at TIMESTAMPTZ NOT NULL DEFAULT now())"
  ].join(' ');
  await db.query(ddl);
  await db.query(answers);
  await db.query("ALTER TABLE resuelve_answers ADD COLUMN IF NOT EXISTS professional_role VARCHAR(70)");
  // Autodeclaración de experiencia: no implica acreditación, perfil profesional ni publicidad.
  await db.query("ALTER TABLE resuelve_answers ADD COLUMN IF NOT EXISTS self_professional_role VARCHAR(70)");
  await db.query("ALTER TABLE resuelve_answers ADD COLUMN IF NOT EXISTS self_commercial_interest BOOLEAN NOT NULL DEFAULT FALSE");
  await db.query("ALTER TABLE resuelve_questions ADD COLUMN IF NOT EXISTS professional_help_requested BOOLEAN NOT NULL DEFAULT FALSE");
  // Un agradecimiento voluntario, ligado a la solución elegida. No es una puntuación ni una recompensa.
  await db.query("ALTER TABLE resuelve_questions ADD COLUMN IF NOT EXISTS thanked_at TIMESTAMPTZ");
  await db.query("ALTER TABLE resuelve_questions ADD COLUMN IF NOT EXISTS library_reviewed_at TIMESTAMPTZ");
  await db.query("ALTER TABLE resuelve_questions ADD COLUMN IF NOT EXISTS library_reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL");
  // V3.5.7: inclusión editorial manual; los contenidos antiguos nunca se publican automáticamente.
  await db.query("ALTER TABLE resuelve_questions ADD COLUMN IF NOT EXISTS library_approved_answer_id BIGINT");
  await db.query("ALTER TABLE resuelve_questions ADD COLUMN IF NOT EXISTS library_opt_out BOOLEAN NOT NULL DEFAULT FALSE");
  // Consentimiento individual, expresamente dado por el autor; nunca indexación por defecto.
  await db.query("ALTER TABLE resuelve_questions ADD COLUMN IF NOT EXISTS seo_public_opt_in BOOLEAN NOT NULL DEFAULT FALSE");
  await db.query("ALTER TABLE resuelve_questions ADD COLUMN IF NOT EXISTS topic VARCHAR(24) "+
   "CHECK(topic IS NULL OR topic IN ('hogar','tecnologia','tramites','estudios','vida-cotidiana'))");
  // Los avisos nunca ocultan respuestas automáticamente ni revelan la identidad del denunciante.
  await db.query([
   "CREATE TABLE IF NOT EXISTS resuelve_answer_reports (",
   "id BIGSERIAL PRIMARY KEY,",
   "answer_id BIGINT NOT NULL REFERENCES resuelve_answers(id) ON DELETE CASCADE,",
   "reporter_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,",
   "reason VARCHAR(36) NOT NULL CHECK(reason IN ('publicidad_encubierta','cualificacion_falsa','datos_personales','consejo_peligroso','otro')),",
   "status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','dismissed','resolved')),",
   "reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,",
   "reviewed_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),",
   "UNIQUE(answer_id,reporter_id))"
  ].join(' '));
  await db.query("CREATE INDEX IF NOT EXISTS idx_resuelve_reports_pending ON resuelve_answer_reports(status,id DESC)");
  // V3.5.16: elección privada de temas. Sin notificaciones, contactos automáticos ni perfiles públicos.
  await db.query([
   "CREATE TABLE IF NOT EXISTS resuelve_help_preferences (",
   "user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,",
   "categories TEXT[] NOT NULL DEFAULT '{}'::text[],",
   "updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),",
   "CONSTRAINT resuelve_help_categories_valid CHECK(",
   "categories <@ ARRAY['consejo','busco','ayuda','experiencia']::text[]",
   "AND cardinality(categories)<=4))"
  ].join(' '));
  // V3.5.23: avisos voluntarios para ayudar; opt-in independiente de elegir temas.
  await db.query("ALTER TABLE resuelve_help_preferences ADD COLUMN IF NOT EXISTS notify_new_questions BOOLEAN NOT NULL DEFAULT FALSE");
  // V3.6.1: seguimiento privado, opt-in por pregunta, con un aviso en app como máximo por 24 horas.
  await db.query([
   "CREATE TABLE IF NOT EXISTS resuelve_question_follows_v361 (",
   "user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,",
   "question_id BIGINT NOT NULL REFERENCES resuelve_questions(id) ON DELETE CASCADE,",
   "enabled BOOLEAN NOT NULL DEFAULT TRUE,",
   "last_notified_at TIMESTAMPTZ,",
   "created_at TIMESTAMPTZ NOT NULL DEFAULT now(),",
   "PRIMARY KEY(user_id,question_id))"
  ].join(' '));
  await db.query("CREATE INDEX IF NOT EXISTS idx_resuelve_follows_question_v361 ON resuelve_question_follows_v361(question_id) WHERE enabled=TRUE");
  // V3.5.25: solo se muestra una ficha pública tras consentimiento voluntario.
  await db.query("CREATE TABLE IF NOT EXISTS resuelve_helper_profiles_v3525 ("+
   "user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,"+
   "enabled BOOLEAN NOT NULL DEFAULT FALSE,updated_at TIMESTAMPTZ NOT NULL DEFAULT now())");
  // Solo una especialidad autodeclarada; no equivale a un título ni acreditación.
  await db.query("ALTER TABLE resuelve_helper_profiles_v3525 ADD COLUMN IF NOT EXISTS declared_speciality VARCHAR(70)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_resuelve_questions_feed ON resuelve_questions(status,created_at DESC,id DESC)");
  await db.query("CREATE INDEX IF NOT EXISTS idx_resuelve_answers_question ON resuelve_answers(question_id,created_at ASC,id ASC) WHERE status='visible'");
  await db.query("CREATE INDEX IF NOT EXISTS idx_resuelve_questions_author ON resuelve_questions(author_id,created_at DESC)");
 })().catch(e=>{ready=null;throw e;});
 return ready;
}
function validateQuestion(body){
 const title=clean(body?.title,125),description=clean(body?.body,1800),category=body?.category;
 const professionalHelpRequested=body?.professionalHelpRequested??false;
 return title.length>=8&&title.length<=125&&description.length>=20&&description.length<=1800&&
  CATEGORIES.includes(category)&&typeof professionalHelpRequested==='boolean'
  ?{title,body:description,category,professionalHelpRequested}:null;
}
function validateAnswer(body){const v=clean(body?.body,1500);return v.length>=10&&v.length<=1500?v:null;}
// V3.5.11: sugerir un oficio, no un proveedor, contacto comercial ni acreditación.
function validateProfessionalRole(value){
 if(value==null||value==='')return null;
 if(typeof value!=='string')return undefined;
 const v=clean(value,70);
 if(v.length<3||v.length>70)return undefined;
 if(/(?:https?:\/\/|www\.|@|\b[\w-]+\.(?:com|es|net|org)\b|(?:\+?\d[\s()./-]?){7,})/i.test(v))return undefined;
 return v;
}
// V3.5.13: distinción entre profesión sugerida y experiencia propia autodeclarada.
function validateProfessionalDisclosure(data){
 const role=validateProfessionalRole(data?.selfProfessionalRole);
 const interest=data?.commercialInterest;
 if(role===undefined)return null;
 if(!role){
  if(interest!==undefined&&interest!==null&&interest!=='')return null;
  return {role:null,commercialInterest:false};
 }
 if(interest!=='yes'&&interest!=='no')return null;
 return {role,commercialInterest:interest==='yes'};
}
// V3.5.35 — coincidencias orientativas, nunca respuestas inventadas ni publicidad.
function similarQueryTokens(raw){
 const text=clean(raw,125).toLocaleLowerCase('es');
 if(text.length<8||text.length>125)return [];
 const ignored=new Set(['para','como','cómo','cuando','donde','quiero','necesito',
  'ayuda','consejo','problema','problemas','tengo','hacer','sobre','desde','porque',
  'estas','estos','esta','este','entre','puedo','podría','alguien','otra','otras']);
 return [...new Set(text.match(/[a-záéíóúñü0-9]{4,}/gu)||[])]
  .filter(t=>!ignored.has(t)).sort((a,b)=>b.length-a.length).slice(0,5);
}
async function similarQuestions(raw){
 const tokens=similarQueryTokens(raw);
 if(!tokens.length)return [];
 await ensureSchema();
 const sql=[
  "SELECT q.id,q.title,q.status,",
  "(q.status='resolved' AND q.library_approved_answer_id=q.accepted_answer_id",
  "AND q.library_opt_out=FALSE AND a.status='visible') AS reviewed_solution",
  "FROM resuelve_questions q",
  "JOIN users u ON u.id=q.author_id AND u.status='active'",
  "LEFT JOIN resuelve_answers a ON a.id=q.accepted_answer_id AND a.question_id=q.id",
  "WHERE (q.status='open' OR (q.status='resolved' AND",
  "q.library_approved_answer_id=q.accepted_answer_id AND q.library_opt_out=FALSE",
  "AND a.status='visible'))",
  "AND EXISTS (SELECT 1 FROM unnest($1::text[]) token",
  "WHERE position(lower(token) in lower(q.title))>0)",
  "ORDER BY reviewed_solution DESC,",
  "(SELECT count(*) FROM unnest($1::text[]) token",
  "WHERE position(lower(token) in lower(q.title))>0) DESC, q.id DESC LIMIT 5"
 ].join(' ');
 const r=await db.query(sql,[tokens]);
 return r.rows;
}
async function list({filter='open',before=null,category=null,query='',professionalOnly=false,unansweredOnly=false,topic=null}={}){
 await ensureSchema();
 const state=['open','resolved','all'].includes(filter)?filter:'open';
 const cursor=validId(before)?String(before):null;
 const chosenCategory=CATEGORIES.includes(category)?category:null;
 const chosenTopic=topic&&TOPICS.includes(topic)?topic:null;
 const search=typeof query==='string'?query.trim().slice(0,80):'';
 const sql=[
  "SELECT q.id,q.title,q.body,q.category,q.professional_help_requested,q.status,q.created_at,q.solved_at,",
  "u.username AS author_username,",
  "(SELECT count(*)::int FROM resuelve_answers a WHERE a.question_id=q.id AND a.status='visible') AS answer_count",
  "FROM resuelve_questions q JOIN users u ON u.id=q.author_id AND u.status='active'",
  "WHERE q.status <> 'hidden' AND ($1='all' OR q.status=$1) AND ($2::bigint IS NULL OR q.id<$2::bigint)",
  "AND ($3::text IS NULL OR q.category=$3) AND ($4::text='' OR",
  "position(lower($4::text) in lower(q.title))>0 OR position(lower($4::text) in lower(q.body))>0)",
  "AND ($5::boolean=FALSE OR q.professional_help_requested=TRUE)",
  // V3.6.21 — solo se considera respondida una petición con respuestas visibles.
  "AND ($6::boolean=FALSE OR NOT EXISTS (SELECT 1 FROM resuelve_answers a_unanswered",
  "WHERE a_unanswered.question_id=q.id AND a_unanswered.status='visible'))",
  // V3.6.24 — el tema se filtra en servidor, con parámetro, no en la interfaz.
  ...(chosenTopic?["AND q.topic=$7::text"]:[]),
  "ORDER BY q.id DESC LIMIT 24"
 ].join(' ');
 const args=[state,cursor,chosenCategory,search,professionalOnly===true,unansweredOnly===true];
 if(chosenTopic)args.push(chosenTopic);
 return (await db.query(sql,args)).rows;
}
// V3.5.16: el usuario elige temas para descubrir peticiones reales que puede ayudar a resolver.
function validHelpTopics(categories){
 return Array.isArray(categories)&&categories.length<=4&&
  categories.every(c=>typeof c==='string'&&CATEGORIES.includes(c))&&
  new Set(categories).size===categories.length;
}
async function getHelpTopics(userId){
 await ensureSchema();
 const sql="SELECT categories FROM resuelve_help_preferences WHERE user_id=$1";
 const row=(await db.query(sql,[userId])).rows[0];
 return row?.categories||[];
}
async function setHelpTopics(userId,categories){
 if(!validHelpTopics(categories))return null;
 await ensureSchema();
 const sql=[
  "INSERT INTO resuelve_help_preferences(user_id,categories,updated_at)",
  "VALUES($1,$2::text[],now())",
  "ON CONFLICT(user_id) DO UPDATE SET categories=EXCLUDED.categories,updated_at=now()",
  "RETURNING categories"
 ].join(' ');
 return (await db.query(sql,[userId,categories])).rows[0]||null;
}
// Resumen de ayuda opcional, agregado, sin exponer mensajes, datos personales ni acreditaciones.
async function helperProfilePreference(userId){
 await ensureSchema();
 const result=await db.query('SELECT enabled FROM resuelve_helper_profiles_v3525 WHERE user_id=$1',[userId]);
 return result.rows[0]?.enabled===true;
}
async function setHelperProfilePreference(userId,enabled){
 if(typeof enabled!=='boolean')return null;
 await ensureSchema();
 const r=await db.query(
  "INSERT INTO resuelve_helper_profiles_v3525(user_id,enabled) VALUES($1,$2) "+
  "ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled,updated_at=now() "+
  "RETURNING enabled",[userId,enabled]);
 return r.rows[0]||null;
}
async function helperProfileSettings(userId){
 await ensureSchema();
 const r=await db.query('SELECT enabled,declared_speciality FROM resuelve_helper_profiles_v3525 WHERE user_id=$1',[userId]);
 return {enabled:r.rows[0]?.enabled===true,declaredSpeciality:r.rows[0]?.declared_speciality||''};
}
async function setHelperSpeciality(userId,rawSpeciality){
 const speciality=validateProfessionalRole(rawSpeciality);
 if(speciality===undefined)return null;
 await ensureSchema();
 const r=await db.query(
  "INSERT INTO resuelve_helper_profiles_v3525(user_id,declared_speciality) VALUES($1,$2) "+
  "ON CONFLICT(user_id) DO UPDATE SET declared_speciality=excluded.declared_speciality,updated_at=now() "+
  "RETURNING declared_speciality",[userId,speciality]);
 return r.rows[0]||null;
}
async function publicHelperProfile(username){
 if(typeof username!=='string'||!/^[a-zA-Z0-9_.]{3,30}$/.test(username))return null;
 await ensureSchema();
 const r=await db.query([
  "SELECT u.username,p.declared_speciality,",
  "(SELECT count(DISTINCT q.id)::int FROM resuelve_answers a",
  "JOIN resuelve_questions q ON q.id=a.question_id AND q.status<>'hidden'",
  "JOIN users author ON author.id=q.author_id AND author.status='active'",
  "WHERE a.author_id=u.id AND a.status='visible' AND q.author_id<>u.id) AS helped_questions,",
  "(SELECT count(DISTINCT q.id)::int FROM resuelve_questions q",
  "JOIN resuelve_answers a ON a.id=q.accepted_answer_id AND a.question_id=q.id",
  "WHERE q.status='resolved' AND a.status='visible' AND a.author_id=u.id) AS chosen_solutions",
  "FROM users u JOIN resuelve_helper_profiles_v3525 p ON p.user_id=u.id AND p.enabled=true",
  "WHERE LOWER(u.username)=LOWER($1) AND u.status='active' LIMIT 1"
 ].join(' '),[username]);
 return r.rows[0]||null;
}
async function getHelpAlertPreference(userId){
 await ensureSchema();
 const r=await db.query('SELECT notify_new_questions FROM resuelve_help_preferences WHERE user_id=$1',[userId]);
 return r.rows[0]?.notify_new_questions===true;
}
async function setHelpAlertPreference(userId,enabled){
 if(typeof enabled!=='boolean')return null;
 await ensureSchema();
 const sql=[
  "INSERT INTO resuelve_help_preferences(user_id,notify_new_questions,updated_at)",
  "VALUES($1,$2,now()) ON CONFLICT(user_id) DO UPDATE",
  "SET notify_new_questions=excluded.notify_new_questions,updated_at=now()",
  "RETURNING notify_new_questions"
 ].join(' ');
 return (await db.query(sql,[userId,enabled])).rows[0]||null;
}
// Hasta 20 personas por pregunta y como máximo un aviso por día por persona.
async function notifyVolunteers(questionId,authorId,category){
 if(!validId(questionId)||!validId(authorId)||!CATEGORIES.includes(category))return;
 try{
  await db.query([
   "INSERT INTO notifications(user_id,actor_id,type,entity_type,entity_id,text)",
   "SELECT p.user_id,$2,'system','resuelve',$1,",
   "'Nueva petición en un tema en el que quieres ayudar.'",
   "FROM resuelve_help_preferences p JOIN users u ON u.id=p.user_id AND u.status='active'",
   "WHERE p.notify_new_questions=true AND $3=ANY(p.categories) AND p.user_id<>$2",
   "AND NOT EXISTS(SELECT 1 FROM blocks b WHERE",
   "(b.blocker_id=p.user_id AND b.blocked_id=$2) OR (b.blocker_id=$2 AND b.blocked_id=p.user_id))",
   "AND NOT EXISTS(SELECT 1 FROM mutes m WHERE m.muter_id=p.user_id AND m.muted_id=$2)",
   "AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.user_id=p.user_id",
   "AND n.entity_type='resuelve' AND n.text='Nueva petición en un tema en el que quieres ayudar.'",
   "AND n.created_at>=now()-interval '24 hours')",
   "ORDER BY p.user_id LIMIT 20"
  ].join(' '),[questionId,authorId,category]);
 }catch(error){console.warn('Resuelve: avisos voluntarios no disponibles',error?.code||error?.message||'error');}
}
async function listToHelp(userId,{before=null}={}){
 await ensureSchema();
 const cursor=validId(before)?String(before):null;
 const sql=[
  "SELECT q.id,q.title,q.body,q.category,q.professional_help_requested,q.status,q.created_at,q.solved_at,",
  "u.username AS author_username,",
  "(SELECT count(*)::int FROM resuelve_answers a WHERE a.question_id=q.id AND a.status='visible') AS answer_count",
  "FROM resuelve_questions q",
  "JOIN resuelve_help_preferences p ON p.user_id=$1 AND q.category=ANY(p.categories)",
  "JOIN users u ON u.id=q.author_id AND u.status='active'",
  "WHERE q.status='open' AND q.author_id<>$1",
  "AND ($2::bigint IS NULL OR q.id<$2::bigint)",
  "ORDER BY q.id DESC LIMIT 24"
 ].join(' ');
 return (await db.query(sql,[userId,cursor])).rows;
}
// V3.5.4 — solo el autor autenticado consulta sus peticiones (paginación estable).
async function listMine(userId,{before=null}={}){
 await ensureSchema();
 const cursor=validId(before)?String(before):null;
 const sql=[
  "SELECT q.id, q.title, q.body, q.category, q.professional_help_requested, q.status, q.created_at, q.solved_at,",
  "u.username AS author_username,",
  "(SELECT count(*)::int FROM resuelve_answers a WHERE a.question_id=q.id AND a.status='visible') AS answer_count",
  "FROM resuelve_questions q JOIN users u ON u.id=q.author_id AND u.status='active'",
  "WHERE q.author_id=$1 AND q.status <> 'hidden' AND ($2::bigint IS NULL OR q.id<$2::bigint)",
  "ORDER BY q.id DESC LIMIT 24"
 ].join(' ');
 return (await db.query(sql,[userId,cursor])).rows;
}
// V3.5.22 — actividad privada del titular; nunca se exponen datos ajenos.
async function myActivityStats(userId){
 await ensureSchema();
 const result=await db.query([
  "SELECT",
  "(SELECT count(*)::int FROM resuelve_questions q WHERE q.author_id=$1 AND q.status='open') AS open_questions,",
  "(SELECT count(*)::int FROM resuelve_questions q WHERE q.author_id=$1 AND q.status<>'hidden' AND EXISTS(",
  "SELECT 1 FROM resuelve_answers a JOIN users au ON au.id=a.author_id AND au.status='active'",
  "WHERE a.question_id=q.id AND a.status='visible')) AS questions_with_answers,",
  "(SELECT count(*)::int FROM resuelve_questions q WHERE q.author_id=$1 AND q.status='resolved' AND EXISTS(",
  "SELECT 1 FROM resuelve_answers a WHERE a.id=q.accepted_answer_id AND a.question_id=q.id AND a.status='visible')) AS resolved_questions,",
  "(SELECT count(DISTINCT q.id)::int FROM resuelve_answers a",
  "JOIN resuelve_questions q ON q.id=a.question_id AND q.status<>'hidden'",
  "JOIN users u ON u.id=q.author_id AND u.status='active'",
  "WHERE a.author_id=$1 AND a.status='visible' AND q.author_id<>$1) AS contributed_questions"
 ].join(' '),[userId]);
 return result.rows[0];
}
async function listMyContributions(userId,{before=null}={}){
 await ensureSchema();
 const cursor=validId(before)?String(before):null;
 const sql=[
  "WITH mine AS (SELECT a.question_id,max(a.id) AS last_answer_id FROM resuelve_answers a",
  "JOIN resuelve_questions q ON q.id=a.question_id AND q.status<>'hidden'",
  "WHERE a.author_id=$1 AND a.status='visible' AND q.author_id<>$1 GROUP BY a.question_id)",
  "SELECT q.id,q.title,q.body,q.category,q.professional_help_requested,q.status,q.created_at,",
  "u.username AS author_username,m.last_answer_id AS my_answer_id,",
  "(SELECT count(*)::int FROM resuelve_answers ra WHERE ra.question_id=q.id AND ra.status='visible') AS answer_count,",
  "(q.status='resolved' AND EXISTS(SELECT 1 FROM resuelve_answers sa WHERE",
  "sa.id=q.accepted_answer_id AND sa.author_id=$1 AND sa.status='visible')) AS my_answer_selected",
  "FROM mine m JOIN resuelve_questions q ON q.id=m.question_id",
  "JOIN users u ON u.id=q.author_id AND u.status='active'",
  "WHERE ($2::bigint IS NULL OR m.last_answer_id<$2::bigint)",
  "ORDER BY m.last_answer_id DESC LIMIT 24"
 ].join(' ');
 return (await db.query(sql,[userId,cursor])).rows;
}
// V3.5.32: tarjeta para compartir una pregunta pública; no copia cuerpo ni respuestas.
async function publicQuestionSharePreview(id){
 if(!validId(id))return null;
 await ensureSchema();
 const r=await db.query([
  "SELECT q.id,q.title FROM resuelve_questions q",
  "JOIN users author ON author.id=q.author_id AND author.status='active'",
  "WHERE q.id=$1 AND q.status<>'hidden' LIMIT 1"
 ].join(' '),[id]);
 return r.rows[0]||null;
}
async function detail(id){
 await ensureSchema();
 const q=await db.query([
  "SELECT q.id,q.author_id,q.title,q.body,q.category,q.professional_help_requested,q.status,q.accepted_answer_id,",
  "q.library_approved_answer_id,q.library_opt_out,q.thanked_at,q.topic,",
  "q.created_at,q.solved_at,u.username AS author_username",
  "FROM resuelve_questions q JOIN users u ON u.id=q.author_id AND u.status='active'",
  "WHERE q.id=$1 AND q.status<>'hidden'"
 ].join(' '),[id]);
 if(!q.rowCount)return null;
 const answers=await db.query([
  "SELECT a.id,a.question_id,a.author_id,a.body,a.professional_role,a.self_professional_role,a.self_commercial_interest,a.created_at,u.username AS author_username",
  "FROM resuelve_answers a JOIN users u ON u.id=a.author_id AND u.status='active'",
  "WHERE a.question_id=$1 AND a.status='visible'",
  "ORDER BY (a.id=$2::bigint) DESC,a.id ASC LIMIT 100"
 ].join(' '),[id,q.rows[0].accepted_answer_id||null]);
 return {question:q.rows[0],answers:answers.rows};
}
async function ask(userId,data){
 await ensureSchema();
 const r=await db.query("INSERT INTO resuelve_questions(author_id,title,body,category,professional_help_requested,topic) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
  [userId,data.title,data.body,data.category,data.professionalHelpRequested===true,data.topic||null]);
 const row=r.rows[0];
 if(row)await notifyVolunteers(row.id,userId,data.category);
 return row;
}
// V3.5.31: etiquetas seleccionadas por el autor, sin modificar consentimiento SEO ni revisión.
async function setQuestionTopic(questionId,userId,topic){
 if(!validId(questionId)||!(topic===null||TOPICS.includes(topic)))return null;
 await ensureSchema();
 const r=await db.query(
  "UPDATE resuelve_questions SET topic=$3,updated_at=now() "+
  "WHERE id=$1 AND author_id=$2 AND status IN ('open','resolved') RETURNING id,topic",
  [questionId,userId,topic]);
 return r.rows[0]||null;
}
// V3.5.24 — aclaraciones anexadas por el autor, nunca reemplazan lo que ya se publicó.
function validateClarification(value){
 const text=clean(value,300);
 return text.length>=20&&text.length<=300?text:null;
}
async function clarifyQuestion(questionId,userId,content){
 await ensureSchema();
 const text=validateClarification(content);
 if(!validId(questionId)||!text)return null;
 const addition=' · Aclaración: '+text;
 const r=await db.query([
  "UPDATE resuelve_questions SET body=body||$3,updated_at=now()",
  "WHERE id=$1 AND author_id=$2 AND status='open'",
  "AND char_length(body)+char_length($3)<=1800",
  "RETURNING id,body"
 ].join(' '),[questionId,userId,addition]);
 return r.rows[0]||null;
}
// V3.6.1: la decisión se guarda en privado y no permite seguir una pregunta propia u oculta.
async function questionFollowPreference(userId,questionId){
 if(!validId(questionId))return null;
 await ensureSchema();
 const r=await db.query([
  "SELECT COALESCE(f.enabled,FALSE) AS enabled",
  "FROM resuelve_questions q",
  "JOIN users author ON author.id=q.author_id AND author.status='active'",
  "LEFT JOIN resuelve_question_follows_v361 f ON f.question_id=q.id AND f.user_id=$1",
  "WHERE q.id=$2 AND q.status<>'hidden' AND q.author_id<>$1"
 ].join(' '),[userId,questionId]);
 return r.rows[0]||null;
}
async function setQuestionFollow(userId,questionId,enabled){
 if(!validId(questionId)||typeof enabled!=='boolean')return null;
 await ensureSchema();
 if(!enabled){
  await db.query("DELETE FROM resuelve_question_follows_v361 WHERE user_id=$1 AND question_id=$2",[userId,questionId]);
  return {enabled:false};
 }
 const r=await db.query([
  "INSERT INTO resuelve_question_follows_v361(user_id,question_id,enabled)",
  "SELECT $1,q.id,TRUE FROM resuelve_questions q",
  "JOIN users author ON author.id=q.author_id AND author.status='active'",
  "WHERE q.id=$2 AND q.status='open' AND q.author_id<>$1",
  "ON CONFLICT(user_id,question_id) DO UPDATE SET enabled=TRUE",
  "RETURNING enabled"
 ].join(' '),[userId,questionId]);
 return r.rows[0]||null;
}
// No se envían emails ni se expone el nombre de seguidores; solo aviso interno voluntario.
async function notifyQuestionFollowers(questionId,answererId){
 try{
  await db.query([
   "WITH eligible AS (",
   "UPDATE resuelve_question_follows_v361 f SET last_notified_at=now()",
   "FROM resuelve_questions q, users follower",
   "WHERE f.question_id=$1 AND q.id=f.question_id AND q.status='open'",
   "AND follower.id=f.user_id AND follower.status='active'",
   "AND f.enabled=TRUE AND f.user_id<>$2 AND f.user_id<>q.author_id",
   "AND (f.last_notified_at IS NULL OR f.last_notified_at<now()-interval '24 hours')",
   "RETURNING f.user_id)",
   "INSERT INTO notifications(user_id,actor_id,type,entity_type,entity_id,text)",
   "SELECT user_id,$2,'system','resuelve',$1,",
   "'Una petición que sigues tiene una nueva respuesta en Resuelve.' FROM eligible"
  ].join(' '),[questionId,answererId]);
 }catch(error){
  console.warn('Resuelve: aviso de seguimiento no disponible',error?.code||error?.message||'error');
 }
}
async function answer(userId,id,body,professionalRole=null,disclosure={role:null,commercialInterest:false}){
 await ensureSchema();
 const r=await db.query([
  "INSERT INTO resuelve_answers(question_id,author_id,body,professional_role,self_professional_role,self_commercial_interest)",
  "SELECT q.id,$2,$3,$4,$5,$6 FROM resuelve_questions q",
  "WHERE q.id=$1 AND q.status='open' AND q.author_id<>$2 RETURNING id"
 ].join(' '),[id,userId,body,professionalRole,disclosure.role,disclosure.commercialInterest]);
 const saved=r.rows[0]||null;
 if(saved){
  // La respuesta es válida aunque el sistema de notificaciones falle.
  try{
   await db.query([
    "INSERT INTO notifications(user_id,actor_id,type,entity_type,entity_id,text)",
    "SELECT q.author_id,$2,'system','resuelve',q.id,",
    "'Han respondido a tu petición en RedLibertad Resuelve.'",
    "FROM resuelve_questions q WHERE q.id=$1 AND q.author_id<>$2 AND q.status<>'hidden'"
   ].join(' '),[id,userId]);
  }catch(error){console.warn('Resuelve: notificación no disponible',error?.code||error?.message||'error');}
  // El seguimiento tampoco afecta a la publicación; no envía correos adicionales.
  await notifyQuestionFollowers(id,userId);
  // El correo opcional no afecta a la publicación de la respuesta.
  await resuelveReplyEmailService.enqueue(id,saved.id,userId);
 }
 return saved;
}
async function solve(userId,qid,aid){
 await ensureSchema();
 const r=await db.query([
  "UPDATE resuelve_questions q SET status='resolved',accepted_answer_id=$3,solved_at=now(),updated_at=now()",
  "WHERE q.id=$1 AND q.author_id=$2 AND q.status='open'",
  "AND EXISTS(SELECT 1 FROM resuelve_answers a WHERE a.id=$3 AND a.question_id=q.id AND a.status='visible')",
  "RETURNING q.id,q.accepted_answer_id"
 ].join(' '),[qid,userId,aid]);return r.rows[0]||null;
}
// V3.5.17: un solo agradecimiento por resolución, visible en el detalle público.
async function thankResolved(userId,qid){
 await ensureSchema();
 const sql=[
  "UPDATE resuelve_questions SET thanked_at=now(),updated_at=now()",
  "WHERE id=$1 AND author_id=$2 AND status='resolved'",
  "AND accepted_answer_id IS NOT NULL AND thanked_at IS NULL",
  "AND EXISTS(SELECT 1 FROM resuelve_answers a WHERE a.id=accepted_answer_id AND a.status='visible')",
  "RETURNING id,thanked_at"
 ].join(' ');
 return (await db.query(sql,[qid,userId])).rows[0]||null;
}
// Previsualización autorizada: nunca copia respuestas de terceros al editor de RedLibertad.
async function shareResolvedPreview(userId,qid){
 await ensureSchema();
 const sql=[
  "SELECT q.id,q.title FROM resuelve_questions q",
  "JOIN users u ON u.id=q.author_id AND u.status='active'",
  "WHERE q.id=$1 AND q.author_id=$2 AND q.status='resolved'",
  "AND q.accepted_answer_id IS NOT NULL",
  "AND EXISTS(SELECT 1 FROM resuelve_answers a",
  "WHERE a.id=q.accepted_answer_id AND a.question_id=q.id AND a.status='visible')"
 ].join(' ');
 return (await db.query(sql,[qid,userId])).rows[0]||null;
}
// V3.5.29 — autoriza una ficha independiente para buscadores, distinta de la biblioteca.
async function getSeoConsent(userId,questionId){
 await ensureSchema();
 const r=await db.query(
  "SELECT seo_public_opt_in AS enabled FROM resuelve_questions WHERE id=$1 AND author_id=$2 AND status<>'hidden'",
  [questionId,userId]);
 return r.rows[0]||null;
}
async function setSeoConsent(userId,questionId,enabled){
 if(typeof enabled!=='boolean'||!validId(questionId))return null;
 await ensureSchema();
 const r=await db.query([
  "UPDATE resuelve_questions SET seo_public_opt_in=$3,updated_at=now()",
  "WHERE id=$1 AND author_id=$2 AND status='resolved' AND library_opt_out=FALSE",
  "RETURNING seo_public_opt_in AS enabled"
 ].join(' '),[questionId,userId,enabled]);
 return r.rows[0]||null;
}
async function publicSeoSolution(questionId){
 if(!validId(questionId))return null;
 await ensureSchema();
 const r=await db.query([
  "SELECT q.id,q.title,q.category,q.topic,q.solved_at,",
  "trim(split_part(a.body,' Anuncio recomendado:',1)) AS solution",
  "FROM resuelve_questions q",
  "JOIN resuelve_answers a ON a.id=q.accepted_answer_id AND a.question_id=q.id AND a.status='visible'",
  "JOIN users author ON author.id=q.author_id AND author.status='active'",
  "JOIN users respondent ON respondent.id=a.author_id AND respondent.status='active'",
  "WHERE q.id=$1 AND q.seo_public_opt_in=TRUE AND q.library_opt_out=FALSE",
  "AND q.status='resolved' AND q.library_approved_answer_id=q.accepted_answer_id",
  "AND char_length(trim(split_part(a.body,' Anuncio recomendado:',1)))>=80",
  "AND char_length(trim(q.body))>=50 LIMIT 1"
 ].join(' '),[questionId]);
 return r.rows[0]||null;
}
// V3.5.30 — sitemap exclusivamente de URLs que seguirían siendo públicas al abrirlas.
async function sitemapSeoSolutions(){
 await ensureSchema();
 const r=await db.query([
  "SELECT q.id,GREATEST(q.updated_at,COALESCE(q.library_reviewed_at,q.updated_at)) AS lastmod",
  "FROM resuelve_questions q",
  "JOIN resuelve_answers a ON a.id=q.accepted_answer_id AND a.question_id=q.id AND a.status='visible'",
  "JOIN users author ON author.id=q.author_id AND author.status='active'",
  "JOIN users respondent ON respondent.id=a.author_id AND respondent.status='active'",
  "WHERE q.seo_public_opt_in=TRUE AND q.library_opt_out=FALSE",
  "AND q.status='resolved' AND q.library_approved_answer_id=q.accepted_answer_id",
  "AND char_length(trim(split_part(a.body,' Anuncio recomendado:',1)))>=80",
  "AND char_length(trim(q.body))>=50",
  "ORDER BY q.id DESC LIMIT 2000"
 ].join(' '));
 return r.rows;
}
async function reopen(userId,qid){
 await ensureSchema();
 const r=await db.query([
  "UPDATE resuelve_questions SET status='open',accepted_answer_id=NULL,library_approved_answer_id=NULL,library_reviewed_at=NULL,library_reviewed_by=NULL,thanked_at=NULL,seo_public_opt_in=FALSE,solved_at=NULL,updated_at=now()",
  "WHERE id=$1 AND author_id=$2 AND status='resolved' RETURNING id"
 ].join(' '),[qid,userId]);return r.rows[0]||null;
}
async function moderate(kind,id){
 await ensureSchema();
 if(kind==='question'){
  const r=await db.query("UPDATE resuelve_questions SET status='hidden',accepted_answer_id=NULL,library_approved_answer_id=NULL,library_reviewed_at=NULL,library_reviewed_by=NULL,solved_at=NULL,updated_at=now() WHERE id=$1 RETURNING id",[id]);
  return r.rows[0]||null;
 }
 if(kind==='answer'){
  const r=await db.query("UPDATE resuelve_answers SET status='hidden' WHERE id=$1 RETURNING id,question_id",[id]);
  if(!r.rowCount)return null;
  await db.query("UPDATE resuelve_questions SET status='open',accepted_answer_id=NULL,library_approved_answer_id=NULL,library_reviewed_at=NULL,library_reviewed_by=NULL,solved_at=NULL,updated_at=now() WHERE accepted_answer_id=$1 AND status='resolved'",[id]);
  await db.query("UPDATE resuelve_answer_reports SET status='resolved',reviewed_at=now() WHERE answer_id=$1 AND status='pending'",[id]);
  return r.rows[0];
 }
 return null;
}
// V3.5.14 — canal de confianza. Una denuncia no implica culpabilidad ni oculta contenido.
const REPORT_REASONS=['publicidad_encubierta','cualificacion_falsa','datos_personales','consejo_peligroso','otro'];
async function reportAnswer(answerId,reporterId,reason){
 await ensureSchema();
 const sql=[
  "INSERT INTO resuelve_answer_reports(answer_id,reporter_id,reason)",
  "SELECT a.id,$2,$3 FROM resuelve_answers a",
  "JOIN resuelve_questions q ON q.id=a.question_id",
  "WHERE a.id=$1 AND a.status='visible' AND q.status<>'hidden' AND a.author_id<>$2",
  "ON CONFLICT(answer_id,reporter_id) DO NOTHING RETURNING id"
 ].join(' ');
 return (await db.query(sql,[answerId,reporterId,reason])).rows[0]||null;
}
// V3.5.27 — solo agregados, sin identidades ni decisiones automáticas.
async function adminTrustSummary(){
 await ensureSchema();
 const result=await db.query([
  "SELECT r.reason,count(*)::int AS pending",
  "FROM resuelve_answer_reports r",
  "JOIN resuelve_answers a ON a.id=r.answer_id AND a.status='visible'",
  "JOIN resuelve_questions q ON q.id=a.question_id AND q.status<>'hidden'",
  "WHERE r.status='pending'",
  "GROUP BY r.reason"
 ].join(' '));
 const counts=Object.fromEntries(REPORT_REASONS.map(reason=>[reason,0]));
 for(const row of result.rows){
  if(Object.hasOwn(counts,row.reason)){
   const n=Number(row.pending);
   if(Number.isSafeInteger(n)&&n>=0)counts[row.reason]=n;
  }
 }
 return {pendingByReason:counts,totalPending:Object.values(counts).reduce((sum,n)=>sum+n,0)};
}
async function pendingAnswerReports({before=null}={}){
 await ensureSchema();
 const sql=[
  "SELECT r.id,r.answer_id,r.reason,r.created_at,",
  "q.id AS question_id,q.title,a.body,a.self_professional_role,a.self_commercial_interest",
  "FROM resuelve_answer_reports r",
  "JOIN resuelve_answers a ON a.id=r.answer_id AND a.status='visible'",
  "JOIN resuelve_questions q ON q.id=a.question_id AND q.status<>'hidden'",
  "WHERE r.status='pending' AND ($1::bigint IS NULL OR r.id<$1::bigint)",
  "ORDER BY r.id DESC LIMIT 20"
 ].join(' ');
 return (await db.query(sql,[validId(before)?String(before):null])).rows;
}
async function dismissAnswerReport(reportId,moderatorId){
 await ensureSchema();
 const sql=[
  "UPDATE resuelve_answer_reports SET status='dismissed',reviewed_by=$2,reviewed_at=now()",
  "WHERE id=$1 AND status='pending' RETURNING id"
 ].join(' ');
 return (await db.query(sql,[reportId,moderatorId])).rows[0]||null;
}
// V3.5.7: solo respuestas elegidas y aprobadas manualmente por administración.
// V3.5.9: búsqueda literal solo sobre soluciones autorizadas y visibles.
async function library({before=null,category=null,query=''}={}){
 await ensureSchema();
 const chosenCategory=CATEGORIES.includes(category)?category:null;
 const search=typeof query==='string'?query.trim().slice(0,80):'';
 const sql=[
  "SELECT q.id,q.title,q.category,q.solved_at,q.seo_public_opt_in,split_part(a.body,' Anuncio recomendado:',1) AS solution,",
  "u.username AS author_username FROM resuelve_questions q",
  "JOIN resuelve_answers a ON a.id=q.accepted_answer_id AND a.question_id=q.id AND a.status='visible'",
  "JOIN users u ON u.id=q.author_id AND u.status='active'",
  "JOIN users respondent ON respondent.id=a.author_id AND respondent.status='active'",
  "WHERE q.status='resolved' AND q.library_opt_out=FALSE",
  "AND q.library_approved_answer_id=q.accepted_answer_id",
  "AND char_length(trim(split_part(a.body,\' Anuncio recomendado:\',1)))>=80 AND char_length(trim(q.body))>=50",
  "AND ($1::bigint IS NULL OR q.id<$1::bigint)",
  "AND ($2::text IS NULL OR q.category=$2)",
  "AND ($3::text='' OR position(lower($3::text) in lower(q.title))>0",
  "OR position(lower($3::text) in lower(split_part(a.body,' Anuncio recomendado:',1)))>0)",
  "ORDER BY q.id DESC LIMIT 12"
 ].join(' ');
 return (await db.query(sql,[validId(before)?String(before):null,chosenCategory,search])).rows;
}
// V3.5.28 — categorías y cifras reales, únicamente de soluciones que ya superaron revisión humana.
// La búsqueda se aplica a todas las categorías; un filtro por categoría no esconde las alternativas.
async function librarySummary({query=''}={}){
 await ensureSchema();
 const search=typeof query==='string'?query.trim().slice(0,80):'';
 const sql=[
  "SELECT q.category,count(*)::int AS approved_count",
  "FROM resuelve_questions q",
  "JOIN resuelve_answers a ON a.id=q.accepted_answer_id AND a.question_id=q.id AND a.status='visible'",
  "JOIN users u ON u.id=q.author_id AND u.status='active'",
  "JOIN users respondent ON respondent.id=a.author_id AND respondent.status='active'",
  "WHERE q.status='resolved' AND q.library_opt_out=FALSE",
  "AND q.library_approved_answer_id=q.accepted_answer_id",
  "AND char_length(trim(split_part(a.body,' Anuncio recomendado:',1)))>=80",
  "AND char_length(trim(q.body))>=50",
  "AND ($1::text='' OR position(lower($1::text) in lower(q.title))>0",
  "OR position(lower($1::text) in lower(split_part(a.body,' Anuncio recomendado:',1)))>0)",
  "GROUP BY q.category"
 ].join(' ');
 const r=await db.query(sql,[search]);
 const byCategory=Object.fromEntries(CATEGORIES.map(category=>[category,0]));
 for(const row of r.rows){
  if(Object.hasOwn(byCategory,row.category)){
   const count=Number(row.approved_count);
   if(Number.isSafeInteger(count)&&count>=0)byCategory[row.category]=count;
  }
 }
 return {byCategory,total:Object.values(byCategory).reduce((a,b)=>a+b,0)};
}
// V3.5.8: cola privada para revisión manual, sin exponer contenido nuevo en la biblioteca.
async function pendingSolutions({before=null}={}){
 await ensureSchema();
 const sql=[
  "SELECT q.id,q.title,q.category,q.solved_at,split_part(a.body,' Anuncio recomendado:',1) AS solution,",
  "u.username AS author_username FROM resuelve_questions q",
  "JOIN resuelve_answers a ON a.id=q.accepted_answer_id AND a.question_id=q.id AND a.status='visible'",
  "JOIN users u ON u.id=q.author_id AND u.status='active'",
  "JOIN users respondent ON respondent.id=a.author_id AND respondent.status='active'",
  "WHERE q.status='resolved' AND q.library_opt_out=FALSE",
  "AND (q.library_approved_answer_id IS NULL OR q.library_approved_answer_id<>q.accepted_answer_id)",
  "AND char_length(trim(split_part(a.body,\' Anuncio recomendado:\',1)))>=80 AND char_length(trim(q.body))>=50",
  "AND ($1::bigint IS NULL OR q.id<$1::bigint)",
  "ORDER BY q.id DESC LIMIT 12"
 ].join(' ');
 return (await db.query(sql,[validId(before)?String(before):null])).rows;
}
async function approveLibrary(questionId,approved,reviewerId=null){
 await ensureSchema();
 const sql=approved?[
  "UPDATE resuelve_questions q SET library_approved_answer_id=q.accepted_answer_id,library_reviewed_at=now(),library_reviewed_by=$2,updated_at=now()",
  "WHERE q.id=$1 AND q.status='resolved' AND q.library_opt_out=FALSE",
  "AND char_length(trim(q.body))>=50",
  "AND EXISTS(SELECT 1 FROM users author WHERE author.id=q.author_id AND author.status='active')",
  "AND EXISTS(SELECT 1 FROM resuelve_answers a JOIN users respondent",
  "ON respondent.id=a.author_id AND respondent.status='active'",
  "WHERE a.id=q.accepted_answer_id AND a.question_id=q.id AND a.status='visible'",
  "AND char_length(trim(split_part(a.body,\' Anuncio recomendado:\',1)))>=80)",
  "RETURNING q.id,q.library_approved_answer_id"
 ].join(' '):[
  "UPDATE resuelve_questions SET library_approved_answer_id=NULL,library_reviewed_at=NULL,library_reviewed_by=NULL,updated_at=now()",
  "WHERE id=$1 RETURNING id,library_approved_answer_id"
 ].join(' ');
 return (await db.query(sql,approved?[questionId,reviewerId]:[questionId])).rows[0]||null;
}
async function optOutLibrary(questionId,authorId){
 await ensureSchema();
 const sql=[
  "UPDATE resuelve_questions SET library_opt_out=TRUE,library_approved_answer_id=NULL,library_reviewed_at=NULL,library_reviewed_by=NULL,updated_at=now()",
  "WHERE id=$1 AND author_id=$2 AND status<>'hidden'",
  "RETURNING id"
 ].join(' ');
 return (await db.query(sql,[questionId,authorId])).rows[0]||null;
}
// V3.5.37 — serie de 7 días para revisión humana, sin identidades ni contenido privado.
async function adminActivity7d(){
 await ensureSchema();
 const sql=[
  "WITH days AS (SELECT (current_date - n)::date AS day FROM generate_series(0,6) AS n),",
  "new_questions AS (SELECT q.created_at::date AS day,count(*)::int AS qty",
  "FROM resuelve_questions q",
  "JOIN users author ON author.id=q.author_id AND author.status='active'",
  "WHERE q.status<>'hidden' AND q.created_at>=current_date-interval '6 days'",
  "GROUP BY q.created_at::date),",
  "new_answers AS (SELECT a.created_at::date AS day,count(*)::int AS qty",
  "FROM resuelve_answers a",
  "JOIN resuelve_questions q ON q.id=a.question_id AND q.status<>'hidden'",
  "JOIN users author ON author.id=q.author_id AND author.status='active'",
  "JOIN users respondent ON respondent.id=a.author_id AND respondent.status='active'",
  "WHERE a.status='visible' AND a.created_at>=current_date-interval '6 days'",
  "GROUP BY a.created_at::date),",
  "new_resolutions AS (SELECT q.solved_at::date AS day,count(*)::int AS qty",
  "FROM resuelve_questions q",
  "JOIN resuelve_answers a ON a.id=q.accepted_answer_id AND a.status='visible'",
  "JOIN users author ON author.id=q.author_id AND author.status='active'",
  "JOIN users respondent ON respondent.id=a.author_id AND respondent.status='active'",
  "WHERE q.status='resolved' AND q.solved_at>=current_date-interval '6 days'",
  "GROUP BY q.solved_at::date)",
  "SELECT to_char(days.day,'YYYY-MM-DD') AS day,",
  "coalesce(new_questions.qty,0)::int AS questions,",
  "coalesce(new_answers.qty,0)::int AS answers,",
  "coalesce(new_resolutions.qty,0)::int AS resolutions",
  "FROM days LEFT JOIN new_questions ON new_questions.day=days.day",
  "LEFT JOIN new_answers ON new_answers.day=days.day",
  "LEFT JOIN new_resolutions ON new_resolutions.day=days.day",
  "ORDER BY days.day ASC"
 ].join(' ');
 const r=await db.query(sql);
 return r.rows.map(row=>{
  const result={day:row.day};
  for(const key of ['questions','answers','resolutions']){
   const n=Number(row[key]);
   if(!Number.isSafeInteger(n)||n<0)throw Error('metricas_invalidas');
   result[key]=n;
  }
  return result;
 });
}
// V3.5.18 — impacto de ayuda real: métricas agregadas, no perfiles ni puntuaciones.
async function adminImpactStats(){
 await ensureSchema();
 const sql=[
  "WITH public_questions AS (",
  "SELECT q.* FROM resuelve_questions q",
  "JOIN users author ON author.id=q.author_id AND author.status='active'",
  "WHERE q.status IN ('open','resolved')",
  "), visible_answers AS (",
  "SELECT a.* FROM resuelve_answers a",
  "JOIN public_questions q ON q.id=a.question_id",
  "JOIN users respondent ON respondent.id=a.author_id AND respondent.status='active'",
  "WHERE a.status='visible'",
  ") SELECT",
  "(SELECT count(*)::int FROM public_questions) AS public_questions,",
  "(SELECT count(*)::int FROM public_questions WHERE status='open') AS open_questions,",
  // V3.6.22 — pendiente de ayuda: abierta y sin respuestas visibles.
  "(SELECT count(*)::int FROM public_questions q WHERE q.status='open'",
  "AND NOT EXISTS(SELECT 1 FROM resuelve_answers a",
  "WHERE a.question_id=q.id AND a.status='visible')) AS open_without_answers,",
  "(SELECT count(*)::int FROM public_questions q WHERE q.status='resolved'",
  "AND EXISTS(SELECT 1 FROM visible_answers a WHERE a.id=q.accepted_answer_id)) AS resolved_questions,",
  "(SELECT count(DISTINCT question_id)::int FROM visible_answers) AS questions_with_answers,",
  "(SELECT count(DISTINCT author_id)::int FROM visible_answers) AS unique_helpers,",
  "(SELECT count(*)::int FROM public_questions q WHERE q.status='resolved' AND q.thanked_at IS NOT NULL",
  "AND EXISTS(SELECT 1 FROM visible_answers a WHERE a.id=q.accepted_answer_id)) AS thanked_resolutions,",
  "(SELECT count(*)::int FROM public_questions WHERE created_at>=now()-interval '30 days') AS questions_30d,",
  "(SELECT count(*)::int FROM public_questions q WHERE q.status='resolved'",
  "AND q.solved_at>=now()-interval '30 days'",
  "AND EXISTS(SELECT 1 FROM visible_answers a WHERE a.id=q.accepted_answer_id)) AS resolved_30d"
 ].join(' ');
 const result=(await db.query(sql)).rows[0]||{};
 const names=['public_questions','open_questions','open_without_answers','resolved_questions','questions_with_answers',
  'unique_helpers','thanked_resolutions','questions_30d','resolved_30d'];
 return Object.fromEntries(names.map(key=>[key,Number(result[key]||0)]));
}
module.exports={questionFollowPreference,setQuestionFollow,notifyQuestionFollowers,adminActivity7d,similarQueryTokens,similarQuestions,publicQuestionSharePreview,TOPICS,setQuestionTopic,sitemapSeoSolutions,getSeoConsent,setSeoConsent,publicSeoSolution,librarySummary,adminTrustSummary,helperProfileSettings,setHelperSpeciality,helperProfilePreference,setHelperProfilePreference,publicHelperProfile,validateClarification,clarifyQuestion,getHelpAlertPreference,setHelpAlertPreference,notifyVolunteers,myActivityStats,listMyContributions,adminImpactStats,ensureSchema,validateQuestion,validateAnswer,validateProfessionalRole,validateProfessionalDisclosure,validId,list,listMine,validHelpTopics,getHelpTopics,setHelpTopics,listToHelp,detail,ask,answer,solve,thankResolved,shareResolvedPreview,reopen,moderate,library,pendingSolutions,approveLibrary,optOutLibrary,REPORT_REASONS,reportAnswer,pendingAnswerReports,dismissAnswerReport,CATEGORIES};
