const regionColors={"Metropolitan":"#3f6f9f","Large city":"#5e8a70","Small town":"#b47745","Rural":"#786a91"};
const page=document.body.dataset.page;

if(page==="network"){
  Promise.all([
    fetch("data/students.json").then(r=>r.json()),
    fetch("data/edges.json").then(r=>r.json())
  ]).then(([students,edges])=>setupNetwork(students,edges)).catch(showError);
}
if(page==="graphs"){
  fetch("data/summary.json").then(r=>r.json()).then(summary=>{
    renderSpendingChart(summary.spending_summary);
    renderExposureChart(summary.exposure_summary);
    renderRegionChart(summary.region_summary);
    renderYearChart(summary.year_summary);
    renderActivityChart(summary.activity_summary);
  }).catch(showError);
}

function showError(err){
  document.body.insertAdjacentHTML("afterbegin",`<div class="error">Could not load data: ${err}</div>`);
}

function setupNetwork(students,rawEdges){
  const regionFilter=document.getElementById("regionFilter");
  const yearFilter=document.getElementById("yearFilter");
  const spendFilter=document.getElementById("spendFilter");
  const centralityMode=document.getElementById("centralityMode");
  const reset=document.getElementById("resetFilters");
  const container=document.getElementById("networkViz");
  const tooltip=d3.select("#tooltip");

  function matches(s){
    return (regionFilter.value==="all"||s.region_type===regionFilter.value)&&
      (yearFilter.value==="all"||String(s.academic_year)===yearFilter.value)&&
      (spendFilter.value==="all"||String(s.spending_power_score)===spendFilter.value);
  }

  function draw(){
    container.innerHTML="";
    const selected=students.filter(matches);
    const ids=new Set(selected.map(d=>d.student_id));
    const edges=rawEdges.filter(e=>ids.has(e.source));
    const activities=Array.from(new Set(edges.map(e=>e.target)));
    document.getElementById("visibleCount").textContent=selected.length;

    const rect=container.getBoundingClientRect();
    const width=Math.max(700,rect.width||1000);
    const height=Math.max(560,rect.height||650);
    const svg=d3.select(container).append("svg").attr("viewBox",`0 0 ${width} ${height}`);
    const nodes=[
      ...selected.map(s=>({...s,id:s.student_id,node_type:"student"})),
      ...activities.map(name=>({id:name,label:name,node_type:"activity"}))
    ];
    const links=edges.map(e=>({source:e.source,target:e.target,weight:+e.weight}));

    const centrality=computeCentralities(nodes,links);
    const mode=centralityMode.value;
    const values=mode==="force"?null:centrality[mode];
    const maxValue=values?d3.max(nodes,d=>values.get(d.id)||0)||1:1;
    const sizeScale=d3.scaleSqrt().domain([0,maxValue]).range([0,1]);

    function radius(d){
      if(mode==="force") return d.node_type==="activity"?22:4;
      const t=sizeScale(values.get(d.id)||0);
      return d.node_type==="activity" ? 13+t*21 : 3.5+t*10.5;
    }

    const sim=d3.forceSimulation(nodes)
      .force("link",d3.forceLink(links).id(d=>d.id).distance(76).strength(.20))
      .force("charge",d3.forceManyBody().strength(d=>d.node_type==="activity"?-320:-25))
      .force("center",d3.forceCenter(width/2,height/2))
      .force("collide",d3.forceCollide(d=>radius(d)+2));

    if(values){
      const radialScale=d3.scaleLinear().domain([0,maxValue]).range([Math.min(width,height)*.43,28]);
      sim.force("centrality",d3.forceRadial(d=>radialScale(values.get(d.id)||0),width/2,height/2).strength(.32));
    }

    const link=svg.append("g").selectAll("line").data(links).join("line")
      .attr("stroke","#bbb").attr("stroke-opacity",.22).attr("stroke-width",d=>.35+d.weight*.25);

    const node=svg.append("g").selectAll("g").data(nodes).join("g").attr("cursor","pointer")
      .call(d3.drag()
        .on("start",(event,d)=>{if(!event.active)sim.alphaTarget(.2).restart();d.fx=d.x;d.fy=d.y;})
        .on("drag",(event,d)=>{d.fx=event.x;d.fy=event.y;})
        .on("end",(event,d)=>{if(!event.active)sim.alphaTarget(0);if(d.node_type==="student"){d.fx=null;d.fy=null;}}));

    node.filter(d=>d.node_type==="student").append("circle")
      .attr("r",d=>radius(d)).attr("fill",d=>regionColors[d.region_type]||"#777").attr("stroke","#fff").attr("stroke-width",.6);

    const activity=node.filter(d=>d.node_type==="activity");
    activity.append("circle").attr("r",d=>radius(d)).attr("fill","#fff").attr("stroke","#111").attr("stroke-width",1.4);
    activity.append("text").attr("x",d=>radius(d)+6).attr("dy",".35em").attr("font-size",10).attr("fill","#111").text(d=>d.label);

    node.on("mousemove",(event,d)=>{
      const metric=mode==="force" ? "" : `<br>${centralityLabel(mode)}: ${(values.get(d.id)||0).toFixed(3)}`;
      tooltip.style("display","block").style("left",`${event.offsetX+12}px`).style("top",`${event.offsetY+12}px`)
        .html(d.node_type==="student"
          ? `<b>${d.id}</b><br>${d.region_type}, Year ${d.academic_year}<br>Spending ${d.spending_power_score}/5 · Exposure ${d.precollege_exposure_score}/5<br>Belonging ${d.belonging_score}/5${metric}`
          : `<b>${d.label}</b>${metric}`);
    }).on("mouseleave",()=>tooltip.style("display","none"));

    sim.on("tick",()=>{
      nodes.forEach(d=>{const r=radius(d)+4;d.x=Math.max(r,Math.min(width-170,d.x||width/2));d.y=Math.max(r,Math.min(height-r,d.y||height/2));});
      link.attr("x1",d=>d.source.x).attr("y1",d=>d.source.y).attr("x2",d=>d.target.x).attr("y2",d=>d.target.y);
      node.attr("transform",d=>`translate(${d.x},${d.y})`);
    });
  }

  [regionFilter,yearFilter,spendFilter,centralityMode].forEach(el=>el.addEventListener("change",draw));
  reset.addEventListener("click",()=>{
    regionFilter.value="all";
    yearFilter.value="all";
    spendFilter.value="all";
    centralityMode.value="force";
    draw();
  });
  draw();
  window.addEventListener("resize",debounce(draw,180));
}

