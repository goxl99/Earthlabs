import{a as c,e as d,h as s,n as v,s as p,t as a}from"./chunk-RFCTVU6U.js";import"./chunk-QHDNOTBI.js";async function k(o){let[{data:t,error:l},{data:b}]=await Promise.all([c.rpc("dashboard_stats"),c.from("v_batch_register").select("id,temp_ref,batch_code,product_name,variant,status,mfg_date,batch_size_l,operator_name").order("created_at",{ascending:!1}).limit(8)]);if(l){o.innerHTML=`<div class="notice err">${d(l.message)}</div>`;return}let h=(t.approved||0)+(t.rejected||0)+(t.rework||0),i=e=>h?(e/h*100).toFixed(1)+"%":"\u2013",r=t.operators||[],$=(e,n)=>`<div class="bar"><i style="width:${n?Math.min(100,e/n*100):0}%"></i></div>`,m=Math.max(1,...r.map(e=>e.total));o.innerHTML=`
  <div class="grid-h"><h2>Production Overview</h2></div>
  <div class="stats">
    ${a("Total batches submitted",s(t.batches_total,0))}
    ${a("Approved batches",s(t.approved,0),"","good")}
    ${a("Pending quality approvals",s(t.pending,0),"",t.pending?"warn":"")}
    ${a("Rejected batches",s(t.rejected,0),"",t.rejected?"bad":"")}
    ${a("Rework batches",s(t.rework,0),"",t.rework?"warn":"")}
    ${a("Litres manufactured (approved)",s(t.litres_manufactured,1))}
  </div>
  <div class="grid-h"><h2>Filling Overview</h2></div>
  <div class="stats">
    ${a("250 mL bottles filled",s(t.bottles_250,0))}
    ${a("500 mL bottles filled",s(t.bottles_500,0))}
    ${a("Sachets filled",s(t.sachets,0))}
    ${a("Packaging rejects",s(t.pack_rejects,0))}
    ${a("Filling wastage (L)",s(t.filling_wastage_l,2))}
  </div>
  <div class="grid-h"><h2>Inventory Overview</h2></div>
  <div class="stats">
    ${a("Bulk stock (L)",s(Math.max(0,t.bulk_stock_l),1),"unfilled approved bulk")}
    ${a("Finished bottles",s(t.finished_bottles,0))}
    ${a("Finished sachets",s(t.finished_sachets,0))}
    ${a("Available inventory (units)",s(t.available_units,0),"","good")}
    ${a("Dispatched (units)",s(t.dispatched_units,0))}
  </div>
  <div class="grid-h"><h2>Quality Overview</h2></div>
  <div class="stats">
    ${a("Batch approval %",i(t.approved),"of reviewed batches","good")}
    ${a("Batch rejection %",i(t.rejected),"",t.rejected?"bad":"")}
    ${a("Rework %",i(t.rework),"",t.rework?"warn":"")}
    ${a("Batches with parameter deviations",s(t.deviation_batches,0),"",t.deviation_batches?"warn":"")}
  </div>
  <div class="two">
    <section class="card"><h3>Operator-wise quality performance</h3>
      ${r.length?`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Operator</th><th>Batches</th><th>Approved</th><th>Rejected</th><th>Rework</th><th>Deviations</th><th>First-pass</th></tr></thead><tbody>${r.map(e=>`<tr><td data-l="Operator">${d(e.name)}</td><td data-l="Batches">${e.total}${$(e.total,m)}</td><td data-l="Approved">${e.approved}</td><td data-l="Rejected">${e.rejected}</td><td data-l="Rework">${e.rework}</td><td data-l="Deviations">${e.deviations}</td><td data-l="First-pass">${e.total?Math.round(e.approved/e.total*100):0}%</td></tr>`).join("")}</tbody></table></div>`:'<div class="empty">No submitted batches yet.</div>'}
    </section>
    <section class="card"><h3>Recent batches</h3>
      ${p([{h:"Ref",html:e=>`<a href="#/batch/${e.id}">${d(e.batch_code||e.temp_ref)}</a>`},{h:"Product",v:e=>e.product_name+(e.variant?" \u2013 "+e.variant:"")},{h:"Size (L)",v:e=>s(e.batch_size_l,0)},{h:"Status",html:e=>v(e.status)}],b||[],{empty:'No batches yet. Create the first one from "Create New Batch".'})}
    </section>
  </div>`}export{k as dashboardPage};
