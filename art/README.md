# Arte ASCII

Cole a arte no `.txt` e pronto. Nada de código precisa mudar: o
`scripts/build-fs.mjs` lê esta pasta no build e gera `src/generated/art.json`,
que o boot importa.

O arquivo é cru justamente para isso — num `.ts` seria preciso escapar barra
invertida e crase a cada troca, e a maioria das fontes figlet é feita de barra
invertida.

| Arquivo | Onde aparece |
|---|---|
| `banner.txt` | o banner da sequência de boot |

## Trocando

1. Cole a arte nova por cima do conteúdo do arquivo.
2. `npm run fs` (ou só `npm run dev`, que já roda isso antes).

A saída do script mostra as dimensões, para conferir de relance:

```
[build-fs] arte: banner 69x13 → src/generated/art.json
```

## O que o build faz por você

- Tira espaço à direita de cada linha.
- Tira linha em branco no começo e no fim. Linha em branco no **meio** fica —
  é o que separa dois blocos empilhados.

## Largura

**Se a arte não couber na tela, o boot não a imprime** — mostra `OLuizFernando`
em texto. Arte embrulhada não fica menor, fica quebrada.

Um terminal a 14px numa janela de notebook dá uns 150 colunas; a 80 colunas,
que é o mínimo clássico, cabe a arte atual de 69. Celular fica bem abaixo disso
e cai no texto, que é o comportamento desejado.

## A fonte

A atual é a **ANSI Shadow**, gerada com [figlet](http://www.figlet.org) —
`figlet -f "ANSI Shadow" OLuiz`, ou o [patorjk](http://patorjk.com/software/taag/),
que tem a fonte no seletor.

O nome inteiro numa linha só dá **106 colunas**, larga demais para 80. Por isso
está empilhado em `OLuiz` / `Fernando`. Se preferir numa linha, é só colar — o
fallback cuida de quem tiver tela estreita.

A ANSI Shadow usa blocos (`█`) e box-drawing (`╗ ╔ ═ ║`). A JetBrains Mono cobre
os dois nativamente, sem precisar de variante Nerd Font.