function centralityLabel(mode){
  return mode.charAt(0).toUpperCase()+mode.slice(1)+" centrality";
}

function computeCentralities(nodes,links){
  const ids=nodes.map(d=>d.id);
  const adjacency=new Map(ids.map(id=>[id,[]]));
  links.forEach(l=>{
    const a=typeof l.source==="object"?l.source.id:l.source;
    const b=typeof l.target==="object"?l.target.id:l.target;
    if(adjacency.has(a)&&adjacency.has(b)){
      adjacency.get(a).push(b);
      adjacency.get(b).push(a);
    }
  });

  const n=ids.length;
  const degree=new Map(ids.map(id=>[id,n>1?adjacency.get(id).length/(n-1):0]));
  const betweenness=new Map(ids.map(id=>[id,0]));
  const closeness=new Map(ids.map(id=>[id,0]));

  for(const s of ids){
    const stack=[];
    const predecessors=new Map(ids.map(id=>[id,[]]));
    const sigma=new Map(ids.map(id=>[id,0]));
    const distance=new Map(ids.map(id=>[id,-1]));
    sigma.set(s,1);
    distance.set(s,0);
    const queue=[s];
    let q=0;

    while(q<queue.length){
      const v=queue[q++];
      stack.push(v);
      for(const w of adjacency.get(v)){
        if(distance.get(w)<0){
          distance.set(w,distance.get(v)+1);
          queue.push(w);
        }
        if(distance.get(w)===distance.get(v)+1){
          sigma.set(w,sigma.get(w)+sigma.get(v));
          predecessors.get(w).push(v);
        }
      }
    }

    let reachable=0;
    let distanceSum=0;
    for(const id of ids){
      const dist=distance.get(id);
      if(dist>=0){
        reachable++;
        distanceSum+=dist;
      }
    }
    if(reachable>1&&distanceSum>0) closeness.set(s,(reachable-1)/distanceSum);

    const delta=new Map(ids.map(id=>[id,0]));
    while(stack.length){
      const w=stack.pop();
      for(const v of predecessors.get(w)){
        const sigmaW=sigma.get(w);
        if(sigmaW>0) delta.set(v,delta.get(v)+(sigma.get(v)/sigmaW)*(1+delta.get(w)));
      }
      if(w!==s) betweenness.set(w,betweenness.get(w)+delta.get(w));
    }
  }

  const norm=n>2?((n-1)*(n-2))/2:1;
  for(const id of ids) betweenness.set(id,(betweenness.get(id)/2)/norm);
  return {degree,betweenness,closeness};
}

