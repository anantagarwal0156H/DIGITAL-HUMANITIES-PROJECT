const regionColors = {
  "Metropolitan": "#36648b",
  "Large city": "#4d7d67",
  "Small town": "#c86d3a",
  "Rural": "#71638c"
};
const costColors = { free: "#4d7d67", low_cost: "#d5a545", paid: "#c86d3a" };

Promise.all([
  fetch("data/students.json").then(r => r.json()),
  fetch("data/edges.json").then(r => r.json()),
  fetch("data/summary.json").then(r => r.json())
]).then(([students, edges, summary]) => {
  renderHero(summary);
  renderFindings(summary);
  setupNetwork(students, edges);
  renderSpendingChart(summary.spending_summary);
  renderExposureChart(summary.exposure_summary);
  renderRegionChart(summary.region_summary);
}).catch(err => {
  document.body.insertAdjacentHTML("afterbegin", `<div style="padding:12px;background:#ffd9d9;color:#7a1a1a">Data could not be loaded. Run the site through a local web server rather than opening index.html directly. ${err}</div>`);
});

function renderHero(summary) {
  const stats = [
    [summary.n, "synthetic records"],
    [summary.overall.avg_belonging.toFixed(2), "average belonging / 5"],
    [summary.overall.avg_adaptation_gain.toFixed(2), "average comfort gain"],
    [summary.correlations.spending_vs_paid_participation.toFixed(2), "spending ↔ paid participation"]
  ];
  d3.select("#heroStats").selectAll("div").data(stats).join("div")
    .attr("class","hero-stat")
    .html(d => `<strong>${d[0]}</strong><span>${d[1]}</span>`);
}

function renderFindings(summary) {
  const lowSpend = summary.spending_summary["1"];
  const highSpend = summary.spending_summary["5"];
  const lowExp = summary.exposure_summary["1"];
  const highExp = summary.exposure_summary["5"];
  const findings = [
    {
      title:"Cost remains visible",
      value:`${lowSpend.paid_freq.toFixed(1)} → ${highSpend.paid_freq.toFixed(1)}`,
      text:"Average paid-activity frequency rises sharply from the lowest to the highest spending-power group in the synthetic model."
    },
    {
      title:"Exposure shapes the start",
      value:`${lowExp.initial_comfort.toFixed(1)} → ${highExp.initial_comfort.toFixed(1)}`,
      text:"Initial social comfort is substantially higher among students modelled with greater pre-college exposure."
    },
    {
      title:"Campus can narrow gaps",
      value:`+${summary.overall.avg_adaptation_gain.toFixed(2)}`,
      text:"Average social comfort rises after students enter college, suggesting adaptation even though the initial gaps do not disappear completely."
    }
  ];
  d3.select("#findingGrid").selectAll("article").data(findings).join("article")
    .attr("class","finding-card")
    .html(d => `<h3>${d.title}</h3><strong>${d.value}</strong><p>${d.text}</p>`);
}

