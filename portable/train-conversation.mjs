import { query, close } from "./db.mjs";
import { trainConversationRNN } from "../lib/conversation-rnn.js";

const limit=Math.max(80,Math.min(360,Number(process.env.TRAIN_PAIRS||220)));
const state=(await query("SELECT * FROM found_model_state ORDER BY id LIMIT 1")).rows[0];
if(!state) throw new Error("found_model_state is missing");

const rows=(await query("SELECT category,context_text,prompt,answer,source FROM found_conversation_teacher ORDER BY CASE WHEN source='distilled-dialogue' THEN 0 WHEN source LIKE 'verified-%' THEN 1 ELSE 2 END, id DESC LIMIT $1",[limit])).rows;
const pairs=rows.map(x=>({
  kind:x.source==='distilled-dialogue'?'local-conversation':String(x.source||'').startsWith('verified-')?'real-dialogue':x.source==='social-dialogue'?'social-dialogue':'conversation-teacher',
  prompt:(x.context_text?x.context_text+' ':'')+'<user> '+x.prompt+' <assistant>',
  answer:x.answer
}));

const generation=Number(state.generation||0)+1;
const trained=trainConversationRNN(state.conversation_rnn_json,pairs,generation);
const before=JSON.parse(state.conversation_rnn_metrics_json||"{}");
const after=trained.metrics||{};
const oldLoss=Number(before.answer_loss||Infinity), newLoss=Number(after.answer_loss||Infinity);
const oldAcc=Number(before.answer_accuracy||0), newAcc=Number(after.answer_accuracy||0);
const accept=!Number.isFinite(oldLoss)||newLoss<oldLoss*0.997||newAcc>oldAcc+0.004;

if(accept){
  await query("UPDATE found_model_state SET conversation_rnn_json=$1,conversation_rnn_metrics_json=$2,generation=GREATEST(generation,$3),updated_at=now() WHERE id=$4",
    [JSON.stringify(trained.model),JSON.stringify({...after,portable_worker:true,previous_answer_loss:oldLoss,previous_answer_accuracy:oldAcc}),generation,state.id]);
}
console.log(JSON.stringify({ok:true,accept,before:{answer_loss:oldLoss,answer_accuracy:oldAcc},after,pairs:pairs.length,generation},null,2));
await close();