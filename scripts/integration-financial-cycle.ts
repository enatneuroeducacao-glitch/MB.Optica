import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

const db = new PrismaClient();
const base = process.env.INTEGRATION_BASE_URL || "http://127.0.0.1:3000";

function assert(ok: unknown, message: string) {
  if (!ok) throw new Error("ASSERTION: " + message);
}
function money(v: any) { return Number(v || 0); }

async function api(path: string, init: RequestInit = {}) {
  const r = await fetch(base + path, init);
  const raw = await r.text();
  const body = raw ? JSON.parse(raw) : {};
  if (!r.ok) throw new Error(`${init.method || "GET"} ${path} -> ${r.status}: ${JSON.stringify(body)}`);
  return { body };
}

async function main() {
  const secret = process.env.AUTH_SECRET;
  assert(secret && secret.length >= 32, "AUTH_SECRET ausente");

  await api("/api/health");

  const suffix = Date.now().toString();
  const user = await db.user.create({
    data: { name: "CI Financial Test", email: `ci-${suffix}@mb-optica.local`, role: "ADMIN", active: true }
  });

  const token = await new SignJWT({
    userId: user.id,
    role: user.role,
    version: user.sessionVersion,
    permissions: {}
  }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret));
  const headers = { "content-type": "application/json", cookie: `mb_optica_session=${token}` };

  const customer = await db.customer.create({
    data: { name: "CI Cliente Financeiro", cpfCnpj: `9${suffix.slice(-10)}`, active: true }
  });
  const product = await db.product.create({
    data: { code: "CI-FIN-" + suffix, description: "Produto CI Financeiro", cost: 40, salePrice: 120, stockControlled: true, active: true }
  });
  const lot = await db.stockLot.create({ data: { productId: product.id, quantity: 10, cost: 40, description: "Lote CI" } });
  const cash = await db.paymentMethod.create({ data: { name: "CI Dinheiro " + suffix, isCash: true } });
  const pix = await db.paymentMethod.create({ data: { name: "CI Pix " + suffix, isCash: false } });
  const card = await db.paymentMethod.create({ data: { name: "CI Cartão " + suffix, isCash: false } });

  const opened = await api("/api/cash/session", {
    method: "POST", headers, body: JSON.stringify({ openingCash: 100 })
  });

  const sale = await api("/api/sales", {
    method: "POST", headers, body: JSON.stringify({
      customerId: customer.id, sellerId: user.id, discount: 20, installments: 2,
      entryAmount: 20, paymentMethodId: cash.id, paymentCondition: "Entrada + 2 parcelas",
      items: [{ productId: product.id, description: product.description, quantity: 1, unitPrice: 120, unitCost: 40 }],
      stock: [{ productId: product.id, quantity: 1 }]
    })
  });
  assert(money(sale.body.total) === 100, "desconto/total");
  assert(money(sale.body.entryPayment?.amount) === 20, "entrada");
  assert(sale.body.accounts?.length === 2, "parcelas");

  let currentLot = await db.stockLot.findUnique({ where: { id: lot.id } });
  assert(money(currentLot?.quantity) === 9, "baixa de estoque");

  for (const [index, method] of [[0, pix], [1, card]] as const) {
    const settled = await api("/api/financeiro", {
      method: "POST", headers, body: JSON.stringify({
        action: "SETTLE_ACCOUNT", accountId: sale.body.accounts[index].id,
        amount: 40, methodId: method.id, reference: "CI-" + index
      })
    });
    assert(settled.body.account.status === "PAGO", "quitação da parcela " + (index + 1));
  }

  let finance = await api("/api/financeiro", { headers });
  assert(Math.abs(money(finance.body.summary.received) - 100) < .01, "recebimento total antes do cancelamento");

  await api("/api/sales/" + sale.body.id + "/cancel", {
    method: "POST", headers, body: JSON.stringify({ reason: "Teste integrado de devolução financeira" })
  });

  const canceled = await db.sale.findUnique({
    where: { id: sale.body.id },
    include: { payments: true, accounts: { include: { settlements: true } } }
  });
  assert(canceled?.canceled === true, "cancelamento");
  assert(canceled?.payments.every(p => p.reversedAt), "estorno dos pagamentos");
  assert(canceled?.accounts.every(a => a.status === "CANCELADO" && money(a.paidAmount) === 0), "cancelamento das contas");
  assert(canceled?.accounts.every(a => a.settlements.every(s => s.reversedAt)), "reversão das liquidações");

  currentLot = await db.stockLot.findUnique({ where: { id: lot.id } });
  assert(money(currentLot?.quantity) === 10, "recomposição do estoque");
  assert(await db.stockMovement.findFirst({ where: { reference: "CANCELAMENTO_VENDA", referenceId: sale.body.id, type: "DEVOLUCAO" } }), "movimento de devolução");

  const cashState = await db.cashSession.findUnique({ where: { id: opened.body.id }, include: { movements: true } });
  const ins = cashState?.movements.filter(m => ["ENTRADA", "REFORCO"].includes(m.kind)).reduce((a, m) => a + money(m.amount), 0) || 0;
  const outs = cashState?.movements.filter(m => ["SAIDA", "SANGRIA"].includes(m.kind)).reduce((a, m) => a + money(m.amount), 0) || 0;
  assert(Math.abs(100 + ins - outs - 100) < .01, "saldo do caixa após devolução");

  finance = await api("/api/financeiro", { headers });
  assert(Math.abs(money(finance.body.summary.received)) < .01, "recebimentos estornados");

  const salePix = await api("/api/sales", {
    method: "POST", headers, body: JSON.stringify({
      customerId: customer.id, sellerId: user.id,
      items: [{ description: "Teste Pix", quantity: 1, unitPrice: 50 }]
    })
  });
  await api("/api/payments", {
    method: "POST", headers, body: JSON.stringify({
      saleId: salePix.body.id, amount: 50, methodId: pix.id, reference: "CI-PIX"
    })
  });

  const saleCard = await api("/api/sales", {
    method: "POST", headers, body: JSON.stringify({
      customerId: customer.id, sellerId: user.id,
      items: [{ description: "Teste Cartão", quantity: 1, unitPrice: 70 }]
    })
  });
  await api("/api/payments", {
    method: "POST", headers, body: JSON.stringify({
      saleId: saleCard.body.id, amount: 70, methodId: card.id, reference: "CI-CARD"
    })
  });

  finance = await api("/api/financeiro", { headers });
  assert(Math.abs(money(finance.body.summary.received) - 120) < .01, "Pix + cartão");

  for (const id of [salePix.body.id, saleCard.body.id]) {
    await api("/api/sales/" + id + "/cancel", {
      method: "POST", headers, body: JSON.stringify({ reason: "Teste integrado de estorno" })
    });
  }

  finance = await api("/api/financeiro", { headers });
  assert(Math.abs(money(finance.body.summary.received)) < .01, "saldo financeiro após estornos finais");

  console.log("INTEGRATION_FINANCIAL_CYCLE: PASS");
  console.log(JSON.stringify({ sale: sale.body.id, stock: money(currentLot?.quantity), received: money(finance.body.summary.received) }));
}

main().catch(error => {
  console.error("INTEGRATION_FINANCIAL_CYCLE: FAIL");
  console.error(error);
  process.exitCode = 1;
}).finally(() => db.$disconnect());
