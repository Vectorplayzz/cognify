import{c as e,M as a,B as n}from"./index-C38zBCfF.js";import{j as i}from"./motion-DDuDODzG.js";import{r as o}from"./react-vendor-Ct33nvRu.js";
/**
 * @license lucide-react v1.52.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const r={name:"trash",size:24,node:[["path",{d:"M10 11v6",key:"nco0om"}],["path",{d:"M14 11v6",key:"outv1u"}],["path",{d:"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",key:"miytrc"}],["path",{d:"M3 6h18",key:"d0wm0j"}],["path",{d:"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",key:"e791ji"}]],aliases:["trash-2"]},s=e(r);function t(){const[e,r]=o.useState(null),s=o.useRef(()=>{}),t=o.useCallback(e=>(r(e),new Promise(e=>{s.current=e})),[]),l=e=>{s.current(e),r(null)};return[i.jsx(a,{open:!!e,onClose:()=>l(!1),title:null==e?void 0:e.title,description:null==e?void 0:e.description,children:i.jsxs("div",{className:"flex justify-end gap-2",children:[i.jsx(n,{variant:"ghost",onClick:()=>l(!1),children:"Cancel"}),i.jsx(n,{variant:(null==e?void 0:e.danger)?"danger":"primary",onClick:()=>l(!0),autoFocus:!0,children:(null==e?void 0:e.confirmLabel)||"Confirm"})]})}),t]}export{s as T,t as u};
