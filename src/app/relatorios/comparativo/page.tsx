"use client";

import { useEffect, useMemo, useState } from "react";

const num = (value: any) => Number(value || 0);
const money = (value: number) => num(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent = (value: number) => `${value >= 0 ? "+" : ""}${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const monthName = (key: string, short = false) => {
  const [year, month] = key.split("-").map(Number);
  const label = new Intl.DateTimeFormat("pt-BR", { month: short ? "short" : "long" }).format(new Date(year, month - 1, 1));
  return short ? label.replace(".", "") : `${label} ${year}`;
};
const shiftMonth = (key: string, offset: number) => {
  const [year, month] = key.split("-").map(Number);
  const d = new Date(year, month - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const pctChange = (current: number, previous: number) => previous > 0 ? ((current - previous) / previous) * 100 : null;
const average = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
const stddev = (values: number[]) => values.length > 1 ? Math.sqrt(average(values.map(v => (v - average(values)) ** 2))) : 0;

type MonthRow = { month: string; total: number; sales: number; partial?: boolean; origin?: string; observed?: boolean };

export default function AnaliseComparativa() {
  const [operational, setOperational] = useState<any>(null);
  const [history, setHistory] = useState<any>(null);
  const [legacy, setLegacy] = useState<any>(null);
  const [manual, setManual] = useState<any[]>([]);
  const [source, setSource] = useState("beepstart");
  const [period, setPeriod] = useState(6);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/relatorios/comparativo", { cache: "no-store", credentials: "same-origin" }).then(r => r.ok ? r.json() : Promise.reject(new Error("Não foi possível consultar o faturamento operacional."))),
      fetch("/beepstart-historico-mensal.json", { cache: "no-store" }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/migration/financial-sales", { cache: "no-store", credentials: "same-origin" }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/relatorios/historico-manual", { cache: "no-store", credentials: "same-origin" }).then(r => r.ok ? r.json() : null).catch(() => null)
    ]).then(([op, h, l, m]) => {
      if (!active) return;
      setOperational(op); setHistory(h); setLegacy(l); setManual(m?.entries || []);
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : "Falha ao carregar os dados."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const sourceRows = useMemo<MonthRow[]>(() => {
    const operationalRows: MonthRow[] = (operational?.monthly || []).map((x: any) => ({
      month: String(x.month), total: num(x.total), sales: num(x.sales), partial: Boolean(x.partial), origin: "MB Óptica", observed: true
    }));
    const legacyData = history?.monthly?.length ? history.monthly : legacy?.monthly || [];
    const historicalRows: MonthRow[] = legacyData.map((x: any) => ({
      month: String(x.month), total: num(x.total), sales: num(x.sales), partial: Boolean(x.partial), origin: history?.monthly?.length ? "BeepStart — backup histórico verificado" : "BeepStart — registros recuperados", observed: true
    }));
    const manualRows: MonthRow[] = (manual || []).map((x: any) => ({
      month: String(x.month), total: num(x.total), sales: num(x.sales), partial: false, origin: "Lançamento manual", observed: true
    }));
    if (source === "operacional") return operationalRows;
    if (source === "manual") return manualRows;
    return historicalRows;
  }, [operational, history, legacy, manual, source]);

  const sourceLabel = source === "operacional" ? "Faturamento operacional MB Óptica" : source === "manual" ? "Lançamentos manuais" : "Histórico BeepStart";
  const currentKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const byMonth = useMemo(() => new Map<string, MonthRow>(sourceRows.map(r => [r.month, r] as [string, MonthRow])), [sourceRows]);
  const rows = useMemo(() => sourceRows.slice().sort((a,b) => a.month.localeCompare(b.month)), [sourceRows]);
  const years = useMemo(() => [...new Set(rows.map(r => Number(r.month.slice(0, 4))))].sort((a, b) => b - a), [rows]);
  const activeYear = years.includes(selectedYear) ? selectedYear : (years[0] || new Date().getFullYear());
  const selectedYearRows = useMemo(() => rows.filter(r => Number(r.month.slice(0, 4)) === activeYear), [rows, activeYear]);
  const sixMonthRows = useMemo(() => Array.from({ length: period }, (_, i) => {
    const month = shiftMonth(currentKey, i - period + 1);
    return byMonth.get(month) || ({ month, total: 0, sales: 0, origin: sourceLabel, observed: false } as MonthRow);
  }), [byMonth, currentKey, period, sourceLabel]);
  const recentValues = sixMonthRows.filter(r => r.observed && !r.partial).map(r => r.total);
  const recentAverage = average(recentValues);
  const currentYearTotal = selectedYearRows.filter(r => !r.partial).reduce((s, r) => s + r.total, 0);
  const monthComparisons = selectedYearRows.map(r => {
    const prior = byMonth.get(`${activeYear - 1}-${r.month.slice(5, 7)}`);
    const comparable = Boolean(prior && !prior.partial && !r.partial);
    return { ...r, prior: comparable ? prior!.total : null, change: comparable ? pctChange(r.total, prior!.total) : null };
  }).filter(r => r.observed && (r.total > 0 || (r.prior ?? 0) > 0));
  const comparableMonths = monthComparisons.filter(r => r.change !== null);
  const currentComparableTotal = comparableMonths.reduce((s, r) => s + r.total, 0);
  const previousComparableTotal = comparableMonths.reduce((s, r) => s + (r.prior || 0), 0);
  const annualGrowth = pctChange(currentComparableTotal, previousComparableTotal);
  const improved = comparableMonths.filter(r => r.change !== null && r.change! > 0);
  const declined = comparableMonths.filter(r => r.change !== null && r.change! < 0);
  const yearsAscending = years.slice().reverse();
  const monthMatrix = Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, "0");
    return { month, values: yearsAscending.map(year => {
      const row = byMonth.get(`${year}-${month}`);
      return row && !row.partial ? row.total : null;
    }) };
  });
  const annualTotals = useMemo(() => years.slice().reverse().map(year => {
    const data = rows.filter(r => Number(r.month.slice(0, 4)) === year && !r.partial);
    return { year, total: data.reduce((s, r) => s + r.total, 0), count: data.length, monthsWithSales: data.filter(r => r.total > 0).length };
  }), [years, rows]);
  const chartRows = sixMonthRows;
  const chartMax = Math.max(1, ...chartRows.filter(r => r.observed).map(r => r.total));

  const forecasts = useMemo(() => {
    const completed = rows.filter(r => r.observed && !r.partial && r.month < currentKey).sort((a,b) => a.month.localeCompare(b.month));
    const tail: MonthRow[] = [];
    for (let i = completed.length - 1; i >= 0 && tail.length < 6; i--) {
      if (tail.length && shiftMonth(completed[i].month, 1) !== tail[0].month) break;
      tail.unshift(completed[i]);
    }
    if (tail.length < 3) return [1,2,3].map(offset => ({ month: shiftMonth(currentKey, offset), estimate: null, low: null, high: null, empirical: null, sample: 0, confidence: "Insuficiente", reason: "São necessários ao menos três meses completos e consecutivos nesta fonte." }));
    const values = tail.map(r => r.total);
    const baseline = average(values);
    const xMean = (values.length - 1) / 2;
    const yMean = baseline;
    const denominator = values.reduce((s, _, i) => s + (i - xMean) ** 2, 0);
    const slope = denominator ? values.reduce((s, y, i) => s + (i - xMean) * (y - yMean), 0) / denominator : 0;
    const residuals = values.map((v,i) => v - (yMean + slope * (i - xMean)));
    const residualStd = stddev(residuals);
    return [1,2,3].map(offset => {
      const month = shiftMonth(currentKey, offset);
      const monthNum = month.slice(5, 7);
      const seasonal = completed.filter(r => r.month.slice(5, 7) === monthNum && Number(r.month.slice(0,4)) < Number(currentKey.slice(0,4))).map(r => r.total);
      const seasonalAverage = average(seasonal);
      const trendEstimate = Math.max(0, baseline + slope * (values.length - 1 + offset));
      const estimate = Math.max(0, seasonal.length ? trendEstimate * 0.65 + seasonalAverage * 0.35 : trendEstimate);
      const spread = Math.max(residualStd, seasonal.length > 1 ? stddev(seasonal) : estimate * 0.20);
      const empirical = seasonal.length >= 2 ? Math.round(seasonal.filter(v => v >= recentAverage).length / seasonal.length * 100) : null;
      const confidence = seasonal.length >= 3 && tail.length >= 5 ? "Moderada" : seasonal.length >= 2 && tail.length >= 4 ? "Baixa" : "Muito baixa";
      return { month, estimate, low: Math.max(0, estimate - spread), high: estimate + spread, empirical, sample: seasonal.length, confidence, reason: "" };
    });
  }, [rows, currentKey, recentAverage]);

  if (loading) return <section className="page"><div className="panel" style={{ padding: 28 }}>Carregando análise comparativa...</div></section>;
  if (error) return <section className="page"><div className="panel" style={{ padding: 28 }}><h2>Não foi possível gerar a análise</h2><p>{error}</p><button className="secondary" onClick={() => location.reload()}>Tentar novamente</button></div></section>;

  return (
    <section className="page mb-comparativo">
      <style jsx>{`
        .mb-comparativo{max-width:1600px}.cmp-heading{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;margin-bottom:20px}.cmp-heading h1{font-size:26px;margin:0}.cmp-heading p{font-size:12px;color:var(--muted);margin:7px 0 0}.cmp-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.cmp-controls select{border:1px solid var(--line);background:#fff;border-radius:8px;padding:9px 12px;font-size:11px;color:var(--text)}.cmp-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}.cmp-card,.cmp-panel{background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow)}.cmp-card{padding:16px}.cmp-card span{display:block;font-size:10px;color:var(--muted)}.cmp-card strong{display:block;font-size:22px;margin:8px 0 4px;letter-spacing:-.03em}.cmp-card small{font-size:9px;color:var(--muted)}.cmp-panels{display:grid;grid-template-columns:1.25fr 1fr;gap:14px;margin-bottom:14px}.cmp-panel{padding:18px;min-width:0}.cmp-panel h2{font-size:13px;margin:0 0 5px}.cmp-panel>p{font-size:10px;color:var(--muted);margin:0 0 16px;line-height:1.5}.cmp-chart{display:grid;gap:11px}.cmp-chart-row{display:grid;grid-template-columns:76px 1fr 94px;gap:9px;align-items:center;font-size:10px}.cmp-track{height:13px;background:#f2eee8;border-radius:10px;overflow:hidden}.cmp-bar{height:100%;background:#b58a4a;border-radius:10px;min-width:2px}.cmp-bar.positive{background:#27866c}.cmp-value{text-align:right;font-weight:700;font-variant-numeric:tabular-nums}.cmp-year-list{display:grid;gap:10px}.cmp-year{display:grid;grid-template-columns:52px 1fr 105px;gap:10px;align-items:center;font-size:10px}.cmp-year-track{height:11px;background:#f2eee8;border-radius:10px;overflow:hidden}.cmp-year-fill{height:100%;background:#8b9da8;border-radius:10px}.cmp-table-wrap{overflow:auto}.cmp-table{width:100%;border-collapse:collapse;font-size:10px;min-width:520px}.cmp-table th,.cmp-table td{text-align:left;padding:11px 10px;border-bottom:1px solid #eee8df;white-space:nowrap}.cmp-table th{font-size:8px;text-transform:uppercase;color:#887b6e;background:#fbfaf8}.cmp-up{color:#187653;font-weight:700}.cmp-down{color:#b44c45;font-weight:700}.cmp-neutral{color:#8b7b67}.cmp-pill{display:inline-block;padding:4px 7px;border-radius:20px;background:#f1eee9;font-size:8px}.cmp-forecast{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.cmp-forecast-card{padding:13px;border:1px solid var(--line);border-radius:10px;background:#fffdf9}.cmp-forecast-card b{display:block;font-size:10px}.cmp-forecast-card strong{display:block;font-size:18px;margin:9px 0 5px}.cmp-forecast-card small{display:block;color:var(--muted);font-size:9px;line-height:1.5}.cmp-note{font-size:10px!important;color:var(--muted);line-height:1.6;margin-top:12px!important}.cmp-insights{display:grid;grid-template-columns:1fr 1fr;gap:10px}.cmp-insight{padding:12px;border-radius:9px;background:#faf8f4;border:1px solid var(--line)}.cmp-insight b{display:block;font-size:11px;margin-bottom:5px}.cmp-insight span{font-size:10px;color:var(--muted);line-height:1.5}.cmp-source{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.cmp-source span{padding:5px 8px;border:1px solid var(--line);border-radius:20px;font-size:8px;color:var(--muted)}@media(max-width:1000px){.cmp-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.cmp-panels{grid-template-columns:1fr}}@media(max-width:650px){.cmp-heading{align-items:flex-start;flex-direction:column}.cmp-grid{grid-template-columns:1fr 1fr}.cmp-card strong{font-size:18px}.cmp-forecast{grid-template-columns:1fr}.cmp-insights{grid-template-columns:1fr}.cmp-chart-row{grid-template-columns:58px 1fr 78px}}@media print{.cmp-controls{display:none}.cmp-panel,.cmp-card{box-shadow:none;break-inside:avoid}}
      `}</style>

      <div className="cmp-heading">
        <div><span className="eyebrow">INTELIGÊNCIA GERENCIAL</span><h1>Análise comparativa</h1><p>Desempenho mensal, evolução histórica, comparação anual e projeção de faturamento.</p><p><b>Fonte selecionada:</b> {sourceLabel}. As fontes não são somadas entre si.</p></div>
        <div className="cmp-controls">
          <label style={{fontSize:10,color:"var(--muted)"}}>Fonte dos dados</label>
          <select value={source} onChange={e => setSource(e.target.value)}><option value="beepstart">Histórico BeepStart</option><option value="operacional">Operacional MB Óptica</option><option value="manual">Lançamentos manuais</option></select>
          <label style={{fontSize:10,color:"var(--muted)"}}>Janela recente</label>
          <select value={period} onChange={e => setPeriod(Number(e.target.value))}><option value={6}>Últimos 6 meses</option><option value={12}>Últimos 12 meses</option><option value={24}>Últimos 24 meses</option></select>
          <label style={{fontSize:10,color:"var(--muted)"}}>Ano-base</label>
          <select value={activeYear} onChange={e => setSelectedYear(Number(e.target.value))}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select>
          <button className="secondary" onClick={() => window.print()}>Imprimir análise</button>
        </div>
      </div>

      <div className="cmp-grid">
        <div className="cmp-card"><span>Faturamento registrado no ano-base</span><strong>{money(currentYearTotal)}</strong><small>{selectedYearRows.filter(r => !r.partial).length} competências completas disponíveis</small></div>
        <div className="cmp-card"><span>Variação anual comparável</span><strong className={annualGrowth === null ? "" : annualGrowth >= 0 ? "cmp-up" : "cmp-down"}>{annualGrowth === null ? "Sem base" : percent(annualGrowth)}</strong><small>{activeYear} versus {activeYear - 1}, somente meses com dados nos dois anos</small></div>
        <div className="cmp-card"><span>Meses em evolução</span><strong className="cmp-up">{improved.length}</strong><small>Comparação com o mesmo mês do ano anterior</small></div>
        <div className="cmp-card"><span>Meses em regressão</span><strong className="cmp-down">{declined.length}</strong><small>Comparação com o mesmo mês do ano anterior</small></div>
      </div>

      <div className="cmp-panels">
        <div className="cmp-panel">
          <h2>Comparação dos últimos {period} meses</h2><p>Faturamento por competência. “Sem registro” é diferente de faturamento efetivamente igual a zero; o mês atual pode estar parcial.</p>
          <div className="cmp-chart">{chartRows.map(r => <div className="cmp-chart-row" key={r.month}><span>{monthName(r.month, true)} <small>{r.month.slice(0,4)}</small></span><div className="cmp-track"><div className="cmp-bar" style={{ width: `${Math.max(r.total > 0 ? 1 : 0, r.total / chartMax * 100)}%` }} /></div><span className="cmp-value">{r.observed ? money(r.total) : "Sem registro"}</span></div>)}</div>
          <div className="cmp-source"><span>Dados operacionais</span><span>Histórico BeepStart</span><span>Lançamentos manuais</span></div>
        </div>
        <div className="cmp-panel">
          <h2>Comparação entre anos</h2><p>Totais das competências registradas por ano. Ausência de competência não é interpretada como faturamento zero.</p>
          <div className="cmp-year-list">{annualTotals.map(y => <div className="cmp-year" key={y.year}><b>{y.year}</b><div className="cmp-year-track"><div className="cmp-year-fill" style={{ width: `${Math.max(1, y.total / Math.max(1, ...annualTotals.map(x => x.total)) * 100)}%` }} /></div><span className="cmp-value">{money(y.total)} <small>({y.count} competências)</small></span></div>)}</div>
          <p className="cmp-note">Atenção: anos em andamento ou com histórico parcial não devem ser comparados como exercícios completos. Para a variação anual, o painel utiliza apenas competências presentes nos dois anos.</p>
        </div>
      </div>

      <div className="cmp-panel" style={{ marginBottom: 14 }}>
        <h2>Comparação da mesma competência entre todos os anos</h2><p>Leia cada linha horizontalmente para verificar como o mesmo mês se comportou ao longo da série histórica.</p>
        <div className="cmp-table-wrap"><table className="cmp-table"><thead><tr><th>Mês</th>{yearsAscending.map(y => <th key={y}>{y}</th>)}</tr></thead><tbody>
          {monthMatrix.map(row => <tr key={row.month}><td>{new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(2020, Number(row.month) - 1, 1))}</td>{row.values.map((value, i) => <td key={yearsAscending[i]}>{value === null ? "—" : money(value)}</td>)}</tr>)}
        </tbody></table></div>
      </div>

      <div className="cmp-panel" style={{ marginBottom: 14 }}>
        <h2>Mesmo mês, anos diferentes — {activeYear}</h2><p>Identifica quais competências cresceram ou recuaram em relação ao mesmo mês do ano anterior.</p>
        <div className="cmp-table-wrap"><table className="cmp-table"><thead><tr><th>Mês</th><th>{activeYear - 1}</th><th>{activeYear}</th><th>Variação</th><th>Leitura</th></tr></thead><tbody>
          {monthComparisons.map(r => <tr key={r.month}><td>{monthName(r.month)}</td><td>{r.prior === null ? "Sem base completa" : money(r.prior)}</td><td>{money(r.total)}</td><td className={r.change === null ? "cmp-neutral" : r.change >= 0 ? "cmp-up" : "cmp-down"}>{r.change === null ? "Sem base completa" : percent(r.change)}</td><td><span className="cmp-pill">{r.change === null ? "Sem comparação" : r.change > 0 ? "Evolução" : r.change < 0 ? "Regressão" : "Estável"}</span></td></tr>)}
          {!monthComparisons.length && <tr><td colSpan={5}>Ainda não existem competências suficientes para comparar este ano.</td></tr>}
        </tbody></table></div>
      </div>

      <div className="cmp-panels">
        <div className="cmp-panel">
          <h2>Meses que mais evoluíram</h2><p>Variação percentual positiva em relação ao mesmo mês do ano anterior.</p>
          <div className="cmp-table-wrap"><table className="cmp-table"><thead><tr><th>Competência</th><th>Faturamento atual</th><th>Variação</th></tr></thead><tbody>{improved.slice().sort((a,b) => (b.change || 0) - (a.change || 0)).map(r => <tr key={r.month}><td>{monthName(r.month)}</td><td>{money(r.total)}</td><td className="cmp-up">{percent(r.change || 0)}</td></tr>)}{!improved.length && <tr><td colSpan={3}>Nenhum mês com evolução comprovada nesta comparação.</td></tr>}</tbody></table></div>
        </div>
        <div className="cmp-panel">
          <h2>Meses que mais regrediram</h2><p>Variação percentual negativa em relação ao mesmo mês do ano anterior.</p>
          <div className="cmp-table-wrap"><table className="cmp-table"><thead><tr><th>Competência</th><th>Faturamento atual</th><th>Variação</th></tr></thead><tbody>{declined.slice().sort((a,b) => (a.change || 0) - (b.change || 0)).map(r => <tr key={r.month}><td>{monthName(r.month)}</td><td>{money(r.total)}</td><td className="cmp-down">{percent(r.change || 0)}</td></tr>)}{!declined.length && <tr><td colSpan={3}>Nenhum mês com regressão comprovada nesta comparação.</td></tr>}</tbody></table></div>
        </div>
      </div>

      <div className="cmp-panel" style={{ marginBottom: 14 }}>
        <h2>Projeção dos próximos três meses</h2><p>Estimativa baseada na média recente, tendência dos últimos meses e histórico da mesma competência em anos anteriores.</p>
        <div className="cmp-forecast">{forecasts.map(f => <div className="cmp-forecast-card" key={f.month}><b>{monthName(f.month)}</b><strong>{f.estimate === null ? "Sem estimativa" : money(f.estimate)}</strong><small>{f.estimate === null ? f.reason : `Faixa indicativa: ${money(f.low ?? 0)} a ${money(f.high ?? 0)}`}</small><small>Confiança: {f.confidence} · Amostra sazonal: {f.sample} ano(s)</small><small>{f.empirical === null ? "Frequência histórica indisponível: amostra insuficiente" : `${f.empirical}% das observações históricas deste mês superaram a média recente`}</small></div>)}</div>
        <p className="cmp-note">A frequência apresentada é uma estatística descritiva histórica, não uma probabilidade calibrada de resultado futuro. A projeção usa somente meses completos e consecutivos da fonte selecionada; não preenche lacunas com zero. Com poucos dados, o painel informa insuficiência em vez de inventar uma previsão. Não substitui orçamento, meta comercial ou fluxo de caixa.</p>
      </div>

      <div className="cmp-panel">
        <h2>Leitura gerencial automática</h2><p>Resumo objetivo dos sinais encontrados na comparação.</p>
        <div className="cmp-insights">
          <div className="cmp-insight"><b>{improved.length} competência(s) em evolução</b><span>{improved.length ? "Os meses positivos indicam crescimento no comparativo anual. Vale identificar ações comerciais, mix de produtos e campanhas que contribuíram para o resultado." : "Não há crescimento anual comprovado nos meses disponíveis. Verifique se há dados suficientes para comparação."}</span></div>
          <div className="cmp-insight"><b>{declined.length} competência(s) em regressão</b><span>{declined.length ? "Investigue sazonalidade, volume de vendas, ticket médio, disponibilidade de produtos e conversão de orçamentos nos meses apontados." : "Nenhuma regressão anual foi identificada entre os meses comparáveis."}</span></div>
          <div className="cmp-insight"><b>Média dos últimos {period} meses: {money(recentAverage)}</b><span>Calculada com competências completas observadas na fonte selecionada, incluindo meses com faturamento zero confirmado. Competências sem registro não entram na média.</span></div>
          <div className="cmp-insight"><b>Base de dados e cobertura</b><span>{rows.length} competências identificadas, de {rows[0]?.month || "—"} a {rows[rows.length - 1]?.month || "—"}. A fonte é selecionada explicitamente no topo. Nenhum valor operacional, histórico ou manual é somado a outra fonte. Competências ausentes permanecem sem registro; valores zero só aparecem quando a fonte confirma a competência.</span></div>
        </div>
      </div>
    </section>
  );
}
