"use client";

import Link from "next/link";

const plans=[
  ["Básico","R$ 75/mês","Para pequenas ópticas"],
  ["Profissional","R$ 100/mês","Para ópticas em crescimento"],
  ["Premium","R$ 150/mês","Para operações maiores"],
  ["Enterprise","R$ 200/mês","Para redes e operações completas"],
];

export default function PublicLanding(){
  return <main className="public-landing">
    <header className="public-header">
      <Link href="/inicio" className="public-brand"><span className="public-mark">MB</span><span><b>MB Óptica</b><small>Gestão inteligente</small></span></Link>
      <div className="public-header-actions">
        <Link href="/login" className="public-login">Entrar</Link>
        <Link href="/login?trial=1" className="public-cta">Degustar 15 dias</Link>
      </div>
    </header>

    <section className="public-hero">
      <div className="public-hero-copy">
        <span className="public-eyebrow">MB GESTÃO INTELIGENTE</span>
        <h1>Transforme sua óptica em uma operação mais organizada, inteligente e lucrativa.</h1>
        <p>Um sistema completo para administrar clientes, receitas, pedidos, laboratório, estoque, vendas, caixa, financeiro e indicadores — em um único lugar.</p>
        <div className="public-actions">
          <Link href="/login?trial=1" className="public-cta public-cta-large">Começar degustação gratuita</Link>
          <Link href="/login" className="public-login public-login-large">Já sou cliente · Entrar</Link>
        </div>
        <div className="public-trust"><span>✓ 15 dias para experimentar</span><span>✓ Sem compromisso</span><span>✓ Gestão centralizada</span></div>
      </div>
      <div className="public-dashboard-preview">
        <div className="preview-top"><span>MB ÓPTICA</span><b>Centro de controle</b><i>● Sistema ativo</i></div>
        <div className="preview-grid">{[["Faturamento do mês","R$ 12.480,00"],["A receber","R$ 3.240,00"],["A pagar","R$ 1.180,00"],["Estoque a custo","R$ 28.640,00"]].map(x=><div key={x[0]}><small>{x[0]}</small><strong>{x[1]}</strong><span>Atualizado agora</span></div>)}</div>
        <div className="preview-flow"><b>Fluxo da óptica</b><span>Cliente → Receita → Orçamento → Pedido → Laboratório → Entrega</span></div>
        <div className="preview-bars"><span/><span/><span/><span/><span/><span/></div>
      </div>
    </section>

    <section className="public-section">
      <div className="public-section-heading"><span className="public-eyebrow">TUDO CONECTADO</span><h2>Uma gestão pensada para a realidade da óptica</h2><p>Menos planilhas e retrabalho. Mais controle sobre cada etapa da operação.</p></div>
      <div className="public-features">
        {[["Clientes e receitas","Histórico do cliente, receitas e atendimento organizados."],["Pedidos e laboratório","Acompanhe a produção desde a venda até a conferência e entrega."],["Produtos e estoque","Entradas, saídas, inventário, mínimos e alertas."],["Vendas e caixa","Venda, pagamento, parcelamento e movimentação de caixa."],["Financeiro","Contas, recebimentos, pagamentos e visão econômica."],["Gestão inteligente","Indicadores, relatórios, alertas e acompanhamento da operação."]].map(x=><article key={x[0]}><div className="public-feature-icon">✓</div><h3>{x[0]}</h3><p>{x[1]}</p></article>)}
      </div>
    </section>

    <section className="public-section public-pricing">
      <div className="public-section-heading"><span className="public-eyebrow">PLANOS</span><h2>Comece pequeno. Cresça com a sua óptica.</h2><p>Todos os planos comerciais começam com 15 dias de degustação.</p></div>
      <div className="public-plans">{plans.map((p,i)=><article key={p[0]} className={i===1?"featured":""}><span>{p[0]}</span><strong>{p[1]}</strong><p>{p[2]}</p><Link href="/login?trial=1">Experimentar</Link></article>)}</div>
    </section>

    <section className="public-final-cta">
      <div><span className="public-eyebrow">PRONTO PARA CONHECER?</span><h2>Experimente o MB Gestão Inteligente por 15 dias.</h2><p>Entre na sua conta administrativa e inicie a degustação pelo próprio sistema.</p></div>
      <Link href="/login?trial=1" className="public-cta public-cta-large">Iniciar degustação</Link>
    </section>

    <footer className="public-footer"><b>MB Óptica · MB Gestão Inteligente</b><span>Gestão, operação e inteligência para ópticas.</span><Link href="/login">Acessar sistema</Link></footer>
  </main>;
}
