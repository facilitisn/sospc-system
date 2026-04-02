import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Barcode,
  CreditCard,
  Minus,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  User,
  Wallet,
} from "lucide-react";

/**
 * PDVFocusPage
 * -------------------------------------------------------
 * Página de PDV em modo operacional, sem depender do AppShell.
 *
 * Como usar:
 * 1) Crie uma rota própria para /pdv usando ESTE componente direto,
 *    fora do layout com Sidebar/Header global.
 * 2) Importe o CSS deste arquivo no styles.css global ou no entry da página.
 * 3) Substitua os mocks pelos seus estados reais, consultas Supabase
 *    e handlers já existentes.
 */
export default function PDVFocusPage() {
  const [cliente, setCliente] = useState("");
  const [codigo, setCodigo] = useState("");
  const [pagamento, setPagamento] = useState("dinheiro");
  const [recebido, setRecebido] = useState("0");
  const [itens, setItens] = useState([
    { id: 1, nome: "Troca de tela", tipo: "serviço", qtd: 1, valor: 180 },
    { id: 2, nome: "Película 3D", tipo: "produto", qtd: 2, valor: 25 },
    { id: 3, nome: "Conector USB-C", tipo: "produto", qtd: 1, valor: 32.9 },
  ]);

  useEffect(() => {
    document.body.classList.add("pdv-focus-body");
    return () => document.body.classList.remove("pdv-focus-body");
  }, []);

  const resumo = useMemo(() => {
    const produtos = itens
      .filter((item) => item.tipo === "produto")
      .reduce((acc, item) => acc + item.qtd * item.valor, 0);

    const servicos = itens
      .filter((item) => item.tipo === "serviço")
      .reduce((acc, item) => acc + item.qtd * item.valor, 0);

    const subtotal = produtos + servicos;
    const desconto = 0;
    const total = subtotal - desconto;
    const recebidoNum = Number(String(recebido).replace(",", ".")) || 0;
    const troco = Math.max(recebidoNum - total, 0);

    return { produtos, servicos, subtotal, desconto, total, troco };
  }, [itens, recebido]);

  function adicionarMock() {
    if (!codigo.trim()) return;
    setItens((prev) => [
      ...prev,
      {
        id: Date.now(),
        nome: `Item ${codigo}`,
        tipo: "produto",
        qtd: 1,
        valor: 19.9,
      },
    ]);
    setCodigo("");
  }

  function alterarQtd(id, delta) {
    setItens((prev) =>
      prev
        .map((item) =>
          item.id === id ? { ...item, qtd: Math.max(1, item.qtd + delta) } : item
        )
    );
  }

  function removerItem(id) {
    setItens((prev) => prev.filter((item) => item.id !== id));
  }

  function formatMoney(value) {
    return value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  return (
    <div className="pdv-focus">
      <header className="pdv-focus__topbar">
        <div className="pdv-focus__brand">
          <button className="pdv-focus__back" onClick={() => window.history.back()}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <span className="pdv-focus__eyebrow">Modo operacional</span>
            <h1>PDV</h1>
          </div>
        </div>

        <div className="pdv-focus__status">
          <div className="pdv-chip pdv-chip--success">
            <Wallet size={16} />
            Caixa aberto
          </div>
          <div className="pdv-chip">Operador: Walmir</div>
          <div className="pdv-chip">Loja: Matriz</div>
        </div>
      </header>

      <main className="pdv-focus__layout">
        <section className="pdv-focus__left">
          <div className="pdv-panel">
            <div className="pdv-panel__header">
              <div>
                <h2>Atendimento</h2>
                <p>Cliente, leitura rápida e inclusão de itens.</p>
              </div>
            </div>

            <div className="pdv-form-grid">
              <label className="pdv-field pdv-field--span-2">
                <span>Cliente</span>
                <div className="pdv-input-wrap">
                  <User size={16} />
                  <input
                    value={cliente}
                    onChange={(e) => setCliente(e.target.value)}
                    placeholder="Buscar ou selecionar cliente"
                  />
                </div>
              </label>

              <label className="pdv-field">
                <span>Código / barras</span>
                <div className="pdv-input-wrap">
                  <Barcode size={16} />
                  <input
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value)}
                    placeholder="Digite ou bipar"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") adicionarMock();
                    }}
                  />
                </div>
              </label>

              <button className="pdv-primary-button" onClick={adicionarMock}>
                Adicionar item
              </button>

              <label className="pdv-field pdv-field--span-2">
                <span>Busca rápida</span>
                <div className="pdv-input-wrap">
                  <Search size={16} />
                  <input placeholder="Buscar produto, serviço ou OS" />
                </div>
              </label>
            </div>

            <div className="pdv-shortcuts">
              <button className="pdv-shortcut">Tela</button>
              <button className="pdv-shortcut">Bateria</button>
              <button className="pdv-shortcut">Película</button>
              <button className="pdv-shortcut">Carregador</button>
              <button className="pdv-shortcut">Serviço rápido</button>
              <button className="pdv-shortcut">Acessórios</button>
            </div>
          </div>

          <div className="pdv-panel pdv-panel--grow">
            <div className="pdv-panel__header">
              <div>
                <h2>Itens da venda</h2>
                <p>{itens.length} item(ns) no atendimento atual.</p>
              </div>
              <div className="pdv-chip">
                <ShoppingCart size={15} />
                Venda em andamento
              </div>
            </div>

            <div className="pdv-items-head">
              <span>Item</span>
              <span>Qtd</span>
              <span>Unitário</span>
              <span>Total</span>
              <span></span>
            </div>

            <div className="pdv-items-list">
              {itens.map((item) => (
                <div key={item.id} className="pdv-item-row">
                  <div className="pdv-item-main">
                    <strong>{item.nome}</strong>
                    <small>{item.tipo}</small>
                  </div>

                  <div className="pdv-qty-box">
                    <button onClick={() => alterarQtd(item.id, -1)}>
                      <Minus size={14} />
                    </button>
                    <span>{item.qtd}</span>
                    <button onClick={() => alterarQtd(item.id, 1)}>
                      <Plus size={14} />
                    </button>
                  </div>

                  <div className="pdv-money">{formatMoney(item.valor)}</div>
                  <div className="pdv-money pdv-money--strong">
                    {formatMoney(item.qtd * item.valor)}
                  </div>

                  <button
                    className="pdv-icon-button pdv-icon-button--danger"
                    onClick={() => removerItem(item.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="pdv-focus__right">
          <div className="pdv-panel pdv-checkout">
            <div className="pdv-panel__header">
              <div>
                <h2>Fechamento</h2>
                <p>Resumo sempre visível e ação final rápida.</p>
              </div>
            </div>

            <div className="pdv-summary-grid">
              <div className="pdv-summary-card">
                <span>Produtos</span>
                <strong>{formatMoney(resumo.produtos)}</strong>
              </div>
              <div className="pdv-summary-card">
                <span>Serviços</span>
                <strong>{formatMoney(resumo.servicos)}</strong>
              </div>
              <div className="pdv-summary-card">
                <span>Subtotal</span>
                <strong>{formatMoney(resumo.subtotal)}</strong>
              </div>
              <div className="pdv-summary-card">
                <span>Desconto</span>
                <strong>{formatMoney(resumo.desconto)}</strong>
              </div>
            </div>

            <div className="pdv-total-box">
              <span>Total da venda</span>
              <strong>{formatMoney(resumo.total)}</strong>
            </div>

            <div className="pdv-form-stack">
              <label className="pdv-field">
                <span>Forma de pagamento</span>
                <select value={pagamento} onChange={(e) => setPagamento(e.target.value)}>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="pix">PIX</option>
                  <option value="cartao_credito">Cartão de crédito</option>
                  <option value="cartao_debito">Cartão de débito</option>
                </select>
              </label>

              <label className="pdv-field">
                <span>Valor recebido</span>
                <input
                  value={recebido}
                  onChange={(e) => setRecebido(e.target.value)}
                  placeholder="0,00"
                />
              </label>

              <div className="pdv-troco-box">
                <span>Troco</span>
                <strong>{formatMoney(resumo.troco)}</strong>
              </div>
            </div>

            <div className="pdv-actions">
              <button className="pdv-primary-button pdv-primary-button--lg">
                <CreditCard size={18} />
                Finalizar venda
              </button>
              <button className="pdv-secondary-button">Salvar orçamento</button>
              <button className="pdv-secondary-button pdv-secondary-button--danger">
                Cancelar venda
              </button>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