function setupNetwork(students, rawEdges) {
  const regionFilter = document.getElementById("regionFilter");
  const yearFilter = document.getElementById("yearFilter");
  const spendFilter = document.getElementById("spendFilter");
  const reset = document.getElementById("resetFilters");
  const container = document.getElementById("networkViz");
  const tooltip = d3.select("#tooltip");

  function matches(s) {
    return (regionFilter.value === "all" || s.region_type === regionFilter.value) &&
           (yearFilter.value === "all" || String(s.academic_year) === yearFilter.value) &&
           (spendFilter.value === "all" || String(s.spending_power_score) === spendFilter.value);
  }

  function draw() {
    container.innerHTML = "";
    const selected = students.filter(matches);
    const ids = new Set(selected.map(d => d.student_id));
    const edges = rawEdges.filter(e => ids.has(e.source));
    const activityNames = Array.from(new Set(edges.map(e => e.target)));

    document.getElementById("visibleCount").textContent = selected.length;
    const avgB = selected.length ? d3.mean(selected, d => d.belonging_score) : 0;
    document.getElementById("visibleBelonging").textContent = avgB.toFixed(2);

    const rect = container.getBoundingClientRect();
    const width = Math.max(600, rect.width || 900);
    const height = Math.max(480, rect.height || 650);
    const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${width} ${height}`);

    const nodes = [
      ...selected.map(s => ({...s, id:s.student_id, node_type:"student"})),
      ...activityNames.map(name => {
        const e = rawEdges.find(x => x.target === name);
        return {id:name, label:name, node_type:"activity", activity_cost_type:e?.activity_cost_type || "free"};
      })
    ];
    const links = edges.map(e => ({source:e.source, target:e.target, weight:+e.weight}));

    const activityX = width * .76;
    const sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).distance(d => d.target.node_type === "activity" ? 95 : 85).strength(.22))
      .force("charge", d3.forceManyBody().strength(d => d.node_type === "activity" ? -240 : -22))
      .force("x", d3.forceX(d => d.node_type === "activity" ? activityX : width*.40).strength(d => d.node_type === "activity" ? .55 : .06))
      .force("y", d3.forceY(height*.5).strength(.06))
      .force("collide", d3.forceCollide(d => d.node_type === "activity" ? 34 : 5));

    const link = svg.append("g").selectAll("line").data(links).join("line")
      .attr("stroke", "#9ba7a4").attr("stroke-opacity", .16)
      .attr("stroke-width", d => .35 + d.weight*.35);

    const node = svg.append("g").selectAll("g").data(nodes).join("g")
      .attr("cursor","pointer")
      .call(d3.drag()
        .on("start", (event,d) => { if(!event.active) sim.alphaTarget(.25).restart(); d.fx=d.x; d.fy=d.y; })
        .on("drag", (event,d) => { d.fx=event.x; d.fy=event.y; })
        .on("end", (event,d) => { if(!event.active) sim.alphaTarget(0); if(d.node_type!=="activity"){ d.fx=null; d.fy=null; } })
      );

    node.filter(d => d.node_type === "student").append("circle")
      .attr("r",4)
      .attr("fill", d => regionColors[d.region_type] || "#888")
      .attr("stroke", "#fff").attr("stroke-width", .7);

    const activity = node.filter(d => d.node_type === "activity");
    activity.append("circle")
      .attr("r",24)
      .attr("fill","#fff")
      .attr("stroke", d => costColors[d.activity_cost_type] || "#333")
      .attr("stroke-width",4);
    activity.append("text")
      .attr("x",31).attr("dy",".35em")
      .attr("font-size",11).attr("font-weight",800).attr("fill","#26373f")
      .text(d => d.label);

    node.on("mousemove", (event,d) => {
      tooltip.style("display","block")
        .style("left", `${event.offsetX + 14}px`)
        .style("top", `${event.offsetY + 14}px`)
        .html(d.node_type === "student"
          ? `<strong>${d.id}</strong><br>${d.region_type} · Year ${d.academic_year}<br>Spending: ${d.spending_power_score}/5 · Exposure: ${d.precollege_exposure_score}/5<br>Belonging: ${d.belonging_score}/5`
          : `<strong>${d.label}</strong><br>${d.activity_cost_type.replace("_"," ")} activity`);
    }).on("mouseleave", () => tooltip.style("display","none"));

    sim.on("tick", () => {
      nodes.forEach(d => {
        d.x = Math.max(30, Math.min(width-150, d.x || width/2));
        d.y = Math.max(30, Math.min(height-30, d.y || height/2));
      });
      link.attr("x1", d=>d.source.x).attr("y1",d=>d.source.y).attr("x2",d=>d.target.x).attr("y2",d=>d.target.y);
      node.attr("transform",d=>`translate(${d.x},${d.y})`);
    });
  }

  [regionFilter, yearFilter, spendFilter].forEach(el => el.addEventListener("change", draw));
  reset.addEventListener("click", () => {
    regionFilter.value = "all"; yearFilter.value="all"; spendFilter.value="all"; draw();
  });
  draw();
  window.addEventListener("resize", debounce(draw, 220));
}

function renderSpendingChart(summary) {
  const data = Object.entries(summary).map(([score,d]) => ({score:+score, paid:d.paid_freq, free:d.free_freq, belonging:d.belonging}));
  groupedBar("#spendingChart", data, [
    {key:"paid", label:"Paid activity frequency", color:"#c86d3a"},
    {key:"free", label:"Free activity frequency", color:"#4d7d67"}
  ], d => `Score ${d.score}`);
}
function renderExposureChart(summary) {
  const data = Object.entries(summary).map(([score,d]) => ({score:+score, initial:d.initial_comfort, current:d.current_comfort}));
  groupedBar("#exposureChart", data, [
    {key:"initial", label:"Initial comfort", color:"#71638c"},
    {key:"current", label:"Current comfort", color:"#36648b"}
  ], d => `Score ${d.score}`, [0,5]);
}
function renderRegionChart(summary) {
  const data = Object.entries(summary).map(([region,d]) => ({region, initial:d.initial_comfort, current:d.current_comfort, belonging:d.belonging}));
  groupedBar("#regionChart", data, [
    {key:"initial", label:"Initial comfort", color:"#c86d3a"},
    {key:"current", label:"Current comfort", color:"#36648b"},
    {key:"belonging", label:"Belonging", color:"#4d7d67"}
  ], d => d.region, [0,5]);
}

function groupedBar(selector, data, series, labelFn, fixedDomain=null) {
  const el = document.querySelector(selector);
  const width = Math.max(420, el.clientWidth || 600), height = el.clientHeight || 320;
  const margin = {top:38,right:16,bottom:58,left:44};
  const svg = d3.select(el).append("svg").attr("viewBox",`0 0 ${width} ${height}`);
  const x0 = d3.scaleBand().domain(data.map(labelFn)).range([margin.left,width-margin.right]).padding(.24);
  const x1 = d3.scaleBand().domain(series.map(s=>s.key)).range([0,x0.bandwidth()]).padding(.08);
  const maxY = fixedDomain ? fixedDomain[1] : d3.max(data,d=>d3.max(series,s=>d[s.key]))*1.12;
  const y = d3.scaleLinear().domain(fixedDomain || [0,maxY]).nice().range([height-margin.bottom,margin.top]);
  svg.append("g").attr("class","grid").attr("transform",`translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(5).tickSize(-(width-margin.left-margin.right)).tickFormat(""))
    .call(g=>g.select(".domain").remove());
  svg.append("g").selectAll("g").data(data).join("g")
    .attr("transform",d=>`translate(${x0(labelFn(d))},0)`)
    .selectAll("rect").data(d=>series.map(s=>({series:s,value:d[s.key]}))).join("rect")
    .attr("x",d=>x1(d.series.key)).attr("y",d=>y(d.value))
    .attr("width",x1.bandwidth()).attr("height",d=>y(0)-y(d.value)).attr("fill",d=>d.series.color);
  svg.append("g").attr("class","axis").attr("transform",`translate(0,${height-margin.bottom})`).call(d3.axisBottom(x0))
    .selectAll("text").attr("transform","rotate(-18)").style("text-anchor","end");
  svg.append("g").attr("class","axis").attr("transform",`translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(5));
  const legend = svg.append("g").attr("transform",`translate(${margin.left},12)`);
  let lx=0; series.forEach(s=>{ const g=legend.append("g").attr("transform",`translate(${lx},0)`); g.append("rect").attr("width",10).attr("height",10).attr("fill",s.color); g.append("text").attr("x",15).attr("y",9).attr("font-size",11).attr("fill","#526067").text(s.label); lx += s.label.length*6.4+34; });
}
function debounce(fn, wait){let t;return (...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),wait)}}
