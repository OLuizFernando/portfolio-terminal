FinTrack

Um controle de finanças pessoais. Receitas e despesas entram com categoria,
valor e título, e saem como resumos mensais e gráficos.

Flask e templates renderizados no servidor, com Postgres por baixo. Escrito
antes de eu recorrer a um framework de frontend, o que acabou sendo a parte
útil: cada página é um formulário, uma query e um arquivo HTML, e nada se
esconde atrás de um build step.
