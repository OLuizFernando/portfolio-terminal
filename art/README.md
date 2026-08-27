# Arte ASCII

Cole a arte no `.txt` e pronto. Nada de código precisa mudar: o
`scripts/build-fs.mjs` lê esta pasta no build e gera `src/generated/art.json`,
que o boot importa.

O arquivo é cru justamente para isso — num `.ts` seria preciso escapar barra
invertida e crase a cada troca, e a maioria das fontes figlet é feita de barra
invertida.

| Arquivo | Largura | Quando aparece |
|---|---|---|
| `banner.txt` | 106 | telas largas (janela de notebook) |
| `banner-small.txt` | 27 | telas estreitas (celular, janela pequena) |

## Trocando

1. Cole a arte nova por cima do conteúdo do arquivo.
2. `npm run fs` (ou só `npm run dev`, que já roda isso antes).

A saída do script mostra as dimensões de cada uma, para conferir de relance:

```
[build-fs] arte: banner-small 27x3, banner 106x6 → src/generated/art.json
```

## Como o boot escolhe

**Todo arquivo cujo nome comece com `banner` é candidato.** O boot mede a tela e
usa a **maior arte que couber inteira**. Se nem a menor couber, ele imprime
`OLuizFernando` por extenso.

A arte nunca é embrulhada: embrulhada ela não fica menor, fica quebrada.

**Para acrescentar um tamanho intermediário, basta colar mais um arquivo** —
`banner-medium.txt`, `banner-tiny.txt`, o nome não importa desde que comece com
`banner`. O boot ordena por largura sozinho e nada no código muda.

### Larguras de referência

| Tela | Colunas aproximadas |
|---|---|
| Celular em pé | 40-46 |
| Terminal clássico | 80 |
| Janela de notebook | 150+ |

A conta é `largura em px ÷ (tamanho da fonte × 0,6)` — a JetBrains Mono avança
0,6em por caractere. A 14px, cada coluna tem 8,4px.

## O que o build faz por você

- Tira espaço à direita de cada linha.
- Tira linha em branco no começo e no fim. Linha em branco no **meio** fica —
  é o que separa dois blocos empilhados.

## As fontes atuais

Geradas com [figlet](http://www.figlet.org) ou pelo
[patorjk](http://patorjk.com/software/taag/), que tem as duas no seletor:

- `banner.txt` — **ANSI Shadow**. Usa blocos (`█`) e box-drawing (`╗ ╔ ═ ║`),
  que a JetBrains Mono cobre nativamente, sem variante Nerd Font.
- `banner-small.txt` — **Digital**. Só ASCII. Escolhida por continuar legível a
  27 colunas, que é o que importa nesse tamanho.
