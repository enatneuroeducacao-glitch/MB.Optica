# Migração BeepStart → MB Óptica

## Fonte auditada

Backup: `Backup - 2026-09-25_03h.db`

Total de registros: **5.785**.

O backup permanece como fonte histórica. Nenhum dado bruto do backup deve ser versionado no repositório.

## Volume por coleção

| Coleção | Registros |
|---|---:|
| Lote | 1.479 |
| Movimentacao | 629 |
| Produto | 617 |
| EnderecoLocal | 493 |
| Venda | 474 |
| Caixa | 474 |
| Cliente | 470 |
| ContaAPagar | 335 |
| Preco | 321 |
| Sangria | 146 |
| ContaAReceber | 120 |
| Reforco | 84 |
| Categoria | 33 |
| Credor | 29 |
| Fornecedor | 25 |
| MeioPG | 13 |
| ContaBancaria | 10 |
| Ordem | 9 |
| Evento | 7 |
| Usuario | 3 |
| CheckList | 2 |
| Compra | 2 |
| Etiqueta | 2 |
| Servico | 2 |
| Equipamento | 1 |
| Entregador | 1 |
| Loja | 1 |
| Veiculo | 1 |
| Configuracoes | 1 |

## Integridade referencial auditada

Todas as referências abaixo existentes no backup foram encontradas no conjunto de destino:

- Venda → Cliente: 457/457
- Venda → Usuario: 474/474
- Venda → EnderecoLocal: 364/364
- Produto → Categoria: 582/582
- Produto → Fornecedor: 551/551
- Lote → Produto: 1.467/1.467
- Lote → Venda: 716/716
- Ordem → Cliente: 9/9
- Ordem → Venda: 5/5

Não foram encontrados vínculos órfãos nessas relações.

## Estratégia

1. Auditoria somente leitura.
2. Normalização para o domínio MB Óptica.
3. Preservação do registro original em `LegacyRecord`.
4. Validação de referências antes da gravação.
5. Importação transacional por domínio.
6. Relatório de erros e registros ignorados.
7. Reconciliação de totais após a importação.

## Regras

- Não copiar o modelo de dados do BeepStart.
- Não gravar dados brutos diretamente nas entidades novas.
- Não apagar registros legados.
- Não transformar uma inconsistência silenciosamente.
- Toda exceção de transformação deve ser registrada.
- A importação definitiva somente deve ocorrer após a prévia de transformação ser aprovada.

## Comandos

Auditoria:

`npm run audit:beepstart -- ./backup.json`

Prévia de transformação:

`npm run transform:beepstart -- ./backup.json --out=./migration-preview.json`

A prévia não grava dados no banco.
