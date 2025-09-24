/* global Papa, DataTable, Chart, XLSX */
let table, barChart, pieChart;
let fullData = [];     // dataset padrão carregado de data/dados.csv
let currentData = [];  // dataset atualmente sendo exibido (após filtros)
let stagedData = null; // dataset carregado pelo importador, aguardando validação
let hasDate = false;   // indica se a base possui coluna de data reconhecida

const REQUIRED_COLS = ['Conta','NomeEmpresa','CNPJ','QtdEmitidos','ValorEmitidos','QtdLiquidados','ValorLiquidados'];

function formatBRL(v){
  if (v == null || isNaN(v)) return 'R$ 0,00';
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function pct(a,b){ return b > 0 ? (a/b)*100 : 0; }
function parseNumber(x){
  if (x == null || x === '') return 0;
  if (typeof x === 'number') return x;
  const s = String(x).trim().replace(/\./g,'').replace(',','.');
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}
function toDateOrNull(x){
  if(!x) return null;
  if (x instanceof Date && !isNaN(x)) return x;
  let s = String(x).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m){
    const [_,d,mo,y] = m;
    const dt = new Date(Number(y), Number(mo)-1, Number(d));
    return isNaN(dt) ? null : dt;
  }
  const dt = new Date(s);
  return isNaN(dt) ? null : dt;
}

/* --------- Validação --------- */
function validateColumns(rows){
  const cols = Object.keys(rows[0] || {});
  const missing = REQUIRED_COLS.filter(c => !cols.includes(c));
  const extra = cols.filter(c => !REQUIRED_COLS.includes(c));
  return { cols, missing, extra };
}
function validateNumbers(rows){
  const numCols = ['QtdEmitidos','ValorEmitidos','QtdLiquidados','ValorLiquidados'];
  let invalidCount = 0, negativeCount = 0;
  rows.forEach(r=>{
    numCols.forEach(c=>{
      const v = parseNumber(r[c]);
      if (typeof r[c] !== 'number' && isNaN(Number(r[c])) && r[c]!=='' && r[c]!==null && r[c]!==undefined){
        invalidCount++;
      }
      if (v < 0) negativeCount++;
    });
  });
  return { invalidCount, negativeCount };
}
function runValidator(rows){
  const result = { ok:false, errors:[], warnings:[], summary:'' };
  if(!rows || !rows.length){
    result.errors.push('Arquivo vazio ou sem linhas válidas.');
    return result;
  }
  const { missing, extra } = validateColumns(rows);
  if(missing.length){
    result.errors.push('Colunas obrigatórias ausentes: ' + missing.join(', '));
  }
  if(extra.length){
    result.warnings.push('Colunas extras ignoradas: ' + extra.join(', '));
  }
  const { invalidCount, negativeCount } = validateNumbers(rows);
  if(invalidCount>0){
    result.errors.push(`Valores não numéricos em colunas numéricas: ${invalidCount} ocorrência(s).`);
  }
  if(negativeCount>0){
    result.warnings.push(`Valores negativos detectados: ${negativeCount} ocorrência(s).`);
  }
  result.ok = result.errors.length === 0;
  result.summary = `${rows.length} linhas | ${result.ok ? 'validação OK' : 'falhou'}${extra.length? ' | colunas extras: '+extra.length : ''}`;
  return result;
}
function renderValidationUI(report){
  const box = document.getElementById('validationBox');
  const list = document.getElementById('validationList');
  const sum = document.getElementById('validationSummary');
  box.classList.remove('ok','error');
  list.innerHTML = '';
  sum.textContent = report.summary || '';
  if(report.ok){
    box.classList.add('ok');
    if(report.warnings.length){
      report.warnings.forEach(w=>{
        const li = document.createElement('li');
        li.innerHTML = `<span class="badge badge-warn">AVISO</span> ${w}`;
        list.appendChild(li);
      });
    } else {
      const li = document.createElement('li');
      li.innerHTML = `<span class="badge badge-ok">OK</span> Base pronta para uso.`;
      list.appendChild(li);
    }
  } else {
    box.classList.add('error');
    report.errors.forEach(e=>{
      const li = document.createElement('li');
      li.innerHTML = `<span class="badge badge-err">ERRO</span> ${e}`;
      list.appendChild(li);
    });
    report.warnings.forEach(w=>{
      const li = document.createElement('li');
      li.innerHTML = `<span class="badge badge-warn">AVISO</span> ${w}`;
      list.appendChild(li);
    });
  }
  document.getElementById('btnUseFile').disabled = !report.ok;
  document.getElementById('btnDownloadCSV').disabled = !report.ok;
}