function renderSpendingChart(summary){
  const data=Object.entries(summary).map(([score,d])=>({label:score,paid:d.paid_freq,free:d.free_freq}));
  groupedBar("#spendingChart",data,[{key:"paid",label:"Paid",fill:"#333"},{key:"free",label:"Free",fill:"#aaa"}],d=>d.label);
}
function renderExposureChart(summary){
  const data=Object.entries(summary).map(([score,d])=>({label:score,initial:d.initial_comfort,current:d.current_comfort}));
  groupedBar("#exposureChart",data,[{key:"initial",label:"Initial",fill:"#aaa"},{key:"current",label:"Current",fill:"#333"}],d=>d.label,[0,5]);
}
function renderRegionChart(summary){
  const data=Object.entries(summary).map(([region,d])=>({label:region,initial:d.initial_comfort,current:d.current_comfort,belonging:d.belonging}));
  groupedBar("#regionChart",data,[{key:"initial",label:"Initial comfort",fill:"#bbb"},{key:"current",label:"Current comfort",fill:"#666"},{key:"belonging",label:"Belonging",fill:"#111"}],d=>d.label,[0,5]);
}
function renderYearChart(summary){
  const data=Object.entries(summary).map(([year,d])=>({label:`Year ${year}`,adaptation:d.adaptation_gain,belonging:d.belonging}));
  groupedBar("#yearChart",data,[{key:"adaptation",label:"Adaptation gain",fill:"#aaa"},{key:"belonging",label:"Belonging",fill:"#222"}],d=>d.label,[0,5]);
}
function renderActivityChart(rows){
  const el=document.querySelector("#activityChart");
  const data=[...rows].sort((a,b)=>a.participation_rate-b.participation_rate);
  const width=Math.max(480,el.clientWidth||650),height=el.clientHeight||330;
  const margin={top:14,right:28,bottom:26,left:130};
  const svg=d3.select(el).append("svg").attr("viewBox",`0 0 ${width} ${height}`);
  const x=d3.scaleLinear().domain([0,1]).range([margin.left,width-margin.right]);
  const y=d3.scaleBand().domain(data.map(d=>d.activity)).range([height-margin.bottom,margin.top]).padding(.22);
  svg.append("g").attr("class","grid").attr("transform",`translate(0,${height-margin.bottom})`).call(d3.axisBottom(x).ticks(5).tickSize(-(height-margin.top-margin.bottom)).tickFormat("")).call(g=>g.select(".domain").remove());
  svg.selectAll("rect").data(data).join("rect").attr("x",margin.left).attr("y",d=>y(d.activity)).attr("width",d=>x(d.participation_rate)-margin.left).attr("height",y.bandwidth()).attr("fill","#333");
  svg.append("g").attr("class","axis").attr("transform",`translate(0,${height-margin.bottom})`).call(d3.axisBottom(x).ticks(5).tickFormat(d3.format(".0%")));
  svg.append("g").attr("class","axis").attr("transform",`translate(${margin.left},0)`).call(d3.axisLeft(y));
}

function groupedBar(selector,data,series,labelFn,fixedDomain=null){
  const el=document.querySelector(selector);
  const width=Math.max(460,el.clientWidth||620),height=el.clientHeight||330;
  const margin={top:35,right:16,bottom:56,left:44};
  const svg=d3.select(el).append("svg").attr("viewBox",`0 0 ${width} ${height}`);
  const labels=data.map(labelFn);
  const x0=d3.scaleBand().domain(labels).range([margin.left,width-margin.right]).padding(.24);
  const x1=d3.scaleBand().domain(series.map(s=>s.key)).range([0,x0.bandwidth()]).padding(.08);
  const maxY=fixedDomain?fixedDomain[1]:d3.max(data,d=>d3.max(series,s=>d[s.key]))*1.12;
  const y=d3.scaleLinear().domain(fixedDomain||[0,maxY]).nice().range([height-margin.bottom,margin.top]);
  svg.append("g").attr("class","grid").attr("transform",`translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(width-margin.left-margin.right)).tickFormat("")).call(g=>g.select(".domain").remove());
  svg.append("g").selectAll("g").data(data).join("g").attr("transform",d=>`translate(${x0(labelFn(d))},0)`).selectAll("rect")
    .data(d=>series.map(s=>({s,value:d[s.key]}))).join("rect").attr("x",d=>x1(d.s.key)).attr("y",d=>y(d.value)).attr("width",x1.bandwidth()).attr("height",d=>y(0)-y(d.value)).attr("fill",d=>d.s.fill);
  svg.append("g").attr("class","axis").attr("transform",`translate(0,${height-margin.bottom})`).call(d3.axisBottom(x0));
  svg.append("g").attr("class","axis").attr("transform",`translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(5));
  const legend=svg.append("g").attr("transform",`translate(${margin.left},10)`);let lx=0;
  series.forEach(s=>{const g=legend.append("g").attr("transform",`translate(${lx},0)`);g.append("rect").attr("width",10).attr("height",10).attr("fill",s.fill);g.append("text").attr("x",15).attr("y",9).attr("font-size",10).attr("fill","#333").text(s.label);lx+=s.label.length*6+40;});
}
function debounce(fn,wait){let t;return(...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),wait)}}
