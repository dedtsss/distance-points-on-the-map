import React from 'react';
import { createRoot } from 'react-dom/client';
import ProcessingWorkflow from '../src/components/ProcessingWorkflow.jsx';
import '../src/styles.css';

const params = new URLSearchParams(location.search);
const scenario = params.get('scenario') || 'threshold-stale';
const photos = [1,2].map((number)=>({
  id:`p${number}`, number, fileName:`photo-${number}.jpg`, displayFileName:`photo-${number}.jpg`,
  stableFile:{name:`photo-${number}.jpg`}, indexFromOcr:String(100+number), indexStatus:'found',
  coordinates:{latitude:64.1+number/1000,longitude:30.1+number/1000}, gpsStatus:'done', ocrStatus:'manual', coordinateQuality:'manual',
  cleanupStatus:'done', uploadStatus:'done', workStatus:'active', disposition:'active',
  uploadResult:{links:[{provider:'ninjabox',url:`https://example.test/${number}`}]},
}));
const workflow = scenario==='threshold-stale'
  ? {current:'map',completed:['photos','recognition'],stale:['map','upload','result']}
  : scenario==='recognition-failure'
    ? {current:'recognition',completed:['photos','recognition','map','upload','result'],stale:[]}
    : {current:'result',completed:['photos','recognition','map','upload'],stale:['result']};
const session={sessionId:'harness',sessionNumber:49,processingWorkflow:workflow};
const updates=[];
window.__workflowHarness={updates,saved:null};
const onRun=async()=> scenario==='recognition-failure' ? {ok:false,photos} : {ok:true,photos};
const onSessionChange=(patch)=>{updates.push(patch);window.__workflowHarness.latest=patch.processingWorkflow;};
const onSaveSession=async(next)=>{window.__workflowHarness.saved=next;return {remote:true};};

createRoot(document.getElementById('root')).render(<ProcessingWorkflow
  photos={photos} session={session} mode="done" errors={[]} providerValidation={{valid:true,error:''}}
  providerSettings={{ninjabox:true}} thresholdMeters={30} mapLayerId="osm" recommendation={{conflictCount:0}}
  folderImport={{status:'idle',report:null}} isBusy={false} onSessionChange={onSessionChange} onRun={onRun}
  onSaveSession={onSaveSession} onMapLayerChange={()=>{}} onToggleReserve={()=>{}} onApplyRecommendation={()=>{}}
/>);