/* --------- Normalização --------- */
function normalizeRow(obj){
  const get = (keys)=> {
    for(const k of keys){
      if (k in obj && obj[k]!=null && obj[k]!== '') return obj[k];
    }
    return '';
  };
  const row = {
    Conta: get(['Conta']),
    NomeEmpresa: get(['NomeEmpresa','Nome da Empresa']),
    CNPJ: get(['CNPJ']),
    QtdEmitidos: parseNumber(get(['QtdEmitidos','Quant. de Boletos Emitidos'])),
    ValorEmitidos: parseNumber(get(['ValorEmitidos','Valor Boletos Emitidos'])),
    QtdLiquidados: parseNumber(get(['QtdLiquidados','Quant. Boletos Liquidados'])),
    ValorLiquidados: parseNumber(get(['ValorLiquidados','Valor Boletos Liq.']))
  };
  const dataField = get(['Data','DataRef','Data Emissão','Competencia','Mês','Mes']);
  const dt = toDateOrNull(dataField);
  if(dt){ row.DataRef = dt; }
  return row;
}

/* --------- Filtros e KPIs --------- */
function rebuildKPIs(data){
  const valorEmitido = data.reduce((s,r)=> s + parseNumber(r.ValorEmitidos), 0);
  const valorLiquidado = data.reduce((s,r)=> s + parseNumber(r.ValorLiquidados), 0);
  const qtdE = data.reduce((s,r)=> s + parseNumber(r.QtdEmitidos), 0);
  const qtdL = data.reduce((s,r)=> s + parseNumber(r.QtdLiquidados), 0);
  const taxa = pct(valorLiquidado, valorEmitido);

  document.getElementById('kpiValorEmitido').textContent = formatBRL(valorEmitido);
  document.getElementById('kpiValorLiquidado').textContent = formatBRL(valorLiquidado);
  document.getElementById('kpiTaxa').textContent = `${taxa.toFixed(1)}%`;
  document.getElementById('kpiQtd').textContent = `${qtdL.toLocaleString('pt-BR')} / ${qtdE.toLocaleString('pt-BR')}`;
}
function groupByEmpresa(data){
  const map = new Map();
  data.forEach(r=>{
    const key = r.NomeEmpresa || '—';
    if(!map.has(key)) map.set(key, { emitidos:0, liquidados:0 });
    const obj = map.get(key);
    obj.emitidos += parseNumber(r.ValorEmitidos);
    obj.liquidados += parseNumber(r.ValorLiquidados);
  });
  return Array.from(map.entries()).map(([empresa, v])=>({ empresa, ...v }));
}
function rebuildCharts(data){
  const topN = Number(document.getElementById('topN').value) || 12;
  const grouped = groupByEmpresa(data).sort((a,b)=> b.liquidados - a.liquidados).slice(0, topN);
  const labels = grouped.map(g=> g.empresa);
  const dsEmitidos = grouped.map(g=> g.emitidos);
  const dsLiquidados = grouped.map(g=> g.liquidados);

  const barCtx = document.getElementById('barChart').getContext('2d');
  if(barChart){ barChart.destroy(); }
  barChart = new Chart(barCtx, {
    type:'bar',
    data:{ labels,
      datasets:[
        { label:'Valor Emitido', data: dsEmitidos },
        { label:'Valor Liquidado', data: dsLiquidados }
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      scales:{ y:{ ticks:{ callback: (v)=> formatBRL(v) } } },
      plugins:{ tooltip:{ callbacks:{ label:(ctx)=> `${ctx.dataset.label}: ${formatBRL(ctx.parsed.y)}` } } }
    }
  });

  const pieCtx = document.getElementById('pieChart').getContext('2d');
  if(pieChart){ pieChart.destroy(); }
  pieChart = new Chart(pieCtx, {
    type:'pie',
    data:{
      labels,
      datasets:[ { label:'Participação no Liquidado', data: dsLiquidados } ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ tooltip:{ callbacks:{ label:(ctx)=> `${ctx.label}: ${formatBRL(ctx.parsed)} (${pct(ctx.parsed, dsLiquidados.reduce((a,b)=>a+b,0)).toFixed(1)}%)` } } }
    }
  });
}
function populateFilters(data){
  const empresas = [...new Set(data.map(r=> r.NomeEmpresa).filter(Boolean))].sort();
  const cnpjs = [...new Set(data.map(r=> r.CNPJ).filter(Boolean))].sort();
  const contas = [...new Set(data.map(r=> r.Conta).filter(Boolean))].sort();

  const $emp = document.getElementById('fEmpresa');
  const $cnpj = document.getElementById('fCNPJ');
  const $conta = document.getElementById('fConta');
  $emp.innerHTML = '<option value="">Todas</option>' + empresas.map(e=> `<option value="${e}">${e}</option>`).join('');
  $cnpj.innerHTML = '<option value="">Todos</option>' + cnpjs.map(c=> `<option value="${c}">${c}</option>`).join('');
  $conta.innerHTML = '<option value="">Todas</option>' + contas.map(c=> `<option value="${c}">${c}</option>`).join('');

  // Date filters visibility
  hasDate = data.some(r=> r.DataRef instanceof Date);
  document.getElementById('dateFilters').style.display = hasDate ? '' : 'none';
}
function applyAllFilters(){
  const emp = document.getElementById('fEmpresa').value.trim().toLowerCase();
  const cnpj = document.getElementById('fCNPJ').value.trim().toLowerCase();
  const conta = document.getElementById('fConta').value.trim().toLowerCase();
  const q = document.getElementById('globalSearch').value.trim().toLowerCase();

  const minVE = document.getElementById('minValorEmit').value;
  const maxVE = document.getElementById('maxValorEmit').value;
  const minVL = document.getElementById('minValorLiq').value;
  const maxVL = document.getElementById('maxValorLiq').value;

  const dtIni = hasDate ? (document.getElementById('fDataIni').value ? new Date(document.getElementById('fDataIni').value) : null) : null;
  const dtFim = hasDate ? (document.getElementById('fDataFim').value ? new Date(document.getElementById('fDataFim').value) : null) : null;

  const filtered = fullData.filter(r=>{
    if(emp && String(r.NomeEmpresa||'').toLowerCase() !== emp) return false;
    if(cnpj && String(r.CNPJ||'').toLowerCase() !== cnpj) return false;
    if(conta && String(r.Conta||'').toLowerCase() !== conta) return false;

    if(q){
      const hay = [r.Conta, r.NomeEmpresa, r.CNPJ].map(x=> String(x||'').toLowerCase()).join(' | ');
      if(!hay.includes(q)) return false;
    }

    const ve = parseNumber(r.ValorEmitidos);
    const vl = parseNumber(r.ValorLiquidados);
    if(minVE && ve < Number(minVE)) return false;
    if(maxVE && ve > Number(maxVE)) return false;
    if(minVL && vl < Number(minVL)) return false;
    if(maxVL && vl > Number(maxVL)) return false;

    if(hasDate && r.DataRef instanceof Date){
      if(dtIni && r.DataRef < dtIni) return false;
      if(dtFim){
        const end = new Date(dtFim.getFullYear(), dtFim.getMonth(), dtFim.getDate(), 23,59,59);
        if(r.DataRef > end) return false;
      }
    }
    return true;
  });

  initTable(filtered, /*updateFull*/ false);
}

/* --------- Tabela/Gráficos --------- */
function initTable(data, updateFull=true){
  if(updateFull){ fullData = data.slice(); }
  currentData = data.slice();

  if(table){ table.destroy(); }
  table = new DataTable('#tabela', {
    data: currentData.map(r=> [
      r.Conta,
      r.NomeEmpresa,
      r.CNPJ,
      parseNumber(r.QtdEmitidos),
      parseNumber(r.ValorEmitidos),
      parseNumber(r.QtdLiquidados),
      parseNumber(r.ValorLiquidados),
    ]),
    columns: [
      { title:'Conta' },
      { title:'NomeEmpresa' },
      { title:'CNPJ' },
      { title:'QtdEmitidos', render: DataTable.render.number(null, null, 0) },
      { title:'ValorEmitidos', render: (d)=> formatBRL(Number(d)) },
      { title:'QtdLiquidados', render: DataTable.render.number(null, null, 0) },
      { title:'ValorLiquidados', render: (d)=> formatBRL(Number(d)) },
    ],
    scrollX: true,
    responsive: true,
    pageLength: 10,
    dom: 'Brtip',
    buttons: [
      { extend: 'copyHtml5', text: 'Copiar' },
      { extend: 'csvHtml5', text: 'CSV' },
      { extend: 'excelHtml5', text: 'Excel' },
      { extend: 'pdfHtml5', text: 'PDF' },
      { extend: 'print', text: 'Imprimir' },
    ]
  });

  populateFilters(currentData);
  rebuildKPIs(currentData);
  rebuildCharts(currentData);
}

/* --------- Importador --------- */
function parseExcelFile(file, cb){
  const reader = new FileReader();
  reader.onload = (e)=>{
    const data = new Uint8Array(e.target.result);
    const wb = XLSX.read(data, { type:'array' });
    const wsname = wb.SheetNames[0];
    const ws = wb.Sheets[wsname];

    const json = XLSX.utils.sheet_to_json(ws, { raw:true });
    const out = json.map(normalizeRow).filter(r=> r.Conta && r.NomeEmpresa);
    cb(out);
  };
  reader.readAsArrayBuffer(file);
}
function parseCSVFile(file, cb){
  Papa.parse(file, {
    header: true,
    dynamicTyping: true,
    complete: (results)=>{
      const data = results.data.map(normalizeRow).filter(r=> r.Conta && r.NomeEmpresa);
      cb(data);
    }
  });
}
function toCSV(data){
  const headers = ['Conta','NomeEmpresa','CNPJ','QtdEmitidos','ValorEmitidos','QtdLiquidados','ValorLiquidados'];
  const lines = [headers.join(',')];
  for(const r of data){
    const row = [
      r.Conta, r.NomeEmpresa, r.CNPJ,
      parseNumber(r.QtdEmitidos),
      parseNumber(r.ValorEmitidos),
      parseNumber(r.QtdLiquidados),
      parseNumber(r.ValorLiquidados)
    ].map(v => (typeof v === 'string' && v.includes(',')) ? `"${v.replace(/"/g,'""')}"` : v);
    lines.push(row.join(','));
  }
  return lines.join('\n');
}
function wireImporter(){
  const fileInput = document.getElementById('fileInput');
  const btnUse = document.getElementById('btnUseFile');
  const btnCSV = document.getElementById('btnDownloadCSV');
  const btnRestore = document.getElementById('btnRestore');

  fileInput.addEventListener('change', ()=>{
    stagedData = null;
    renderValidationUI({ ok:false, errors:[], warnings:[], summary:'' });
    const f = fileInput.files && fileInput.files[0];
    if(!f) return;

    const name = (f.name||'').toLowerCase();
    const parseFn = name.endsWith('.xlsx') ? parseExcelFile : name.endsWith('.csv') ? parseCSVFile : null;
    if(!parseFn){
      renderValidationUI({ ok:false, errors:['Formato não suportado. Use .xlsx ou .csv'], warnings:[], summary:'' });
      return;
    }
    parseFn(f, (data)=>{
      stagedData = data;
      const report = runValidator(stagedData);
      renderValidationUI(report);
    });
  });

  btnUse.addEventListener('click', ()=>{
    if(!stagedData) return;
    const report = runValidator(stagedData);
    if(!report.ok){
      renderValidationUI(report);
      return;
    }
    initTable(stagedData, /*updateFull*/ true);
    clearFilters();
    renderValidationUI({ ok:true, errors:[], warnings:[], summary:'Base aplicada.' });
  });

  btnCSV.addEventListener('click', ()=>{
    if(!stagedData) return;
    const report = runValidator(stagedData);
    if(!report.ok){
      renderValidationUI(report);
      return;
    }
    const csv = toCSV(stagedData);
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'dados-normalizados.csv';
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 0);
  });

  btnRestore.addEventListener('click', ()=>{
    loadCSV();
    clearFilters();
    renderValidationUI({ ok:true, errors:[], warnings:[], summary:'Base padrão restaurada.' });
  });
}

