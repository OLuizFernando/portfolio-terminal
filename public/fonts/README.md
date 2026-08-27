# JetBrains Mono

Os dois pesos que o terminal usa, auto-hospedados. Nada aqui é gerado pelo build:
são os arquivos do release oficial, colados e versionados como os do DOOM.

| Arquivo | Peso |
|---|---|
| `JetBrainsMono-Regular.woff2` | 400 |
| `JetBrainsMono-Bold.woff2` | 700 |

Vieram de `fonts/webfonts/` do
[release v2.304](https://github.com/JetBrains/JetBrainsMono/releases/tag/v2.304),
e não do Google Fonts: **o subset do Google não tem os blocos (`█`) nem o
box-drawing (`╗ ═ ║`)**, que são a matéria-prima do banner do boot. Sem eles o
navegador cai em outra fonte no meio da arte e o alinhamento desmorona.

Licença SIL Open Font License 1.1 — `OFL.txt`, que a licença exige distribuir
junto.

## Trocando de versão

Baixe o zip do release, tire os dois `.woff2` de `fonts/webfonts/` e cole por
cima. Confira depois que `█` continua com a mesma largura de `M`: é isso que
mantém a arte ASCII alinhada.
