import React from 'react';
import { createRoot } from 'react-dom/client';
import ProcessingWorkflow from '../src/components/ProcessingWorkflow.jsx';
import '../src/styles.css';

const params = new URLSearchParams(location.search);
const scenario = params.get('scenario') || 'threshold-stale';
const makePhoto = (number, overrides = {}) => ({
  id:`p${number}`, number, fileName:`photo-${number}.jpg`, displayFileName:`photo-${number}.jpg`,
  stableFile:{name:`photo-${number}.jpg`}, indexFromOcr:String(100+number), indexStatus:'found',
  coordinates:{latitude:64.1+number/1000,longitude:30.1+number/1000}, gpsStatus:'done', ocrStatus:'manual', coordinateQuality:'manual',
  cleanupStatus:'done', uploadStatus:'done', workStatus:'active', disposition:'active',
  uploadResult:{links:[{provider:'ninjabox',url:`https://example.test/${number}`}]},
  ...overrides,
});
const initialPhotos = Array.from({length: scenario.startsWith('pagination') ? 101 : 2}, (_, index) => makePhoto(index + 1));
const [photos, setPhotos] = React.useState(initialPhotos);
const workflow = scenario==='threshold-stale'
  ? {current:'map',completed:['photos','recognition'],stale:['map','upload','result']}
  : scenario==='recognition-failure'
    ? {current:'recognition',completed:['photos','recognition','map','upload','result'],stale:[]}
  : scenario==='pagination-recognition'
    ? {current:'recognition',completed:['photos'],stale:[]}
    : scenario==='pagination-upload'
      ? {current:'upload',completed:['photos','recognition','map'],stale:[]}
      : {current:'result',completed:['photos','recognition','map','upload'],stale:['result']};
const session={sessionId:'harness',sessionNumber:49,processingWorkflow:workflow};
const updates=[];
window.__workflowHarness={updates,saved:null};
window.__workflowHarness.shrink = () => setPhotos((current) => current.map((photo, index) => scenario === 'pagination-recognition'
  ? {...photo, ocrStatus: index < 2 ? 'failed' : 'manual', indexFromOcr: index < 2 ? '' : String(100 + photo.number)}
  : {...photo, uploadStatus: index < 2 ? 'failed' : 'done', uploadResult: index < 2 ? {links: []} : photo.uploadResult}
));
const onRun=async()=> scenario==='recognition-failure' ? {ok:false,photos} : {ok:true,photos};
const onSessionChange=(patch)=>{updates.push(patch);window.__workflowHarness.latest=patch.processingWorkflow;};
const onSaveSession=async(next)=>{window.__workflowHarness.saved=next;return {remote:true};};

createRoot(document.getElementById('root')).render(<ProcessingWorkflow
  photos={photos} session={session} mode="done" errors={[]} providerValidation={{valid:true,error:''}}
  providerSettings={{ninjabox:true}} thresholdMeters={30} mapLayerId="osm" recommendation={{conflictCount:0}}
  folderImport={{status:'idle',report:null}} isBusy={false} onSessionChange={onSessionChange} onRun={onRun}
  onSaveSession={onSaveSession} onMapLayerChange={()=>{}} onToggleReserve={()=>{}} onApplyRecommendation={()=>{}}
/>);
