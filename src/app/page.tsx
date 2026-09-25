"use client";

import {useEffect,useState} from "react";
import {StatCard} from "@/components/StatCard";
import {StatusBadge} from "@/components/StatusBadge";
import {money} from "@/lib/domain";

type DashboardData={
  customers:number;
  products:number;
  orders:number;
  receivables:number;
  payables:number;
};

export default function Dashboard(){
  const [data,setData]=useState<DashboardData|null>(null);
  const [error,setError]=useState("");

  useEffect(()=>{
    fetch("/api/dashboard",{cache:"no-store"})
      .then(async r=>{
        if(!r.ok) throw new Error("Não foi possível carregar o dashboard");
        return r.json();
      })
      .then(setData)
      .catch(e=>setError(e instanceof Error?e.message:"Erro ao carregar dashboard"));
  },[]);

  const orders=[{number:"—",customer:"Dados reais",status:"PRONTO" as const,due:"—",value:0}];

  return <section className="page">
    <div className="page-heading">
      <div><span className="eyebrow">MB ÓPTICA</span><h1>Centro de controle</h1><p>Visão operacional atualizada a partir do banco de dados.</p></div>
      <button className="primary">+ Nova venda</button>
    </div>

    {error&&<div className="panel"><strong>Dashboard indisponível</strong><p>{error}</p></div>}

    <div className="stats">
      <StatCard label="Clientes ativos" value={data?String(data.customers):"—"} detail="cadastros ativos"/>
      <StatCard label="Produtos ativos" value={data?String(data.products):"—"} detail="itens cadastrados"/>
      <StatCard label="Pedidos em aberto" value={data?String(data.orders):"—"} detail="fluxo óptico"/>
      <StatCard label="A receber" value={data?money(data.receivables):"—"} detail={data?money(data.payables)+" a pagar":"aguardando dados"}/>
    </div>

    <div className="grid-two">
      <div className="panel">
        <div className="panel-heading"><div><h2>Pedidos em andamento</h2><p>O próximo passo será carregar a listagem real de pedidos nesta visão.</p></div><a href="/pedidos">Ver todos</a></div>
        <div className="table">
          <div className="row header"><span>Pedido</span><span>Cliente</span><span>Status</span><span>Entrega</span><span>Total</span></div>
          {orders.map(o=><div className="row" key={o.number}><span>{o.number}</span><span>{o.customer}</span><span><StatusBadge status={o.status}/></span><span>{o.due}</span><strong>{money(o.value)}</strong></div>)}
        </div>
      </div>
      <div className="panel">
        <div className="panel-heading"><div><h2>Fluxo do laboratório</h2><p>Contagem detalhada será conectada ao domínio de pedidos na próxima camada.</p></div></div>
        <div className="funnel"><div><span>Pedidos abertos</span><strong>{data?.orders??"—"}</strong></div><div><span>Clientes ativos</span><strong>{data?.customers??"—"}</strong></div><div><span>Produtos ativos</span><strong>{data?.products??"—"}</strong></div></div>
      </div>
    </div>

    <div className="panel"><div className="panel-heading"><div><h2>Integridade do sistema</h2><p>Dados estruturados, rastreabilidade e migração segura são tratados como partes do domínio.</p></div></div><div className="principles"><div><b>Dados estruturados</b><span>Receitas, pedidos, estoque e financeiro possuem entidades próprias.</span></div><div><b>Rastreabilidade</b><span>Eventos, auditoria e lotes registram operações relevantes.</span></div><div><b>Migração segura</b><span>O legado BeepStart permanece preservado e separado do modelo novo.</span></div></div></div>
  </section>;
}