/* --------- Eventos de filtro --------- */
function clearFilters(){
  ['fEmpresa','fCNPJ','fConta','globalSearch','minValorEmit','maxValorEmit','minValorLiq','maxValorLiq','topN','fDataIni','fDataFim']
    .forEach(id=>{ const el = document.getElementById(id); if(el) el.value = ''; });
  applyAllFilters();
}
function wireFilters(){
  document.getElementById('fEmpresa').addEventListener('change', applyAllFilters);
  document.getElementById('fCNPJ').addEventListener('change', applyAllFilters);
  document.getElementById('fConta').addEventListener('change', applyAllFilters);
  document.getElementById('globalSearch').addEventListener('input', applyAllFilters);
  document.getElementById('btnLimpar').addEventListener('click', clearFilters);
  document.getElementById('btnAplicarAvancados').addEventListener('click', applyAllFilters);
}

/* --------- Boot --------- */
function loadCSV(){
  Papa.parse('data/dados.csv', {
    header: true,
    download: true,
    dynamicTyping: true,
    complete: function(results){
      const data = results.data.map(normalizeRow).filter(r=> r.Conta && r.NomeEmpresa);
      initTable(data, /*updateFull*/ true);
    }
  });
}

document.addEventListener('DOMContentLoaded', ()=>{
  wireImporter();
  wireFilters();
  loadCSV();
});